import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { mkdtempSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import next from "next";
import { parse } from "url";
import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import { getDb, getAllState, insertWorkspace, updateWorkspaceName, deleteWorkspace, insertTerminal, deleteTerminal } from "./src/lib/db";

const PERSONA_NAMES = [
  "Damien Voss", "Marcus Hale", "Viktor Sable", "Adrian Cross", "Roman Ashe",
  "Lucian Drak", "Soren Vex", "Nikolai Frost", "Dorian Kael", "Cassian Wolfe",
  "Ezra Thorne", "Levi Rune", "Orion Steele", "Felix Ashworth", "Tobias Crane",
];

function buildClaudeCommand(workspaceId?: string, requestedName?: string, persona: string = "damien-voss"): { command: string; name: string; tempPersonaPath: string; tempMcpConfigPath: string } {
  const personaPath = join(process.cwd(), "static", "persona", `${persona}.md`);
  const raw = readFileSync(personaPath, "utf-8");
  const name = requestedName || PERSONA_NAMES[Math.floor(Math.random() * PERSONA_NAMES.length)];
  const content = raw.replace(/\<\$NAME\>/g, name);
  // Write persona with name substituted to a temp file
  const tempDir = mkdtempSync(join(tmpdir(), "claude-persona-"));
  const tempPersonaPath = join(tempDir, "persona.md");
  writeFileSync(tempPersonaPath, content);
  // Write MCP config to a per-agent temp file (avoids race conditions)
  const peerServerPath = join(process.cwd(), "claude-peers", "server.ts");
  const peerDbPath = join(process.cwd(), "claude-peers", "peers.db");
  const tsxPath = join(process.cwd(), "node_modules", ".bin", "tsx");
  const mcpTempDir = mkdtempSync(join(tmpdir(), "claude-mcp-"));
  const tempMcpConfigPath = join(mcpTempDir, "mcp-config.json");
  writeFileSync(tempMcpConfigPath, JSON.stringify({
    mcpServers: {
      "claude-peers": {
        command: tsxPath,
        args: [peerServerPath],
        env: {
          CLAUDE_PEERS_PORT: "7999",
          CLAUDE_PEERS_DB: peerDbPath,
          CLAUDE_PEERS_TSX: tsxPath,
          ...(workspaceId ? { CLAUDE_PEERS_WORKSPACE_ID: workspaceId } : {}),
        },
      },
    },
  }, null, 2));
  return { command: `claude --model sonnet --append-system-prompt-file "${tempPersonaPath}" --mcp-config "${tempMcpConfigPath}" --dangerously-load-development-channels server:claude-peers`, name, tempPersonaPath, tempMcpConfigPath };
}

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// Initialize database on startup
getDb();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsed = parse(req.url!, true);

    // API: system checks
    if (parsed.pathname === "/api/system-check") {
      res.setHeader("Content-Type", "application/json");
      const checks: { name: string; status: string; detail: string }[] = [];

      // Check: Claude Code installed
      try {
        const version = execSync("claude --version", { timeout: 5000, encoding: "utf-8" }).trim();
        checks.push({ name: "Claude Code", status: "ok", detail: version });
      } catch {
        checks.push({ name: "Claude Code", status: "error", detail: "Not installed. Run: npm install -g @anthropic-ai/claude-code" });
      }

      res.end(JSON.stringify({ checks }));
      return;
    }

    // API: list directories
    if (parsed.pathname === "/api/dirs") {
      const rawDir = (parsed.query.path as string) || "~";
      const dir = rawDir === "~" ? (process.env.HOME || "/") : rawDir;
      res.setHeader("Content-Type", "application/json");
      try {
        const entries = readdirSync(dir)
          .filter((name) => {
            if (name.startsWith(".")) return false;
            try {
              return statSync(join(dir, name)).isDirectory();
            } catch {
              return false;
            }
          })
          .sort();
        res.end(JSON.stringify({ path: dir, dirs: entries }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Cannot read directory" }));
      }
      return;
    }

    // API: list available personas
    if (parsed.pathname === "/api/personas" && req.method === "GET") {
      const personaDir = join(process.cwd(), "static", "persona");
      try {
        const files = readdirSync(personaDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, ""))
          .sort();
        json(res, { personas: files });
      } catch {
        json(res, { personas: [] });
      }
      return;
    }

    // API: get full state (workspaces + terminals)
    if (parsed.pathname === "/api/state" && req.method === "GET") {
      json(res, { workspaces: getAllState() });
      return;
    }

    // API: create workspace
    if (parsed.pathname === "/api/workspaces" && req.method === "POST") {
      const body = await readJsonBody(req);
      insertWorkspace(body.id as string, body.name as string);
      json(res, { ok: true }, 201);
      return;
    }

    // API: rename/delete workspace
    const wsMatch = parsed.pathname?.match(/^\/api\/workspaces\/([^/]+)$/);
    if (wsMatch) {
      const id = decodeURIComponent(wsMatch[1]);
      if (req.method === "PATCH") {
        const body = await readJsonBody(req);
        updateWorkspaceName(id, body.name as string);
        json(res, { ok: true });
        return;
      }
      if (req.method === "DELETE") {
        deleteWorkspace(id);
        json(res, { ok: true });
        return;
      }
    }

    // API: delete terminal
    const termMatch = parsed.pathname?.match(/^\/api\/terminals\/([^/]+)$/);
    if (termMatch && req.method === "DELETE") {
      const id = decodeURIComponent(termMatch[1]);
      deleteTerminal(id);
      json(res, { ok: true });
      return;
    }

    handle(req, res, parsed);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url!, true);
    if (pathname === "/api/terminal") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      // Let Next.js handle HMR and other WebSocket upgrades
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  wss.on("connection", (ws: WebSocket, req) => {
    const { query } = parse(req.url!, true);
    const rawCwd = (query.cwd as string) || "~";
    const cwd = rawCwd === "~" ? (process.env.HOME || "/") : rawCwd;
    const terminalId = query.terminalId as string | undefined;
    const workspaceId = query.workspaceId as string | undefined;
    const requestedName = query.personaName as string | undefined;
    const persona = (query.persona as string) || "damien-voss";
    const resumeSession = query.resume as string | undefined;
    const shell = process.env.SHELL || "zsh";
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    });

    const { command: claudeCommand, name: personaName, tempPersonaPath, tempMcpConfigPath } = buildClaudeCommand(workspaceId, requestedName, persona);

    // For resume, build command with --resume flag
    const resumeCommand = resumeSession
      ? `claude --model sonnet --resume "${resumeSession}" --append-system-prompt-file "${tempPersonaPath}" --mcp-config "${tempMcpConfigPath}" --dangerously-load-development-channels server:claude-peers`
      : null;

    // Send persona name as metadata to client (for new terminals)
    if (!resumeSession) {
      ws.send(`\x01meta:${JSON.stringify({ personaName })}`);
    }

    // State machine for auto-interaction
    let outputBuffer = "";
    let claudeLaunched = false;
    let trustHandled = false;
    let channelsHandled = false;
    let renameSent = resumeSession ? true : false;
    let promptSent = false;
    const renameHash = randomBytes(3).toString("hex");
    const sentinel = `__READY_${randomBytes(8).toString("hex")}__`;

    ptyProcess.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }

      // Stop watching once everything is done
      if (promptSent) return;

      outputBuffer += data;
      if (outputBuffer.length > 4000) {
        outputBuffer = outputBuffer.slice(-4000);
      }

      const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b[^a-zA-Z]*[a-zA-Z]/g, "");

      // Stage 0: detect shell ready (sentinel output), send claude command
      if (!claudeLaunched && clean.includes(sentinel)) {
        claudeLaunched = true;
        outputBuffer = "";
        setTimeout(() => {
          const cmd = resumeCommand || claudeCommand;
          ptyProcess.write(cmd + "\r");
          // Clean up temp files after command is sent
          setTimeout(() => {
            try { unlinkSync(tempPersonaPath); } catch {}
            try { unlinkSync(tempMcpConfigPath); } catch {}
          }, 5000);
        }, 200);
        return;
      }

      // Stage 1a: auto-accept trust prompt
      if (claudeLaunched && !trustHandled && clean.includes("Itrustthisfolder")) {
        trustHandled = true;
        outputBuffer = "";
        setTimeout(() => ptyProcess.write("\r"), 100);
        return;
      }

      // Stage 1b: auto-accept development channels warning (can appear before or after trust prompt)
      if (claudeLaunched && !channelsHandled && clean.includes("Iamusingthisforlocaldevelopment")) {
        channelsHandled = true;
        outputBuffer = "";
        setTimeout(() => ptyProcess.write("\r"), 100);
        return;
      }

      // Stage 2: detect Claude Code ready (❯ prompt), send /rename command
      // After trust/channels handled, just look for ❯. If neither appeared, require Welcome/ClaudeCode too.
      if (claudeLaunched && !renameSent && clean.includes("❯")) {
        const afterPrompts = trustHandled || channelsHandled;
        const hasClaude = clean.includes("ClaudeCode") || clean.includes("Welcome");
        if (afterPrompts || hasClaude) {
          renameSent = true;
          outputBuffer = "";
          setTimeout(() => {
            ptyProcess.write(`/rename ${personaName.replace(/\s+/g, "-")}-${renameHash}\r`);
          }, 100);
        }
      }

      // Stage 3: after rename (or resume ready), wait for ❯ prompt again, then signal ready
      if (renameSent && !promptSent && clean.includes("❯")) {
        promptSent = true;
        outputBuffer = "";
        // For new terminals, save to DB and send hash
        if (!resumeSession && terminalId && workspaceId) {
          try { insertTerminal(terminalId, workspaceId, rawCwd, personaName, renameHash, persona); } catch {}
          ws.send(`\x01meta:${JSON.stringify({ renameHash, ready: true })}`);
        } else {
          ws.send(`\x01meta:${JSON.stringify({ ready: true })}`);
        }
      }
    });

    // Send sentinel command to detect shell readiness (shell-agnostic)
    ptyProcess.write(`echo ${sentinel}\r`);

    ws.on("message", (msg: Buffer | string) => {
      const message = msg.toString();

      // Handle resize messages
      if (message.startsWith("\x01resize:")) {
        const [cols, rows] = message
          .slice(8)
          .split(",")
          .map(Number);
        ptyProcess.resize(cols, rows);
        return;
      }

      ptyProcess.write(message);
    });

    ws.on("close", () => {
      ptyProcess.kill();
    });

    ptyProcess.onExit(() => {
      ws.close();
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
