'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Frame =
  | { type: 'history'; lines?: unknown[] }
  | { type: 'line'; line?: unknown }
  | { type: 'status'; status?: { state?: string; message?: string | null } }
  | { type: 'stats'; status?: { state?: string } }
  | { type: 'connected'; message?: string }
  | { type: 'error'; message?: string };

type Connection = 'connecting' | 'open' | 'closed';

function toLine(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
    if (typeof record.line === 'string') return record.line;
  }
  return String(value ?? '');
}

export default function ConsolePanel({
  serverId,
  state,
  onRefresh,
  onError,
}: {
  serverId: string;
  state: string;
  onRefresh: () => Promise<void> | void;
  onError: (message: string | null) => void;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [command, setCommand] = useState('');
  const [autoscroll, setAutoscroll] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/servers/${serverId}/console`);
    socketRef.current = socket;
    setConnection('connecting');

    socket.onopen = () => {
      retryRef.current = 0;
      setConnection('open');
      setNotice(null);
    };

    socket.onmessage = (event) => {
      let frame: Frame;
      try {
        frame = JSON.parse(String(event.data)) as Frame;
      } catch {
        setLines((previous) => [...previous.slice(-999), String(event.data)]);
        return;
      }

      if (frame.type === 'history') {
        const history = (frame.lines ?? []).map(toLine).filter(Boolean);
        setLines(history.slice(-1000));
      } else if (frame.type === 'line') {
        const line = toLine(frame.line);
        if (line) setLines((previous) => [...previous.slice(-999), line]);
      } else if (frame.type === 'status' || frame.type === 'stats') {
        if (frame.status?.state) void onRefresh();
      } else if (frame.type === 'error') {
        setNotice(frame.message ?? 'The console reported an error.');
      } else if (frame.type === 'connected') {
        setConnection('open');
      }
    };

    socket.onerror = () => setConnection('closed');

    socket.onclose = () => {
      setConnection('closed');
      if (closedRef.current) return;
      retryRef.current += 1;
      const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
      setTimeout(() => {
        if (!closedRef.current) connect();
      }, delay);
    };
  }, [serverId, onRefresh]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    const keepAlive = setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }));
    }, 25000);
    return () => {
      closedRef.current = true;
      clearInterval(keepAlive);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    if (!autoscroll) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, autoscroll]);

  function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = command.trim();
    if (!value) return;
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      onError('Console is not connected to the node. Power the server on and try again.');
      return;
    }
    socket.send(JSON.stringify({ type: 'command', command: value }));
    setLines((previous) => [...previous.slice(-999), `> ${value}`]);
    setCommand('');
    onError(null);
  }

  const badge =
    connection === 'open'
      ? { label: 'Live', className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' }
      : connection === 'connecting'
        ? { label: 'Connecting', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' }
        : { label: 'Reconnecting', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200' };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">Server console</span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connection === 'open' ? 'bg-emerald-400 live-dot' : 'bg-current'}`} />
            {badge.label}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{state}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={autoscroll}
              onChange={(event) => setAutoscroll(event.target.checked)}
              className="h-3.5 w-3.5 accent-jasfer-500"
            />
            Autoscroll
          </label>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setLines([])}>
            Clear
          </button>
        </div>
      </div>

      {notice && (
        <p className="border-b border-amber-400/20 bg-amber-400/[0.07] px-4 py-2 text-[11px] text-amber-200">{notice}</p>
      )}

      <div ref={scrollRef} className="console h-[52vh] min-h-[280px] overflow-y-auto px-3 py-3 sm:px-4">
        {lines.length === 0 ? (
          <p className="console-line text-slate-500">
            {connection === 'open'
              ? 'Connected. Console output appears here as soon as the server writes it.'
              : 'Waiting for the console stream…'}
          </p>
        ) : (
          lines.map((line, index) => (
            <p key={`${index}-${line.slice(0, 24)}`} className="console-line whitespace-pre-wrap break-words">
              {line}
            </p>
          ))
        )}
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-white/[0.06] p-3">
        <input
          className="input font-mono text-xs"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="say Hello from Jasfer Hosting"
          aria-label="Server command"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn-primary btn-sm shrink-0" disabled={connection !== 'open'}>
          Send
        </button>
      </form>
    </section>
  );
}
