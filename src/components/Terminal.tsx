"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  visible: boolean;
  cwd?: string;
  terminalId?: string;
  workspaceId?: string;
  requestedName?: string;
  persona?: string;
  resumeSession?: string;
  onMeta?: (meta: { personaName?: string; renameHash?: string; ready?: boolean }) => void;
  onOutput?: (data: string) => void;
}

export interface TerminalHandle {
  sendCommand: (cmd: string) => void;
}

export default forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { visible, cwd, terminalId, workspaceId, requestedName, persona, resumeSession, onMeta, onOutput },
  ref
) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useImperativeHandle(ref, () => ({
    sendCommand(cmd: string) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(cmd + "\r");
      }
    },
  }));

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: "#1A1F26",
        foreground: "#e0e0e0",
        cursor: "#e0e0e0",
      },
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 14,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;


    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsParams = new URLSearchParams();
    if (cwd) wsParams.set("cwd", cwd);
    if (terminalId) wsParams.set("terminalId", terminalId);
    if (workspaceId) wsParams.set("workspaceId", workspaceId);
    if (requestedName) wsParams.set("personaName", requestedName);
    if (persona) wsParams.set("persona", persona);
    if (resumeSession) wsParams.set("resume", resumeSession);
    const qs = wsParams.toString();
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal${qs ? `?${qs}` : ""}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const resize = `\x01resize:${term.cols},${term.rows}`;
      ws.send(resize);

      // Clear initial shell prompt lines after server sends claude command
      setTimeout(() => term.clear(), 1500);
    };

    ws.onmessage = (event) => {
      const data = event.data as string;

      // Handle metadata messages from server
      if (data.startsWith("\x01meta:")) {
        try {
          const meta = JSON.parse(data.slice(6));
          onMeta?.(meta);
        } catch {}
        return;
      }

      term.write(data);
      onOutput?.(data);
    };

    ws.onclose = () => {
      term.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
    };

    term.onData((data) => {
      ws.send(data);
    });

    const handleResize = () => {
      if (!terminalRef.current || terminalRef.current.offsetWidth === 0) return;
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x01resize:${term.cols},${term.rows}`);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (visible && fitAddonRef.current && terminalRef.current) {
      requestAnimationFrame(() => {
        if (terminalRef.current && terminalRef.current.offsetWidth > 0) {
          fitAddonRef.current?.fit();
        }
      });
    }
  }, [visible]);

  return (
    <div
      ref={terminalRef}
      className="h-full w-full overflow-hidden"
    />
  );
});
