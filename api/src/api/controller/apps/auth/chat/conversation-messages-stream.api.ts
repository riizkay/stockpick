import { ApiError } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { createAgentStreamResponse } from "@lib/agent-stream";
import { registerClientToolCall } from "@lib/client-tool-bridge";
import { sendMessage } from "@services/chat/chat-service";
import type {
  ClientToolDescriptor,
  ContextOverflowStrategy,
} from "@services/inference/inference-runner";

export const endpoint = "/api/auth/chat/conversations/:id/messages/stream";

// token replay simulasi (fallback kalau stream tidak live)
const TOKEN_CHUNK_SIZE = 12;
const TOKEN_DELAY_MS = 8;

// limit ukuran body karna client bisa kirim definisi tools
const MAX_CLIENT_TOOLS = 64;

function parseClientTools(raw: unknown): ClientToolDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientToolDescriptor[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) continue;
    const description = typeof obj.description === "string" ? obj.description : "";
    const parameters =
      obj.parameters && typeof obj.parameters === "object" && !Array.isArray(obj.parameters)
        ? (obj.parameters as Record<string, unknown>)
        : {};
    out.push({ name, description, parameters });
    if (out.length >= MAX_CLIENT_TOOLS) break;
  }
  return out;
}

function parseTemperature(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  // clamp ke range masuk akal
  if (raw < 0) return 0;
  if (raw > 2) return 2;
  return raw;
}

function parseContextOverflow(raw: unknown): ContextOverflowStrategy | undefined {
  if (raw === "rolling" || raw === "truncate" || raw === "stop") return raw;
  return undefined;
}

export default {
  POST: async (
    request: Request,
    server: { params?: Record<string, string> },
    context: Record<string, unknown>
  ) => {
    const user = requirePublicUser(context);
    const conversationId = server.params?.id;

    if (!conversationId) {
      throw new ApiError("ID percakapan wajib ada", 400);
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (!content) {
      throw new ApiError("Isi pesan wajib ada", 400);
    }

    if (content.length > 8000) {
      throw new ApiError("Pesan terlalu panjang (maks 8000 karakter)", 400);
    }

    const clientInternalTools = parseClientTools(body?.clientInternalTools);
    const temperature = parseTemperature(body?.temperature);
    const contextOverflow = parseContextOverflow(body?.contextOverflow);
    // debug mode — kalau false, stream tidak ikut kirim tool args/result
    const debugMode = body?.debugMode === true;

    // abort controller — disambungkan ke request signal biar pending client
    // tool call ikut canceled kalau stream putus.
    const streamAbort = new AbortController();
    request.signal.addEventListener(
      "abort",
      () => streamAbort.abort(),
      { once: true }
    );

    return createAgentStreamResponse(async (emit) => {
      const result = await sendMessage(user.userId, conversationId, content, {
        onAssistantPhase: (p) => emit.status("thinking", p.label, p.stepIndex),
        onThinkingDelta: (chunk) => emit.thinkingDelta(chunk),
        onThinkingStep: (step) => emit.thinkingStep(step),

        onToolEvent: (ev) => {
          if (ev.phase === "start") {
            // kalau bukan debug mode, jangan kirim arguments
            emit.toolCall(ev.id, ev.name, debugMode ? (ev.arguments ?? {}) : {});
          } else {
            emit.toolResult(ev.id, ev.name, {
              ok: !ev.error,
              // kalau bukan debug mode, drop content & error supaya client tidak render
              content: debugMode ? ev.result : undefined,
              error: debugMode ? ev.error : undefined,
            });
          }
        },

        onAnswerDelta: (chunk) => emit.textDelta(chunk),

        clientInternalTools,
        temperature,
        contextOverflow,

        // saat model minta client tool — emit SSE + tunggu result dari bridge
        onClientToolCall: async ({ id, name, args }) => {
          emit.clientToolCall(id, name, debugMode ? args : {});
          const res = await registerClientToolCall({
            callId: id,
            userId: user.userId,
            conversationId,
            toolName: name,
            signal: streamAbort.signal,
          });
          return res;
        },
      });

      // replay kalau final answer tidak di-stream live (mis. fallback non-stream)
      if (!result.skipAnswerTokenReplay) {
        const text = result.assistantMessage.content;
        for (let i = 0; i < text.length; i += TOKEN_CHUNK_SIZE) {
          emit.textDelta(text.slice(i, i + TOKEN_CHUNK_SIZE));
          await new Promise<void>((r) => setTimeout(r, TOKEN_DELAY_MS));
        }
      }

      emit.done(result.userMessage, result.assistantMessage);
    });
  },
};
