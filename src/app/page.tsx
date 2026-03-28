"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import TerminalGrid, { type TerminalGridHandle } from "@/components/TerminalGrid";
import FolderPicker from "@/components/FolderPicker";
import SplashScreen from "@/components/SplashScreen";
import { Button } from "@/components/Button";
import { generateTabName } from "@/lib/tab-names";

interface TerminalInstance {
  id: string;
  cwd: string;
  personaName?: string;
  renameHash?: string;
  requestedName?: string;
  persona?: string;
}

interface Tab {
  id: string;
  name: string;
  terminals: TerminalInstance[];
}

const DEFAULT_CWD = "~";

function TopBar({ tabName, tabId, terminalCount, onAddTerminal, onRename, onShout }: { tabName: string; tabId: string; terminalCount: number; onAddTerminal: (tabId: string, cwd: string, agentName?: string, persona?: string) => void; onRename: (id: string, name: string) => void; onShout: (msg: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tabName);
  const [showShout, setShowShout] = useState(false);
  const [shoutMsg, setShoutMsg] = useState("");

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tabName) {
      onRename(tabId, trimmed);
    } else {
      setDraft(tabName);
    }
    setEditing(false);
  };

  return (
    <div className="-mx-4 -mt-4 mb-0 flex items-center justify-between border-b border-border-subtle bg-forge-mid px-5 py-4">
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setDraft(tabName); setEditing(false); }
            }}
            className="rounded border border-border-hover bg-forge-black px-2 py-0.5 text-sm text-zinc-300 outline-none focus:border-border-focus"
          />
        ) : (
          <>
            <h2 className="text-sm font-medium text-zinc-400">{tabName}</h2>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => { setDraft(tabName); setEditing(true); }}
              aria-label="Rename workspace"
              icon={
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 1.5l2 2M1 11l.5-2L9 1.5l2 2L3.5 11 1 11z" />
                </svg>
              }
            />
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {terminalCount >= 2 && (
          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowShout((v) => !v)}
            >
              Shout
            </Button>
            {showShout && (
              <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-border-default bg-charcoal p-3 shadow-xl">
                <textarea
                  autoFocus
                  value={shoutMsg}
                  onChange={(e) => setShoutMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (shoutMsg.trim()) {
                        onShout(shoutMsg.trim());
                        setShoutMsg("");
                        setShowShout(false);
                      }
                    }
                    if (e.key === "Escape") setShowShout(false);
                  }}
                  placeholder="Message all agents..."
                  rows={3}
                  className="w-full resize-none rounded border border-border-hover bg-forge-black px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-burnt-orange"
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    if (shoutMsg.trim()) {
                      onShout(shoutMsg.trim());
                      setShoutMsg("");
                      setShowShout(false);
                    }
                  }}
                >
                  Send to all
                </Button>
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPicker((v) => !v)}
          >
            + Agent
          </Button>
        {showPicker && (
          <FolderPicker
            onSelect={(cwd, agentName, persona) => {
              onAddTerminal(tabId, cwd, agentName, persona);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
        </div>
      </div>
    </div>
  );
}

function EmptyTerminals({ tabId, onAddTerminal }: { tabId: string; onAddTerminal: (tabId: string, cwd: string, agentName?: string, persona?: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="relative">
        <Button
          variant="secondary"
          size="md"
          onClick={() => setShowPicker((v) => !v)}
        >
          + New Agent
        </Button>
        {showPicker && (
          <FolderPicker
            onSelect={(cwd, agentName, persona) => {
              onAddTerminal(tabId, cwd, agentName, persona);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    name: generateTabName(),
    terminals: [],
  };
}

export default function Home() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const gridRefs = useRef<Record<string, TerminalGridHandle | null>>({});

  const handleNewTab = () => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tab.id, name: tab.name }) });
  };

  const handleCloseTab = (id: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (id === activeTabId) {
        if (remaining.length === 0) {
          setActiveTabId("");
        } else {
          const closedIndex = prev.findIndex((t) => t.id === id);
          const next = remaining[Math.min(closedIndex, remaining.length - 1)];
          setActiveTabId(next.id);
        }
      }
      return remaining;
    });
    fetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const handleAddTerminal = (tabId: string, cwd: string, agentName?: string, persona?: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, terminals: [...tab.terminals, { id: crypto.randomUUID(), cwd, requestedName: agentName, persona }] }
          : tab
      )
    );
  };

  const handleCloseTerminal = (tabId: string, terminalId: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, terminals: tab.terminals.filter((t) => t.id !== terminalId) }
          : tab
      )
    );
    fetch(`/api/terminals/${encodeURIComponent(terminalId)}`, { method: "DELETE" });
  };

  const handleRenameTab = (id: string, name: string) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === id ? { ...tab, name } : tab))
    );
    fetch(`/api/workspaces/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  };

  const handleTerminalMeta = (tabId: string, terminalId: string, meta: { personaName?: string; renameHash?: string }) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, terminals: tab.terminals.map((t) => t.id === terminalId ? { ...t, ...meta } : t) }
          : tab
      )
    );
  };

  const [ready, setReady] = useState(false);
  const [stateLoaded, setStateLoaded] = useState(false);

  useEffect(() => {
    if (!ready || stateLoaded) return;
    fetch("/api/state")
      .then((r) => r.json())
      .then((data) => {
        if (data.workspaces?.length > 0) {
          const hydrated: Tab[] = data.workspaces.map((w: { id: string; name: string; terminals: { id: string; cwd: string; persona_name: string; rename_hash: string; persona: string }[] }) => ({
            id: w.id,
            name: w.name,
            terminals: w.terminals.map((t) => ({
              id: t.id,
              cwd: t.cwd,
              personaName: t.persona_name,
              renameHash: t.rename_hash,
              persona: t.persona,
            })),
          }));
          setTabs(hydrated);
          setActiveTabId(hydrated[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setStateLoaded(true));
  }, [ready, stateLoaded]);

  if (!ready) {
    return <SplashScreen onReady={() => setReady(true)} />;
  }

  return (
    <div className="flex h-screen bg-forge-black">
      <Sidebar
        tabs={tabs.map((t) => ({ id: t.id, name: t.name, terminalCount: t.terminals.length }))}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onNewTab={handleNewTab}
        onCloseTab={handleCloseTab}
      />
      <main className="relative flex-1 overflow-hidden">
        {tabs.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-600">No workspaces open. <button onClick={handleNewTab} className="text-zinc-400 underline underline-offset-2 transition-colors hover:text-zinc-200">Create a new workspace</button> to start.</p>
          </div>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                style={{ display: isActive ? "flex" : "none" }}
                className="absolute inset-0 flex-col p-4"
              >
                <TopBar
                  tabName={tab.name}
                  tabId={tab.id}
                  terminalCount={tab.terminals.length}
                  onAddTerminal={handleAddTerminal}
                  onRename={handleRenameTab}
                  onShout={(msg) => gridRefs.current[tab.id]?.broadcastCommand(msg)}
                />
                <div className="mt-4 flex w-full flex-1 overflow-y-auto">
                  {tab.terminals.length === 0 ? (
                    <EmptyTerminals tabId={tab.id} onAddTerminal={handleAddTerminal} />
                  ) : (
                    <TerminalGrid
                      ref={(handle) => { gridRefs.current[tab.id] = handle; }}
                      terminals={tab.terminals}
                      visible={isActive}
                      workspaceId={tab.id}
                      onCloseTerminal={(terminalId) => handleCloseTerminal(tab.id, terminalId)}
                      onTerminalMeta={(terminalId, meta) => handleTerminalMeta(tab.id, terminalId, meta)}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
