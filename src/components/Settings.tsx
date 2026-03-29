"use client";

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/Button";

interface SettingsProps {
  onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
  const [claudeCommand, setClaudeCommand] = useState("claude");
  const [defaultDirectory, setDefaultDirectory] = useState("~");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.claude_command) setClaudeCommand(data.claude_command);
        if (data.default_agent_directory) setDefaultDirectory(data.default_agent_directory);
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claude_command: claudeCommand, default_agent_directory: defaultDirectory }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border-default bg-charcoal">
      <div className="flex items-center gap-3 border-b border-border-subtle bg-forge-mid px-5 py-4">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          onClick={onBack}
          icon={<ArrowLeft size={16} />}
          aria-label="Back to workspaces"
        />
        <h2 className="text-sm font-medium text-zinc-400">Settings</h2>
      </div>

      <div className="mx-auto w-full max-w-lg p-6">
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          Claude command
        </label>
        <p className="mb-3 text-xs text-zinc-500">
          The CLI command used to launch Claude Code agents. Change this if your claude binary is at a custom path.
        </p>
        <input
          type="text"
          value={claudeCommand}
          onChange={(e) => setClaudeCommand(e.target.value)}
          className="w-full rounded border border-border-hover bg-forge-black px-3 py-2 font-mono text-sm text-zinc-300 outline-none focus:border-border-focus"
          placeholder="claude"
        />

        <label className="mb-2 mt-6 block text-sm font-medium text-zinc-300">
          Default agent directory
        </label>
        <p className="mb-3 text-xs text-zinc-500">
          The starting directory when opening a new agent in a fresh workspace. Existing workspaces with agents will continue using the last-used folder.
        </p>
        <input
          type="text"
          value={defaultDirectory}
          onChange={(e) => setDefaultDirectory(e.target.value)}
          className="w-full rounded border border-border-hover bg-forge-black px-3 py-2 font-mono text-sm text-zinc-300 outline-none focus:border-border-focus"
          placeholder="~"
        />

        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <span className="text-sm text-emerald-400">Settings saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
