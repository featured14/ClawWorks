"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

interface Tab {
  id: string;
  name: string;
  terminalCount: number;
}

interface SidebarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
}

export default function Sidebar({ tabs, activeTabId, onSelectTab, onNewTab, onCloseTab }: SidebarProps) {
  const [confirmTabId, setConfirmTabId] = useState<string | null>(null);
  const confirmTab = tabs.find((t) => t.id === confirmTabId);

  return (
    <div className="flex h-full w-56 flex-col border-r border-border-subtle bg-forge-mid">
      <div className="flex flex-col items-center px-4 py-5">
        <img src="/clawworks.png" alt="ClawWorks logo" className="mb-2 w-24" />
        <h1 className="text-lg font-semibold text-zinc-300">ClawWorks</h1>
      </div>

      <div className="px-4 pb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Workspaces ({tabs.length})
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group mb-1 flex items-center rounded-md transition-colors ${
              tab.id === activeTabId
                ? "bg-charcoal text-zinc-200"
                : "text-zinc-500 hover:bg-charcoal/50 hover:text-zinc-300"
            }`}
          >
            <button
              onClick={() => onSelectTab(tab.id)}
              className="flex-1 truncate px-3 py-2 text-left text-sm"
            >
              {tab.name}
            </button>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={(e) => {
                e.stopPropagation();
                if (tab.terminalCount === 0) {
                  onCloseTab(tab.id);
                } else {
                  setConfirmTabId(tab.id);
                }
              }}
              className="mr-1 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label={`Close ${tab.name}`}
              icon={
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
              }
            />
          </div>
        ))}
      </nav>

      <div className="p-2">
        <Button
          variant="secondary"
          size="md"
          className="w-full"
          onClick={onNewTab}
        >
          + New Workspace
        </Button>
      </div>

      {confirmTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded-lg border border-border-default bg-charcoal p-5 shadow-xl">
            <h2 className="mb-2 text-sm font-semibold text-zinc-200">Delete workspace?</h2>
            <p className="mb-5 text-sm text-zinc-400">
              This will delete <span className="font-medium text-zinc-300">{confirmTab.name}</span> and kill {confirmTab.terminalCount} active agent{confirmTab.terminalCount !== 1 ? "s" : ""}. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmTabId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  onCloseTab(confirmTab.id);
                  setConfirmTabId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
