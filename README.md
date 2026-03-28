<p align="center">
  <img src="public/clawworks.png" alt="ClawWorks" width="120" />
</p>

<h1 align="center">ClawWorks</h1>

Manage a team of Claude Code agents from your browser. Each agent runs in its own terminal with a unique persona and can communicate with teammates via the Claude Peers MCP server.

## Features

- **Workspaces** — organize agents into named workspaces, create/rename/delete them
- **Multi-agent grid** — spawn multiple agents per workspace in a responsive grid layout (1-6+ agents)
- **Persona system** — each agent gets a random name and one of three personality templates (damien-voss, shy-guy, average-joe)
- **Agent communication** — agents discover and message each other via claude-peers MCP
- **Folder picker** — choose which directory each agent works in
- **Auto-initialization** — agents auto-launch Claude Code, accept prompts, and introduce themselves
- **Graceful shutdown** — agents say goodbye to peers before being terminated
- **Persistent state** — workspaces and terminals are stored in SQLite, surviving restarts
- **Startup checks** — splash screen verifies Claude Code and Claude Peers are available

## Tech Stack

- **Next.js** (App Router) with TypeScript and Tailwind CSS
- **xterm.js** for browser-side terminal emulation
- **node-pty** for spawning real PTY shell processes
- **WebSocket** (`ws`) for real-time browser-to-shell communication
- **better-sqlite3** for workspace and terminal persistence
- **claude-peers-mcp** for agent-to-agent messaging via MCP

## Prerequisites

- [Node.js](https://nodejs.org/) (v22+)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the splash screen will verify Claude Code is installed, then show a usage disclaimer. Click **Agree** to enter the app.

## How It Works

1. A custom Node.js server (`server.ts`) serves the Next.js frontend and exposes a WebSocket endpoint at `/api/terminal`
2. When you create an agent, the server spawns a PTY process, auto-runs `claude` with a persona and MCP config
3. The server's state machine auto-accepts trust prompts and development channel warnings
4. Agents connect to the claude-peers broker (port 7999) to discover and message each other
5. The browser renders each agent in an xterm.js terminal with status overlays and graceful shutdown

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/system-check` | Environment health check (Claude Code, Claude Peers) |
| `GET` | `/api/dirs` | Directory listing for folder picker |
| `GET` | `/api/personas` | Available persona templates |
| `GET` | `/api/state` | Full app state (workspaces + terminals) |
| `POST` | `/api/workspaces` | Create a workspace |
| `PATCH` | `/api/workspaces/:id` | Rename a workspace |
| `DELETE` | `/api/workspaces/:id` | Delete a workspace |
| `DELETE` | `/api/terminals/:id` | Delete a terminal |
| `WS` | `/api/terminal` | WebSocket — spawns a PTY session |

## Project Structure

```
server.ts                       # Custom server (WebSocket, REST API, auto-interaction)
src/
  app/
    layout.tsx                  # Root layout with font imports (Inter, JetBrains Mono)
    page.tsx                    # Main page (workspaces, tabs, splash screen)
    globals.css                 # Global styles, Tailwind theme tokens
  components/
    Button.tsx                  # Reusable button (6 variants, 3 sizes)
    SplashScreen.tsx            # Startup environment checks
    Sidebar.tsx                 # Workspace navigation
    TerminalGrid.tsx            # Multi-agent grid layout
    Terminal.tsx                # xterm.js terminal wrapper
    FolderPicker.tsx            # Directory browser
  lib/
    tab-names.ts               # Random workspace name generator
    db.ts                      # SQLite database (workspaces, terminals)
claude-peers/                   # Bundled claude-peers MCP server (port 7999)
static/persona/                 # Agent persona templates
public/clawworks.png            # Logo
```
