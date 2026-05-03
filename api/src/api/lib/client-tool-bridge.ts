// jembatan buat tool call yg harus dieksekusi di client (browser/desktop).
// backend bikin promise yg pending lalu client resolve via endpoint
// POST .../messages/stream/tool-result.
//
// catatan: state-nya di memory proses. kalau deploy multi-instance, butuh
// pindahkan ke redis/pub-sub supaya request resolve nyampe ke instance yg
// sedang streaming.

export type ClientToolResultPayload = {
  ok: boolean;
  content?: string;
  error?: string;
};

type Pending = {
  callId: string;
  userId: string;
  conversationId: string;
  toolName: string;
  resolve: (r: ClientToolResultPayload) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

export const DEFAULT_CLIENT_TOOL_TIMEOUT_MS = 60_000;

export function registerClientToolCall(opts: {
  callId: string;
  userId: string;
  conversationId: string;
  toolName: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<ClientToolResultPayload> {
  return new Promise((resolve, reject) => {
    if (pending.has(opts.callId)) {
      reject(new Error(`Client tool call duplikat: ${opts.callId}`));
      return;
    }

    const timer = setTimeout(() => {
      pending.delete(opts.callId);
      reject(new Error(`Client tool timeout: ${opts.toolName}`));
    }, opts.timeoutMs ?? DEFAULT_CLIENT_TOOL_TIMEOUT_MS);

    const entry: Pending = {
      callId: opts.callId,
      userId: opts.userId,
      conversationId: opts.conversationId,
      toolName: opts.toolName,
      resolve,
      reject,
      timer,
    };
    pending.set(opts.callId, entry);

    // kalau stream di-abort, clear aja pending-nya
    if (opts.signal) {
      const onAbort = () => {
        const cur = pending.get(opts.callId);
        if (!cur) return;
        clearTimeout(cur.timer);
        pending.delete(opts.callId);
        cur.reject(new Error("Client tool call dibatalkan"));
      };
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export function resolveClientToolCall(opts: {
  callId: string;
  userId: string;
  conversationId: string;
  payload: ClientToolResultPayload;
}): boolean {
  const p = pending.get(opts.callId);
  if (!p) return false;
  if (p.userId !== opts.userId || p.conversationId !== opts.conversationId) {
    // auth mismatch — jangan resolve. return false = not found dari sudut pandang caller.
    return false;
  }
  clearTimeout(p.timer);
  pending.delete(opts.callId);
  p.resolve(opts.payload);
  return true;
}

export function hasPendingClientToolCall(callId: string): boolean {
  return pending.has(callId);
}
