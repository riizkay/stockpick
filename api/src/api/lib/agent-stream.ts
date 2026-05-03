const THINKING_BUF_THRESHOLD = 80;
const THINKING_FLUSH_MS = 50;

export type AgentEvent =
  | { type: "status"; phase: "thinking" | "tool_running" | "answering"; label: string; step: number }
  | { type: "thinking_delta"; content: string }
  | {
      type: "thinking_step";
      seconds: number;
      reasoning: string;
      assistantNarrative: string;
      followingTool: string | null;
      followingTools?: string[];
    }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | {
      type: "client_tool_call";
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      content?: string;
      error?: string;
      durationMs?: number;
    }
  | { type: "text_delta"; content: string }
  | { type: "done"; userMessage: unknown; assistantMessage: unknown }
  | { type: "error"; message: string; code?: string };

export interface AgentEmitter {
  status(phase: "thinking" | "tool_running" | "answering", label: string, step: number): void;
  thinkingDelta(content: string): void;
  thinkingStep(step: {
    seconds: number;
    reasoning: string;
    assistantNarrative: string;
    followingTool: string | null;
    followingTools?: string[];
  }): void;
  toolCall(id: string, name: string, args: Record<string, unknown>): void;
  clientToolCall(id: string, name: string, args: Record<string, unknown>): void;
  toolResult(
    id: string,
    name: string,
    result: { ok: boolean; content?: string; error?: string; durationMs?: number }
  ): void;
  textDelta(content: string): void;
  done(userMsg: unknown, assistantMsg: unknown): void;
}

export function createAgentStreamResponse(
  handler: (emit: AgentEmitter) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let open = true;

      const send = (event: AgentEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      // satu layer buffering thinking delta — hapus double buffer sebelumnya
      let thinkingBuf = "";
      let thinkingTimer: ReturnType<typeof setTimeout> | null = null;

      const flushThinking = () => {
        if (thinkingTimer) {
          clearTimeout(thinkingTimer);
          thinkingTimer = null;
        }
        if (!thinkingBuf) return;
        send({ type: "thinking_delta", content: thinkingBuf });
        thinkingBuf = "";
      };

      const emit: AgentEmitter = {
        status(phase, label, step) {
          flushThinking();
          send({ type: "status", phase, label, step });
        },

        thinkingDelta(content) {
          thinkingBuf += content;
          if (thinkingBuf.length >= THINKING_BUF_THRESHOLD) {
            flushThinking();
          } else if (!thinkingTimer) {
            thinkingTimer = setTimeout(flushThinking, THINKING_FLUSH_MS);
          }
        },

        thinkingStep(step) {
          flushThinking();
          send({ type: "thinking_step", ...step });
        },

        toolCall(id, name, args) {
          flushThinking();
          send({ type: "tool_call", id, name, args });
        },

        clientToolCall(id, name, args) {
          flushThinking();
          send({ type: "client_tool_call", id, name, args });
        },

        toolResult(id, name, result) {
          send({ type: "tool_result", id, name, ...result });
        },

        textDelta(content) {
          flushThinking();
          send({ type: "text_delta", content });
        },

        done(userMessage, assistantMessage) {
          flushThinking();
          send({ type: "done", userMessage, assistantMessage } as AgentEvent);
        },
      };

      try {
        await handler(emit);
      } catch (err) {
        if (thinkingTimer) clearTimeout(thinkingTimer);
        const message = err instanceof Error ? err.message : "Internal error";
        send({ type: "error", message });
      } finally {
        if (thinkingTimer) clearTimeout(thinkingTimer);
        try {
          controller.close();
        } catch {
          /* sudah tertutup */
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
