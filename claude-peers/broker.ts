#!/usr/bin/env tsx
/**
 * claude-peers broker daemon
 *
 * A singleton HTTP server on localhost:7899 backed by SQLite.
 * Tracks all registered Claude Code peers and routes messages between them.
 *
 * Auto-launched by the MCP server if not already running.
 * Run directly: tsx broker.ts
 */

import Database from "better-sqlite3";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type {
  RegisterRequest,
  RegisterResponse,
  HeartbeatRequest,
  SetSummaryRequest,
  ListPeersRequest,
  SendMessageRequest,
  PollMessagesRequest,
  PollMessagesResponse,
  Peer,
  Message,
} from "./shared/types.ts";

const PORT = parseInt(process.env.CLAUDE_PEERS_PORT ?? "7899", 10);
const DB_PATH = process.env.CLAUDE_PEERS_DB ?? `${process.env.HOME}/.claude-peers.db`;

// --- Database setup ---

const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA busy_timeout = 3000");

db.exec(`
  CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY,
    pid INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    git_root TEXT,
    tty TEXT,
    summary TEXT NOT NULL DEFAULT '',
    registered_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )
`);

// Migration: add workspace_id column if not present
try {
  db.exec("ALTER TABLE peers ADD COLUMN workspace_id TEXT");
} catch {
  // Column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    text TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (from_id) REFERENCES peers(id),
    FOREIGN KEY (to_id) REFERENCES peers(id)
  )
