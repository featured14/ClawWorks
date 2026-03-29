"use client";

import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import dynamic from "next/dynamic";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/Button";
import type { TerminalHandle } from "@/components/Terminal";

const Terminal = dynamic(() => import("@/components/Terminal"), { ssr: false });

interface TerminalInstance {
  id: string;
  cwd: string;
  personaName?: string;
  renameHash?: string;
  requestedName?: string;
  persona?: string;
}

interface TerminalGridProps {
  terminals: TerminalInstance[];
  visible: boolean;
  workspaceId: string;
  onCloseTerminal: (id: string) => void;
  onTerminalMeta?: (terminalId: string, meta: { personaName?: string; renameHash?: string }) => void;
}

export interface TerminalGridHandle {
  broadcastCommand: (msg: string) => void;
}

function getColumns(count: number): number {
  if (count <= 3) return count;
  if (count === 4) return 2;
  return 3;
}

const LABEL_COLORS = [
  "#F26A21", "#3E6F95", "#10b981", "#ec4899", "#14b8a6",
  "#C84E14", "#5F88A8", "#8b5cf6", "#06b6d4", "#ef4444",
  "#84cc16", "#e879f9", "#22d3ee", "#a78bfa", "#34d399",
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length];
}

interface TerminalMeta {
  name?: string;
  ready?: boolean;
}

const GREETING_PROMPT = "Hey there! Welcome to the team. Please set your summary using set_summary tools and greet the peers. If the claude-peers tools aren't available yet, wait a few seconds and try again. Do not use any tools until you have greeted the team and received instructions.";
const GOODBYE_PROMPT = "Send a message to all peers, let them know you are leaving now and that you are no longer available.";
const SILENCE_GREETING_PROMPT = "Set your summary using set_summary tools and wait for my instructions! If the claude-peers tools aren't available yet, wait a few seconds and try again. Do not use any tools until you have received instructions.";

