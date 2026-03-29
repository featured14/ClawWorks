"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/Button";

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="group relative mt-3">
      <pre className="rounded-md bg-black/40 px-4 py-3 pr-10 text-sm text-zinc-300">
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check size={16} />
        ) : (
          <Copy size={16} />
        )}
      </button>
    </div>
  );
}

interface SplashScreenProps {
  onReady: () => void;
}

export default function SplashScreen({ onReady }: SplashScreenProps) {
  const [status, setStatus] = useState<"checking" | "ok" | "disclaimer" | "error">("checking");

  const runCheck = () => {
    setStatus("checking");
    fetch("/api/system-check")
      .then((r) => r.json())
      .then((data) => {
        const claude = data.checks.find((c: { name: string }) => c.name === "Claude Code");
        if (claude?.status === "ok") {
          setStatus("ok");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  };

  useEffect(() => {
    runCheck();
  }, []);

  useEffect(() => {
    if (status === "ok") {
      const timer = setTimeout(() => setStatus("disclaimer"), 400);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-forge-black">
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <img src="/clawworks.png" alt="ClawWorks logo" className="mx-auto mb-4 w-20" />
          <h1 className="text-3xl font-bold text-zinc-200">ClawWorks</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {status === "checking" && "Checking environment..."}
            {status === "ok" && "Ready"}
            {status === "disclaimer" && "Ready"}
            {status === "error" && "Setup required"}
          </p>
        </div>

        {status === "checking" && (
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border-hover border-t-zinc-300" />
        )}

        {status === "ok" && (
          <div className="text-sm text-emerald-400">&#10003; Claude Code detected</div>
        )}

        {status === "disclaimer" && (
          <div className="w-96 rounded-lg border border-border-subtle bg-forge-mid p-6">
            <p className="text-sm text-zinc-400">
              This app may consume significant tokens. By using it, you accept full responsibility for your usage, costs, and any limits, throttling, suspension, or bans imposed by Anthropic or other providers.
            </p>
            <Button
              variant="primary"
              size="md"
              className="mt-5 w-full"
              onClick={onReady}
            >
              Agree
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="w-[28rem] rounded-lg border border-border-subtle bg-forge-mid p-6">
            <p className="text-sm font-medium text-red-400">Claude Code not found</p>
            <p className="mt-3 text-sm text-zinc-400">
              ClawWorks requires the Claude Code CLI to run agents. Install it with:
            </p>
            <CopyBlock text="npm install -g @anthropic-ai/claude-code" />
            <p className="mt-3 text-sm text-zinc-500">
              After installing, verify it works by running:
            </p>
            <CopyBlock text="claude --version" />
            <Button
              variant="secondary"
              size="md"
              className="mt-5 w-full"
              onClick={runCheck}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
