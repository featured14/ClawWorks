@AGENTS.md

# ClawWorks

## Project Overview

A web application for managing a team of Claude Code agents. Each agent runs in its own browser-based terminal with a unique persona and can communicate with other agents via the Claude Peers MCP server. Users create workspaces, spawn agents, and watch them collaborate.

## Architecture

- **Frontend**: Next.js (App Router) with TypeScript and Tailwind CSS
- **Backend**: Custom Node.js HTTP server (`server.ts`) wrapping Next.js, with:
  - WebSocket endpoint (`/api/terminal`) that spawns PTY shell processes using `node-pty`
  - REST endpoints: `/api/system-check` (health checks), `/api/dirs` (directory browsing)
- **Terminal UI**: xterm.js for the browser-side terminal emulator, connected to the backend via WebSocket
- **Agent Communication**: [claude-peers-mcp](https://github.com/louislva/claude-peers-mcp) bundled in `claude-peers/` — enables agents to discover, message, and collaborate with each other via MCP tools
- **Persona System**: Agents are assigned random names from a persona template (`static/persona/damien-voss.md`) with `<$NAME>` placeholder replacement at spawn time

## Key Components

- `server.ts` — Custom server with PTY spawning, auto-interaction state machine (trust prompt, dev channels, initial prompt), persona/MCP command builder
- `src/app/page.tsx` — Main page with workspace/tab management, splash screen gate
- `src/components/SplashScreen.tsx` — Startup checks (Claude Code, Claude Peers)
- `src/components/Sidebar.tsx` — Workspace list with create/delete/rename
- `src/components/TerminalGrid.tsx` — Multi-terminal grid layout with agent labels, overlays, graceful shutdown
- `src/components/Terminal.tsx` — xterm.js wrapper with WebSocket, command injection, output watching
- `src/components/FolderPicker.tsx` — Directory browser for choosing agent working directory
- `src/lib/tab-names.ts` — Random workspace name generator
- `claude-peers/` — Bundled MCP server for agent-to-agent communication (port 7999)

## Design System

### Color Palette

All palette colors are defined as Tailwind `@theme` tokens in `src/app/globals.css`. Use token names (e.g. `bg-forge-black`) instead of arbitrary hex values.

| Token | Hex | Usage |
|-------|-----|-------|
| `forge-black` | #111318 | Main dark background |
| `forge-mid` | #161A21 | Sidebar, topbar, secondary panels |
| `charcoal` | #1A1F26 | Cards, modals, terminal containers |
| `burnt-orange` | #F26A21 | Primary brand accent, action buttons |
| `deep-forge` | #C84E14 | Hover/pressed state for primary accent |
| `steel-blue` | #3E6F95 | Secondary accent (greeting buttons, links) |
| `cool-steel` | #5F88A8 | Hover state for secondary accent |
| `border-subtle` | #1E2530 | Subtle separators (sidebar edge, section dividers) |
| `border-default` | #2A3140 | Standard borders |
| `border-hover` | #3A4556 | Hover/active borders |
| `border-focus` | #4A5568 | Focus ring borders |
| `neutral-btn` | #2A3140 | Neutral button backgrounds |
| `neutral-btn-hover` | #344054 | Neutral button hover |
| `neutral-dim` | #1E2530 | Dimmed badge backgrounds |

Semantic colors kept from Tailwind defaults: `text-zinc-*` for text, `red-*` for destructive actions, `emerald-*` for success states, `black/*` for overlays.

### Typography

**Primary UI font — Inter** (loaded via `next/font/google` in `layout.tsx`)
- 600 weight: section titles, app labels, wordmark
- 500 weight: buttons, navigation
- 400 weight: body text

**Secondary mono font — JetBrains Mono** (loaded via `next/font/google` in `layout.tsx`)
- Used for: terminal output (xterm.js), logs, session IDs, branch names, command snippets
- 400 weight: logs and terminal
- 500 weight: badges, emphasized system values

**Rule**: Inter everywhere by default. JetBrains Mono only where the UI acts like a terminal or system console.

**Fallback stacks** (defined in `globals.css`):
- Sans: `"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`

### Buttons

All buttons use the `<Button>` component from `src/components/Button.tsx`. Never use raw `<button>` elements for action buttons — use the component with the appropriate variant and size.

**Feel**: precise, compact, operational, high-contrast, slightly industrial. Not soft, bubbly, or generic SaaS.

**Component** — `src/components/Button.tsx`

```tsx
<Button variant="primary" size="md" icon={<Icon />}>Label</Button>
```

**Props**: `variant`, `size`, `icon`, `iconOnly`, plus all native button attributes. Composable via `className` for layout (e.g. `w-full`, `mt-2`).

#### Variants

| Variant | Use for | Visual |
|---------|---------|--------|
| `primary` | Launch, Create, Confirm, Shout, Commit | Burnt orange bg, warm white text |
| `secondary` | Open, View, Cancel, navigation actions | Charcoal bg, subtle border, border shifts to steel-blue on hover |
| `ghost` | Dismiss, icon-only buttons, inline utilities | Transparent bg, muted text, faint bg on hover |
| `system` | Topology, coordination, inspection, structural actions | Steel-blue tinted bg, steel-blue border |
| `danger` | Delete, Remove, Stop, Kill, Disconnect | Muted red bg (`rgba(180,56,40,...)`), salmon text — serious, not loud |
| `success` | Approved, Completed, Merged, confirmed states | Muted green bg, mint text |

#### Sizes

| Size | Height | Padding | Font | Use |
|------|--------|---------|------|-----|
| `sm` | 32px | 12px | 13px/500 | Toolbars, agent cards, compact actions |
| `md` | 40px | 16px | 14px/500 | Default action size |
| `lg` | 48px | 20px | 15px/600 | Hero CTAs, major entry points |

#### Icon buttons

- `icon` prop for leading icon (16px, 8px gap)
- `iconOnly` makes width equal to height (square button)

#### States

Every button has: default, hover, active, focus-visible (steel-blue ring), disabled (muted bg/text/border, `cursor-not-allowed`).

#### Hierarchy rules

- **One orange primary max** per toolbar/section — orange is reserved for launch, commit, create, confirm, active execution
- Default non-destructive actions use `secondary`
- System-level structural actions (topology, inspect, coordination) use `system` — not orange
- Destructive actions always use `danger` — never bright `bg-red-600`
- In terminal/log surfaces, prefer compact `ghost` or `sm` variants

#### CSS tokens

All button design tokens are CSS custom properties (`--btn-*`) defined in `globals.css` under `:root`. The `Button` component references these via Tailwind arbitrary values. When adding new button styles, extend the tokens — don't use arbitrary hex values.

## Running

- `npm run dev` — starts the custom server (via `tsx server.ts`) on port 3000
- Requires: Node.js, Claude Code CLI installed

## Environment

- Claude Peers MCP runs on port 7999 (`CLAUDE_PEERS_PORT`)
- Peers database stored at `claude-peers/peers.db` (`CLAUDE_PEERS_DB`)