export default forwardRef<TerminalGridHandle, TerminalGridProps>(function TerminalGrid({ terminals, visible, workspaceId, onCloseTerminal, onTerminalMeta }, ref) {
  // Pre-populate meta for resumed terminals (those with personaName from DB)
  const [meta, setMeta] = useState<Record<string, TerminalMeta>>(() => {
    const initial: Record<string, TerminalMeta> = {};
    for (const t of terminals) {
      if (t.personaName) {
        initial[t.id] = { name: t.personaName };
      }
    }
    return initial;
  });
  const [shuttingDown, setShuttingDown] = useState<Record<string, { canForce: boolean; choosing?: boolean }>>(
    {}
  );
  const [greetPending, setGreetPending] = useState<Set<string>>(new Set());
  const [minimizedIds, setMinimizedIds] = useState<Set<string>>(new Set());
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const terminalRefs = useRef<Record<string, TerminalHandle | null>>({});
  const outputWatchers = useRef<Record<string, (data: string) => void>>({});

  const activeTerminals = terminals.filter(t => !minimizedIds.has(t.id));
  const benchTerminals = terminals.filter(t => minimizedIds.has(t.id));
  const displayTerminals = maximizedId
    ? activeTerminals.filter(t => t.id === maximizedId)
    : activeTerminals;
  const count = displayTerminals.length;

  // Clean up stale IDs when terminals are removed
  useEffect(() => {
    const termIds = new Set(terminals.map(t => t.id));
    setMinimizedIds(prev => {
      const next = new Set(Array.from(prev).filter(id => termIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setMaximizedId(prev => prev && !termIds.has(prev) ? null : prev);
  }, [terminals]);

  const handleMinimize = useCallback((id: string) => {
    if (maximizedId === id) setMaximizedId(null);
    setMinimizedIds(prev => new Set(prev).add(id));
  }, [maximizedId]);

  const handleMaximize = useCallback((id: string) => {
    setMaximizedId(prev => prev === id ? null : id);
  }, []);

  const handleRestore = useCallback((id: string) => {
    setMinimizedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  useImperativeHandle(ref, () => ({
    broadcastCommand(msg: string) {
      for (const term of terminals) {
        terminalRefs.current[term.id]?.sendCommand(msg);
      }
    },
  }), [terminals]);

  const terminalsRef = useRef(terminals);
  terminalsRef.current = terminals;

  const handleMeta = useCallback((termId: string, incoming: { personaName?: string; renameHash?: string; ready?: boolean }) => {
    setMeta((prev) => ({
      ...prev,
      [termId]: {
        ...prev[termId],
        ...(incoming.personaName ? { name: incoming.personaName } : {}),
        ...(incoming.ready ? { ready: true } : {}),
      },
    }));
    // Propagate persona/hash to parent for DB tracking
    if (incoming.personaName || incoming.renameHash) {
      onTerminalMeta?.(termId, { personaName: incoming.personaName, renameHash: incoming.renameHash });
    }
    if (incoming.ready) {
      // Skip greeting for resumed terminals — they already have their summary set
      const isResumed = terminalsRef.current.find((t) => t.id === termId);
      if (isResumed?.renameHash && isResumed?.personaName) return;

      if (terminalsRef.current.length <= 1) {
        // Only terminal in workspace — skip choice, just send silence prompt
        terminalRefs.current[termId]?.sendCommand(SILENCE_GREETING_PROMPT);
      } else {
        setGreetPending((prev) => new Set(prev).add(termId));
      }
    }
  }, [onTerminalMeta]);

  const forceKill = useCallback((id: string) => {
    onCloseTerminal(id);
    delete outputWatchers.current[id];
    setShuttingDown((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [onCloseTerminal]);

  const handleGoodbye = (id: string) => {
    // Show goodbye overlay (waiting state)
    setShuttingDown((prev) => ({ ...prev, [id]: { canForce: false } }));

    // Send goodbye command
    const handle = terminalRefs.current[id];
    if (handle) {
      handle.sendCommand(GOODBYE_PROMPT);
    }

    // Watch output for "Message sent to peer"
    let outputBuffer = "";
    outputWatchers.current[id] = (data: string) => {
      outputBuffer += data;
      if (outputBuffer.length > 4000) outputBuffer = outputBuffer.slice(-4000);
      // Strip ANSI
      const clean = outputBuffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b[^a-zA-Z]*[a-zA-Z]/g, "");
      if (clean.includes("Message senttopeer") || clean.includes("Messagesenttopeer")) {
        forceKill(id);
      }
    };

    // After 5s, show Force Kill button
    setTimeout(() => {
      setShuttingDown((prev) => {
        if (!prev[id]) return prev;
        return { ...prev, [id]: { canForce: true } };
      });
    }, 5000);
  };

  const handleCloseClick = (id: string) => {
    if (terminals.length <= 1) {
      forceKill(id);
      return;
    }
    // Show the close choice overlay
    setShuttingDown((prev) => ({ ...prev, [id]: { canForce: false, choosing: true } }));
  };

  const dismissGreet = useCallback((id: string) => {
    setGreetPending((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleOutput = useCallback((termId: string, data: string) => {
    outputWatchers.current[termId]?.(data);
  }, []);

  if (terminals.length === 0) return null;

  const cols = getColumns(count || 1);
  const rows = Math.ceil((count || 1) / cols);

  return (
    <div className="flex h-full w-full">
      {/* Main grid area */}
      <div
        className="grid flex-1 gap-2 overflow-y-auto"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridAutoRows: rows <= 2 ? "1fr" : "calc(50% - 4px)",
        }}
      >
        {count === 0 && benchTerminals.length > 0 && (
          <div className="flex items-center justify-center text-sm text-zinc-500">
            All agents on bench
          </div>
        )}
        {terminals.map((term) => {
          const termMeta = meta[term.id];
          const name = termMeta?.name;
          const ready = termMeta?.ready;
          const shutdownState = shuttingDown[term.id];
          const isShuttingDown = !!shutdownState;
          const color = colorForId(term.id);
          const isMinimized = minimizedIds.has(term.id);
          const isHiddenByMaximize = maximizedId !== null && maximizedId !== term.id && !isMinimized;
          const isVisible = !isMinimized && !isHiddenByMaximize;

          return (
            <div
              key={term.id}
              className={`relative flex min-h-0 min-w-0 flex-col rounded-lg border bg-charcoal transition-[border-color,box-shadow] duration-300 ${maximizedId === term.id ? "border-steel-blue animate-terminal-in" : "border-border-default"}`}
              style={{
                display: isVisible ? undefined : "none",
                boxShadow: maximizedId === term.id ? "inset 0 0 20px 0 rgba(62, 111, 149, 0.15), inset 0 0 4px 0 rgba(62, 111, 149, 0.1)" : "none",
              }}
            >
              {/* Top bar with label and action buttons */}
              <div className="flex items-center justify-between px-2 py-1">
                {name ? (
                  <span
                    className="rounded px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: color + "20", color }}
                  >
                    {name}
                  </span>
                ) : (
                  <span className="rounded bg-neutral-dim px-2 py-0.5 text-xs text-zinc-500">
                    Starting...
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => handleMinimize(term.id)}
                    disabled={isShuttingDown}
                    aria-label="Minimize to bench"
                    icon={<Minus size={14} />}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => handleMaximize(term.id)}
                    disabled={isShuttingDown}
                    aria-label={maximizedId === term.id ? "Restore grid" : "Maximize"}
                    icon={maximizedId === term.id ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => handleCloseClick(term.id)}
                    disabled={isShuttingDown}
                    aria-label="Kill agent"
                    icon={<X size={14} />}
                  />
                </div>
              </div>

              {/* Terminal area */}
              <div className="relative flex-1 overflow-hidden px-2 pb-2">
                {!ready && !isShuttingDown && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-charcoal/80">
                    <span className="text-xs text-zinc-500">Starting agent...</span>
                  </div>
                )}
                {ready && greetPending.has(term.id) && !isShuttingDown && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded bg-charcoal/80">
                    <Button
                      variant="system"
                      size="md"
                      onClick={() => {
                        terminalRefs.current[term.id]?.sendCommand(GREETING_PROMPT);
                        dismissGreet(term.id);
                      }}
                    >
                      Let him greet the team
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => {
                        terminalRefs.current[term.id]?.sendCommand("Set your summary and wait for my instructions!");
                        dismissGreet(term.id);
                      }}
                    >
                      Silence and proceed
                    </Button>
                  </div>
                )}
                {isShuttingDown && shutdownState.choosing && (
                  <div
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded bg-charcoal/80"
                    onClick={() => setShuttingDown((prev) => {
                      const next = { ...prev };
                      delete next[term.id];
                      return next;
                    })}
                  >
                    <Button
                      variant="danger"
                      size="md"
                      onClick={(e) => { e.stopPropagation(); forceKill(term.id); }}
                    >
                      Fire him now!
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={(e) => { e.stopPropagation(); handleGoodbye(term.id); }}
                    >
                      Let him say goodbye
                    </Button>
                  </div>
                )}
                {isShuttingDown && !shutdownState.choosing && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded bg-charcoal/80">
                    <span className="text-sm text-zinc-400">Goodbye...</span>
                    {shutdownState.canForce && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => forceKill(term.id)}
                      >
                        Force Kill
                      </Button>
                    )}
                  </div>
                )}
                <Terminal
                  ref={(handle) => { terminalRefs.current[term.id] = handle; }}
                  visible={visible && isVisible}
                  cwd={term.cwd}
                  terminalId={term.id}
                  workspaceId={workspaceId}
                  requestedName={term.requestedName}
                  persona={term.persona}
                  resumeSession={term.personaName && term.renameHash ? `${term.personaName.replace(/\s+/g, "-")}-${term.renameHash}` : undefined}
                  onMeta={(m) => handleMeta(term.id, m)}
                  onOutput={(data) => handleOutput(term.id, data)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bench sidebar — minimized agents */}
      <div
        className="shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: benchTerminals.length > 0 ? 200 : 0, opacity: benchTerminals.length > 0 ? 1 : 0, marginLeft: benchTerminals.length > 0 ? 8 : 0 }}
      >
        <div className="flex h-full w-48 flex-col rounded-lg border border-border-default bg-forge-mid">
          <div className="border-b border-border-subtle px-3 py-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Bench ({benchTerminals.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {benchTerminals.map((term) => {
              const name = meta[term.id]?.name ?? "Agent";
              const color = colorForId(term.id);
              return (
                <button
                  key={term.id}
                  onClick={() => handleRestore(term.id)}
                  className="animate-bench-item-in mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 transition-colors hover:bg-charcoal hover:text-zinc-200"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});