`);

// Clean up stale peers (PIDs that no longer exist) on startup
function cleanStalePeers() {
  const peers = db.prepare("SELECT id, pid FROM peers").all() as { id: string; pid: number }[];
  for (const peer of peers) {
    try {
      // Check if process is still alive (signal 0 doesn't kill, just checks)
      process.kill(peer.pid, 0);
    } catch {
      // Process doesn't exist — remove messages first (FK), then the peer
      db.prepare("DELETE FROM messages WHERE from_id = ? OR to_id = ?").run(peer.id, peer.id);
      db.prepare("DELETE FROM peers WHERE id = ?").run(peer.id);
    }
  }
}

cleanStalePeers();

// Periodically clean stale peers (every 30s)
setInterval(cleanStalePeers, 30_000);

// --- Prepared statements ---

const insertPeer = db.prepare(`
  INSERT INTO peers (id, pid, cwd, git_root, tty, summary, workspace_id, registered_at, last_seen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateLastSeen = db.prepare(`
  UPDATE peers SET last_seen = ? WHERE id = ?
`);

const updateSummary = db.prepare(`
  UPDATE peers SET summary = ? WHERE id = ?
`);

const deletePeer = db.prepare(`
  DELETE FROM peers WHERE id = ?
`);

const selectAllPeers = db.prepare(`
  SELECT * FROM peers
`);

const selectPeersByDirectory = db.prepare(`
  SELECT * FROM peers WHERE cwd = ?
`);

const selectPeersByGitRoot = db.prepare(`
  SELECT * FROM peers WHERE git_root = ?
`);

const selectPeersByWorkspace = db.prepare(`
  SELECT * FROM peers WHERE workspace_id = ?
`);

const selectPeersByWorkspaceAndDirectory = db.prepare(`
  SELECT * FROM peers WHERE workspace_id = ? AND cwd = ?
`);

const selectPeersByWorkspaceAndGitRoot = db.prepare(`
  SELECT * FROM peers WHERE workspace_id = ? AND git_root = ?
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (from_id, to_id, text, sent_at, delivered)
  VALUES (?, ?, ?, ?, 0)
`);

const selectUndelivered = db.prepare(`
  SELECT * FROM messages WHERE to_id = ? AND delivered = 0 ORDER BY sent_at ASC
`);

const markDelivered = db.prepare(`
  UPDATE messages SET delivered = 1 WHERE id = ?
`);

// --- Generate peer ID ---

function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// --- Request handlers ---

function handleRegister(body: RegisterRequest): RegisterResponse {
  const id = generateId();
  const now = new Date().toISOString();

  // Remove any existing registration for this PID (re-registration)
  const existing = db.prepare("SELECT id FROM peers WHERE pid = ?").get(body.pid) as { id: string } | null;
  if (existing) {
    deletePeer.run(existing.id);
  }

  insertPeer.run(id, body.pid, body.cwd, body.git_root, body.tty, body.summary, body.workspace_id ?? null, now, now);
  return { id };
}

function handleHeartbeat(body: HeartbeatRequest): void {
  updateLastSeen.run(new Date().toISOString(), body.id);
}

function handleSetSummary(body: SetSummaryRequest): void {
  updateSummary.run(body.summary, body.id);
}

function handleListPeers(body: ListPeersRequest): Peer[] {
  let peers: Peer[];
  const ws = body.workspace_id;

  if (ws) {
    // Workspace-scoped queries
    switch (body.scope) {
      case "machine":
        peers = selectPeersByWorkspace.all(ws) as Peer[];
        break;
      case "directory":
        peers = selectPeersByWorkspaceAndDirectory.all(ws, body.cwd) as Peer[];
        break;
      case "repo":
        if (body.git_root) {
          peers = selectPeersByWorkspaceAndGitRoot.all(ws, body.git_root) as Peer[];
        } else {
          peers = selectPeersByWorkspaceAndDirectory.all(ws, body.cwd) as Peer[];
        }
        break;
      default:
        peers = selectPeersByWorkspace.all(ws) as Peer[];
    }
  } else {
    // Unfiltered (admin/CLI mode)
    switch (body.scope) {
      case "machine":
        peers = selectAllPeers.all() as Peer[];
        break;
      case "directory":
        peers = selectPeersByDirectory.all(body.cwd) as Peer[];
        break;
      case "repo":
        if (body.git_root) {
          peers = selectPeersByGitRoot.all(body.git_root) as Peer[];
        } else {
          peers = selectPeersByDirectory.all(body.cwd) as Peer[];
        }
        break;
      default:
        peers = selectAllPeers.all() as Peer[];
    }
  }

  // Exclude the requesting peer
  if (body.exclude_id) {
    peers = peers.filter((p) => p.id !== body.exclude_id);
  }

  // Verify each peer's process is still alive
  return peers.filter((p) => {
    try {
      process.kill(p.pid, 0);
      return true;
    } catch {
      // Clean up dead peer
      deletePeer.run(p.id);
      return false;
    }
  });
}

function handleSendMessage(body: SendMessageRequest): { ok: boolean; error?: string } {
  // Verify target exists
  const target = db.prepare("SELECT id, workspace_id FROM peers WHERE id = ?").get(body.to_id) as { id: string; workspace_id: string | null } | null;
  if (!target) {
    return { ok: false, error: `Peer ${body.to_id} not found` };
  }

  // Block cross-workspace messaging
  const sender = db.prepare("SELECT workspace_id FROM peers WHERE id = ?").get(body.from_id) as { workspace_id: string | null } | null;
  if (sender?.workspace_id && target.workspace_id && sender.workspace_id !== target.workspace_id) {
    return { ok: false, error: "Cannot message peers in a different workspace" };
  }

  insertMessage.run(body.from_id, body.to_id, body.text, new Date().toISOString());
  return { ok: true };
}

function handlePollMessages(body: PollMessagesRequest): PollMessagesResponse {
  const messages = selectUndelivered.all(body.id) as Message[];

  // Mark them as delivered
  for (const msg of messages) {
    markDelivered.run(msg.id);
  }

  return { messages };
}

function handleUnregister(body: { id: string }): void {
  deletePeer.run(body.id);
}

// --- HTTP Server ---

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method !== "POST") {
    if (path === "/health") {
      jsonResponse(res, { status: "ok", peers: (selectAllPeers.all() as Peer[]).length });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("claude-peers broker");
    return;
  }

  try {
    const body = await readJsonBody(req);

    switch (path) {
      case "/register":
        jsonResponse(res, handleRegister(body as RegisterRequest));
        break;
      case "/heartbeat":
        handleHeartbeat(body as HeartbeatRequest);
        jsonResponse(res, { ok: true });
        break;
      case "/set-summary":
        handleSetSummary(body as SetSummaryRequest);
        jsonResponse(res, { ok: true });
        break;
      case "/list-peers":
        jsonResponse(res, handleListPeers(body as ListPeersRequest));
        break;
      case "/send-message":
        jsonResponse(res, handleSendMessage(body as SendMessageRequest));
        break;
      case "/poll-messages":
        jsonResponse(res, handlePollMessages(body as PollMessagesRequest));
        break;
      case "/unregister":
        handleUnregister(body as { id: string });
        jsonResponse(res, { ok: true });
        break;
      default:
        jsonResponse(res, { error: "not found" }, 404);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    jsonResponse(res, { error: msg }, 500);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`[claude-peers broker] listening on 127.0.0.1:${PORT} (db: ${DB_PATH})`);
});
