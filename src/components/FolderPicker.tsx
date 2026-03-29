"use client";

import { useState, useEffect, useRef } from "react";
import { Folder } from "lucide-react";
import { Button } from "@/components/Button";

interface FolderPickerProps {
  onSelect: (path: string, agentName?: string, persona?: string) => void;
  onClose: () => void;
  initialPath?: string;
}

export default function FolderPicker({ onSelect, onClose, initialPath }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState(() => initialPath || localStorage.getItem("lastTerminalFolder") || "~");
  const [pathDraft, setPathDraft] = useState(currentPath);
  const [dirs, setDirs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [personas, setPersonas] = useState<string[]>(["damien-voss"]);
  const [selectedPersona, setSelectedPersona] = useState("damien-voss");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/personas")
      .then((r) => r.json())
      .then((data) => {
        if (data.personas?.length > 0) setPersonas(data.personas);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dirs?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.dirs) {
          setDirs(data.dirs);
          // Update path to resolved absolute path from server
          if (data.path) {
            setCurrentPath(data.path);
            setPathDraft(data.path);
          }
        }
      })
      .catch(() => setDirs([]))
      .finally(() => setLoading(false));
  }, [currentPath]);

  const navigateTo = (dir: string) => {
    setCurrentPath(currentPath === "/" ? `/${dir}` : `${currentPath}/${dir}`);
  };

  const navigateUp = () => {
    const parent = currentPath.replace(/\/[^/]+$/, "") || "/";
    setCurrentPath(parent);
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border-default bg-forge-mid shadow-xl"
    >
      <div className="border-b border-border-subtle px-3 py-2">
        <input
          type="text"
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setCurrentPath(pathDraft);
            }
            if (e.key === "Escape") {
              setPathDraft(currentPath);
            }
          }}
          onBlur={() => setCurrentPath(pathDraft)}
          className="w-full bg-transparent text-xs text-zinc-400 outline-none placeholder-zinc-600"
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        <button
          onClick={navigateUp}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-charcoal"
        >
          <span className="text-zinc-600">..</span>
          <span className="text-zinc-600">(parent)</span>
        </button>

        {loading ? (
          <div className="px-3 py-3 text-center text-xs text-zinc-600">Loading...</div>
        ) : dirs.length === 0 ? (
          <div className="px-3 py-3 text-center text-xs text-zinc-600">No subdirectories</div>
        ) : (
          dirs.map((dir) => (
            <button
              key={dir}
              onClick={() => navigateTo(dir)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-charcoal"
            >
              <Folder size={14} className="shrink-0 text-zinc-500" />
              <span className="truncate">{dir}</span>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-border-subtle p-2 space-y-2">
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="Agent name (leave empty for random)"
          className="w-full rounded border border-border-default bg-forge-black px-2 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none focus:border-border-focus"
        />
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Personality</label>
          <select
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            className="w-full rounded border border-border-default bg-forge-black px-2 py-1.5 text-xs text-zinc-300 outline-none focus:border-border-focus"
          >
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => {
            localStorage.setItem("lastTerminalFolder", currentPath);
            onSelect(currentPath, agentName.trim() || undefined, selectedPersona);
          }}
        >
          Open agent here
        </Button>
      </div>
    </div>
  );
}
