import Database from "better-sqlite3";
import { join } from "path";

const DB_PATH = join(process.cwd(), "clawworks.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 3000");

    db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terminals (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        persona_name TEXT NOT NULL,
        rename_hash TEXT NOT NULL,
        persona TEXT NOT NULL DEFAULT 'damien-voss',
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Migration: add persona column if missing
    const cols = db.prepare("PRAGMA table_info(terminals)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "persona")) {
      db.exec("ALTER TABLE terminals ADD COLUMN persona TEXT NOT NULL DEFAULT 'damien-voss'");
    }
  }
  return db;
}

export interface DbWorkspace {
  id: string;
  name: string;
}

export interface DbTerminal {
  id: string;
  workspace_id: string;
  cwd: string;
  persona_name: string;
  rename_hash: string;
  persona: string;
}

export function getAllState(): (DbWorkspace & { terminals: DbTerminal[] })[] {
  const d = getDb();
  const workspaces = d.prepare("SELECT id, name FROM workspaces").all() as DbWorkspace[];
  const terminals = d.prepare("SELECT id, workspace_id, cwd, persona_name, rename_hash, persona FROM terminals").all() as DbTerminal[];

  const terminalsByWs = new Map<string, DbTerminal[]>();
  for (const t of terminals) {
    const arr = terminalsByWs.get(t.workspace_id) || [];
    arr.push(t);
    terminalsByWs.set(t.workspace_id, arr);
  }

  return workspaces.map((w) => ({
    ...w,
    terminals: terminalsByWs.get(w.id) || [],
  }));
}

export function insertWorkspace(id: string, name: string): void {
  getDb().prepare("INSERT INTO workspaces (id, name) VALUES (?, ?)").run(id, name);
}

export function updateWorkspaceName(id: string, name: string): void {
  getDb().prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(name, id);
}

export function deleteWorkspace(id: string): void {
  getDb().prepare("DELETE FROM workspaces WHERE id = ?").run(id);
}

export function insertTerminal(id: string, workspaceId: string, cwd: string, personaName: string, renameHash: string, persona: string = "damien-voss"): void {
  getDb().prepare("INSERT INTO terminals (id, workspace_id, cwd, persona_name, rename_hash, persona) VALUES (?, ?, ?, ?, ?, ?)").run(id, workspaceId, cwd, personaName, renameHash, persona);
}

export function deleteTerminal(id: string): void {
  getDb().prepare("DELETE FROM terminals WHERE id = ?").run(id);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export function upsertSettings(settings: Record<string, string>): void {
  const stmt = getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const tx = getDb().transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, value);
    }
  });
  tx();
}
