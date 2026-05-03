import { ApiError } from "@helper/Response";
import { callStockbitMcpTool, serializeCallToolResult } from "@services/mcp/mcp-client";
import { normalizeMcpToolArguments } from "@services/mcp/mcp-normalizer";
import { withPersistentMcpSession } from "@lib/mcp-session";

const INFERENCE_URL = process.env.INFERENCE_URL ?? "http://127.0.0.1:1234/v1";
const INFERENCE_MODEL = process.env.INFERENCE_MODEL ?? "local-model";
const INFERENCE_API_KEY = process.env.INFERENCE_API_KEY?.trim();

const MAX_MCP_TOOL_STEPS = 20;
const MAX_TOOL_RESULT_CHARS = 100_000;

// bisa di-override via env untuk domain lain (bukan hanya saham)
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant with access to real-time tools. " +
  "ALWAYS call the relevant tools when the user asks for specific data or analysis. " +
  "NEVER answer from memory for data that changes over time — use tools instead. " +
  "Call all relevant tools sequentially, then analyze the results and respond.";

const SYSTEM_PROMPT = process.env.AGENT_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;

// --- types ---

export type ConversationHistoryItem = { role: "user" | "assistant"; content: string };

export type SendMessageToolEvent =
  | { phase: "start"; id: string; name: string; arguments?: Record<string, unknown> }
  | { phase: "end"; id: string; name: string; error?: string; result?: string };

export type AssistantPhasePayload = {
  phase: "inference";
  stepIndex: number;
  label: string;
};

export type ThinkingStepPayload = {
  seconds: number;
  reasoning: string;
  assistantNarrative: string;
  followingTool: string | null;
  followingTools?: string[];
};

// deskriptor tool yg dieksekusi di client. kirim dari FE via request body.
// parameter sebaiknya pakai shape JSON schema sederhana (type/properties).
export type ClientToolDescriptor = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

// hasil eksekusi client tool yg dikirim balik via POST /tool-result
export type ClientToolResult = {
  ok: boolean;
  content?: string;
  error?: string;
};

export type ContextOverflowStrategy = "rolling" | "truncate" | "stop";

export type SendMessageOptions = {
  onToolEvent?: (ev: SendMessageToolEvent) => void;
  onThinkingStep?: (step: ThinkingStepPayload) => void;
  onThinkingDelta?: (chunk: string) => void;
  onAnswerDelta?: (chunk: string) => void;
  onAssistantPhase?: (p: AssistantPhasePayload) => void;

  // client-side tools (internal). nama harus unik vs MCP tools.
  clientInternalTools?: ClientToolDescriptor[];
  // dipanggil saat model minta tool yg terdaftar di clientInternalTools.
  // implementasi biasanya: emit SSE client_tool_call + tunggu hasil dari bridge.
  onClientToolCall?: (call: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }) => Promise<ClientToolResult>;

  // generation settings — dilempar ke LLM
  temperature?: number;
  // strategi kalau konteks overflow — sekarang jadi hint aja, server belum
  // auto-truncate history. nilai tetap disimpan buat nanti.
  contextOverflow?: ContextOverflowStrategy;
};

// --- OpenAI message format ---

type OpenAIChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type StreamResult = {
  content: string;
  reasoning: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
  streamedLive: boolean;
  durationMs: number;
};

// --- helpers ---

function inferenceUrlBase(): string {
  return INFERENCE_URL.trim().replace(/\/+$/, "");
}

function chatCompletionsUrl(): string {
  return `${inferenceUrlBase()}/chat/completions`;
}

function inferenceHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (INFERENCE_API_KEY) h.Authorization = `Bearer ${INFERENCE_API_KEY}`;
  return h;
}

function truncateToolResult(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n\n…(dipotong, total ${text.length} karakter)`;
}

function openAiContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const p of content) {
    if (p && typeof p === "object" && typeof (p as Record<string, unknown>).text === "string") {
      parts.push((p as Record<string, unknown>).text as string);
    }
  }
  return parts.join("");
}

function buildRequestBody(
  messages: OpenAIChatMessage[],
  tools: OpenAITool[] | null,
  stream: boolean,
  toolChoice: "auto" | "required" = "auto",
  extras?: { temperature?: number }
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: INFERENCE_MODEL, messages, stream };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }
  if (extras?.temperature != null && Number.isFinite(extras.temperature)) {
    body.temperature = extras.temperature;
  }
  return body;
}

function mcpToolsToOpenAI(
  tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[]
): OpenAITool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));
}

// convert deskriptor client tool jadi OpenAI tool. parameter diasumsikan sudah
// JSON-schema-ish (object dengan properties). kalau belum, wrap jadi object
// schema sederhana.
function clientToolsToOpenAI(tools: ClientToolDescriptor[]): OpenAITool[] {
  return tools.map((t) => {
    const params = t.parameters ?? {};
    // deteksi kalau user udah kasih full schema (punya "type" root), pakai apa adanya
    const isFullSchema =
      typeof (params as Record<string, unknown>).type === "string" &&
      typeof (params as Record<string, unknown>).properties === "object";
    const parameters: Record<string, unknown> = isFullSchema
      ? (params as Record<string, unknown>)
      : {
          type: "object",
          properties: params,
          additionalProperties: false,
        };
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? "",
        parameters,
      },
    };
  });
}

// --- SSE parsing ---

function extractDataFromBlock(block: string): string | null {
  const lines = block.split("\n");
  const dataLines: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.length ? dataLines.join("\n") : null;
}

// --- streaming inference ---

async function callInferenceStream(
  messages: OpenAIChatMessage[],
  tools: OpenAITool[] | null,
  opts: {
    onReasoningDelta?: (chunk: string) => void;
    onAnswerDelta?: (chunk: string) => void;
    toolChoice?: "auto" | "required";
    temperature?: number;
  }
): Promise<StreamResult> {
  const startMs = Date.now();

  const res = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: inferenceHeaders(),
    body: JSON.stringify(
      buildRequestBody(messages, tools, true, opts.toolChoice, { temperature: opts.temperature })
    ),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const snippet = errBody.length > 2000 ? `${errBody.slice(0, 2000)}…` : errBody;
    if (snippet) console.error("[inference] error body:", snippet);
    if (snippet.includes("n_keep") || snippet.includes("n_ctx") || snippet.toLowerCase().includes("context length")) {
      throw new ApiError(`context_overflow: ${snippet}`, 502);
    }
    throw new ApiError(`Inference server error: ${res.status}`, 502);
  }

  if (!res.body) {
    throw new ApiError("Inference server tidak mengembalikan body stream", 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let contentAcc = "";
  let reasoningAcc = "";
  let streamedLive = false;
  let finishReason: string | null = null;

  // accumulate tool call deltas per index
  const pendingTools = new Map<
    number,
    { id: string; name: string; argsAcc: string }
  >();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      for (;;) {
        const sep = buf.indexOf("\n\n");
        if (sep === -1) break;
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);

        const raw = extractDataFromBlock(block)?.trim();
        if (!raw || raw === "[DONE]") continue;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          continue;
        }

        const err = data.error;
        if (err && typeof err === "object") {
          const errMsg = (err as { message?: string }).message ?? "";
          console.error("[inference] stream error:", errMsg);
          if (errMsg.includes("n_keep") || errMsg.includes("n_ctx") || errMsg.toLowerCase().includes("context length")) {
            throw new ApiError(`context_overflow: ${errMsg}`, 502);
          }
          continue;
        }

        const choices = data.choices as
          | Array<{
              delta?: Record<string, unknown>;
              finish_reason?: string | null;
            }>
          | undefined;
        const choice = choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) finishReason = choice.finish_reason as string;

        const delta = choice.delta;
        if (!delta) continue;

        // reasoning channel (deepseek/qwen style)
        const reasoning =
          (typeof delta.reasoning_content === "string" && delta.reasoning_content) ||
          (typeof delta.reasoning === "string" && delta.reasoning) ||
          "";
        if (reasoning) {
          reasoningAcc += reasoning;
          opts.onReasoningDelta?.(reasoning);
        }

        // content channel
        const dc = delta.content;
        if (typeof dc === "string" && dc.length > 0) {
          contentAcc += dc;
          opts.onAnswerDelta?.(dc);
          streamedLive = true;
        }

        // native tool_calls deltas
        const toolCallDeltas = delta.tool_calls as
          | Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>
          | undefined;

        if (toolCallDeltas) {
          for (const tc of toolCallDeltas) {
            if (!pendingTools.has(tc.index)) {
              pendingTools.set(tc.index, {
                id: tc.id ?? `call_${tc.index}_${Date.now()}`,
                name: tc.function?.name ?? "",
                argsAcc: "",
              });
            }
            const pending = pendingTools.get(tc.index)!;
            if (tc.id && !pending.id) pending.id = tc.id;
            if (tc.function?.name && !pending.name) pending.name = tc.function.name;
            if (tc.function?.arguments) pending.argsAcc += tc.function.arguments;
          }
        }
      }
    }

    // flush sisa buffer
    if (buf.trim()) {
      const raw = extractDataFromBlock(buf.trim())?.trim();
      if (raw && raw !== "[DONE]") {
        try {
          const data = JSON.parse(raw) as Record<string, unknown>;
          const choices = data.choices as Array<{
            delta?: Record<string, unknown>;
            finish_reason?: string | null;
          }>;
          const choice = choices?.[0];
          if (choice) {
            if (choice.finish_reason) finishReason = choice.finish_reason as string;
            const delta = choice.delta;
            if (delta) {
              const dc = delta.content;
              if (typeof dc === "string" && dc.length > 0) {
                contentAcc += dc;
                opts.onAnswerDelta?.(dc);
                streamedLive = true;
              }
            }
          }
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  // parse accumulated tool calls — hanya kalau finish_reason tool_calls atau ada pending calls
  const toolCalls =
    finishReason === "tool_calls" || pendingTools.size > 0
      ? Array.from(pendingTools.entries())
          .sort(([a], [b]) => a - b)
          .map(([, tc]) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(tc.argsAcc) as Record<string, unknown>;
            } catch {
              args = {};
            }
            return { id: tc.id, name: tc.name, args };
          })
          .filter((tc) => Boolean(tc.name))
      : [];

  const content = contentAcc.trim();
  const reasoning = reasoningAcc.trim();

  if (!content && !reasoning && toolCalls.length === 0) {
    throw new ApiError("Stream inference selesai tanpa output valid", 502);
  }

  return { content, reasoning, toolCalls, streamedLive, durationMs: Date.now() - startMs };
}

// --- non-streaming fallback ---

async function callInferenceNonStreaming(
  messages: OpenAIChatMessage[],
  tools: OpenAITool[] | null,
  toolChoice: "auto" | "required" = "auto",
  extras?: { temperature?: number }
): Promise<StreamResult> {
  const startMs = Date.now();
  const res = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: inferenceHeaders(),
    body: JSON.stringify(buildRequestBody(messages, tools, false, toolChoice, extras)),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const snippet = errBody.slice(0, 2000);
    console.error("[inference] non-stream error:", snippet);
    if (snippet.includes("n_keep") || snippet.includes("n_ctx") || snippet.toLowerCase().includes("context length")) {
      throw new ApiError(`context_overflow: ${snippet}`, 502);
    }
    throw new ApiError(`Inference server error: ${res.status}`, 502);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const choices = json.choices as
    | Array<{
        message?: {
          content?: unknown;
          reasoning_content?: unknown;
          tool_calls?: OpenAIToolCall[];
        };
        finish_reason?: string;
      }>
    | undefined;

  const msg = choices?.[0]?.message;
  const content = openAiContentToText(msg?.content).trim();
  const reasoning =
    typeof msg?.reasoning_content === "string" ? msg.reasoning_content.trim() : "";

  const toolCalls: StreamResult["toolCalls"] = [];
  if (msg?.tool_calls) {
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      if (tc.function.name) {
        toolCalls.push({ id: tc.id, name: tc.function.name, args });
      }
    }
  }

  return { content, reasoning, toolCalls, streamedLive: false, durationMs: Date.now() - startMs };
}

async function callInference(
  messages: OpenAIChatMessage[],
  tools: OpenAITool[] | null,
  opts?: {
    onReasoningDelta?: (chunk: string) => void;
    onAnswerDelta?: (chunk: string) => void;
    toolChoice?: "auto" | "required";
    temperature?: number;
  }
): Promise<StreamResult> {
  if (opts?.onReasoningDelta || opts?.onAnswerDelta) {
    try {
      return await callInferenceStream(messages, tools, {
        onReasoningDelta: opts.onReasoningDelta,
        onAnswerDelta: opts.onAnswerDelta,
        toolChoice: opts.toolChoice,
        temperature: opts.temperature,
      });
    } catch (err) {
      console.warn("[inference] stream gagal, pakai non-stream:", err);
    }
  }
  return callInferenceNonStreaming(messages, tools, opts?.toolChoice, {
    temperature: opts?.temperature,
  });
}

// --- agentic loop ---

async function runInferenceWithMcpTools(
  userContent: string,
  history: ConversationHistoryItem[],
  options?: SendMessageOptions
): Promise<{ text: string; reasoning: string; skipAnswerTokenReplay?: boolean }> {
  return withPersistentMcpSession(async (client) => {
    const { tools: mcpToolList } = await client.listTools();
    const mcpOpenAITools = mcpToolsToOpenAI(
      mcpToolList as { name: string; description?: string; inputSchema: Record<string, unknown> }[]
    );

    // client tools (dari request body). filter duplikat nama vs MCP — MCP menang.
    const mcpNames = new Set(mcpOpenAITools.map((t) => t.function.name));
    const clientTools = (options?.clientInternalTools ?? []).filter(
      (t) => !mcpNames.has(t.name)
    );
    const clientNameSet = new Set(clientTools.map((t) => t.name));
    const clientOpenAITools = clientToolsToOpenAI(clientTools);

    const openAITools: OpenAITool[] = [...mcpOpenAITools, ...clientOpenAITools];

    const messages: OpenAIChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: userContent },
    ];

    const reasoningChunks: string[] = [];

    for (let step = 0; step < MAX_MCP_TOOL_STEPS; step++) {
      const label =
        step === 0
          ? "Langkah 1 — menghubungi model AI (inference)…"
          : `Langkah ${step + 1} — model menganalisis hasil tool & menyusun langkah berikutnya…`;

      options?.onAssistantPhase?.({ phase: "inference", stepIndex: step, label });
      await new Promise<void>((r) => setTimeout(r, 0));

      const result = await callInference(messages, openAITools, {
        onReasoningDelta: options?.onThinkingDelta,
        onAnswerDelta: options?.onAnswerDelta,
        temperature: options?.temperature,
      });

      if (result.reasoning) reasoningChunks.push(result.reasoning);

      const toolNames = result.toolCalls.map((tc) => tc.name);

      if (step === 0 && result.toolCalls.length === 0) {
        console.warn(
          "[inference] step 0: model tidak memanggil tools. content length:",
          result.content.length,
          "| reasoning length:",
          result.reasoning.length
        );
      }

      options?.onThinkingStep?.({
        seconds: result.durationMs / 1000,
        reasoning: result.reasoning,
        assistantNarrative: result.content,
        followingTool: toolNames[0] ?? null,
        ...(toolNames.length > 1 ? { followingTools: toolNames } : {}),
      });

      if (result.toolCalls.length === 0) {
        const finalText = result.content || result.reasoning;
        return {
          text: finalText,
          reasoning: reasoningChunks.join("\n\n"),
          ...(result.streamedLive ? { skipAnswerTokenReplay: true as const } : {}),
        };
      }

      // tambahkan assistant message dengan tool_calls ke history
      messages.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // split jadi client vs mcp. preserve ordering original.
      const prepared = result.toolCalls.map((tc) => {
        const isClient = clientNameSet.has(tc.name);
        return {
          id: tc.id,
          name: tc.name,
          isClient,
          // mcp butuh normalisasi argumen; client pakai args apa adanya
          args: isClient ? tc.args : normalizeMcpToolArguments(tc.name, tc.args),
        };
      });

      // fire start events — client pakai onClientToolCall flow kalau ada
      // handler, mcp pakai onToolEvent biasa.
      for (const p of prepared) {
        if (p.isClient) {
          // tidak fire start lewat onToolEvent — biar controller yg emit
          // client_tool_call (supaya FE bisa route ke execute local).
          continue;
        }
        options?.onToolEvent?.({ phase: "start", id: p.id, name: p.name, arguments: p.args });
        await new Promise<void>((r) => setTimeout(r, 0));
      }

      // eksekusi paralel. mcp → panggil langsung via client, client → await
      // bridge lewat options.onClientToolCall.
      const toolResults = await Promise.allSettled(
        prepared.map(async (p) => {
          if (p.isClient) {
            if (!options?.onClientToolCall) {
              throw new Error(
                `Tool "${p.name}" butuh eksekusi di client, tapi onClientToolCall tidak terdaftar`
              );
            }
            const r = await options.onClientToolCall({ id: p.id, name: p.name, args: p.args });
            if (!r.ok) {
              throw new Error(r.error || "client tool error");
            }
            return { id: p.id, name: p.name, text: r.content ?? "" };
          }
          const raw = await callStockbitMcpTool(client, p.name, p.args);
          const text = serializeCallToolResult(raw);
          return { id: p.id, name: p.name, text };
        })
      );

      // proses hasil dan tambahkan ke messages. emit onToolEvent end juga
      // buat client tools biar muncul di timeline FE.
      for (let i = 0; i < toolResults.length; i++) {
        const tr = toolResults[i]!;
        const p = prepared[i]!;

        if (tr.status === "fulfilled") {
          const toolText = tr.value.text;
          options?.onToolEvent?.({
            phase: "end",
            id: p.id,
            name: p.name,
            result: truncateToolResult(toolText),
          });
          messages.push({
            role: "tool",
            tool_call_id: p.id,
            content: toolText.slice(0, 120_000),
          });
        } else {
          const errMsg = tr.reason instanceof Error ? tr.reason.message : String(tr.reason);
          options?.onToolEvent?.({ phase: "end", id: p.id, name: p.name, error: errMsg });
          messages.push({
            role: "tool",
            tool_call_id: p.id,
            content: `Error executing tool: ${errMsg}`,
          });
        }

        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    throw new ApiError("Terlalu banyak langkah tool MCP", 502);
  });
}

export async function runAssistantReply(
  content: string,
  history: ConversationHistoryItem[],
  options?: SendMessageOptions
): Promise<{ text: string; reasoning: string; skipAnswerTokenReplay?: boolean }> {
  const isMcpEnabled = process.env.STOCKBIT_MCP_ENABLED !== "false";

  if (!isMcpEnabled) {
    options?.onAssistantPhase?.({
      phase: "inference",
      stepIndex: 0,
      label: "Langkah 1 — menghubungi model…",
    });
    await new Promise<void>((r) => setTimeout(r, 0));

    const messages: OpenAIChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content },
    ];

    const stepStart = Date.now();
    const r = await callInference(messages, null, {
      onReasoningDelta: options?.onThinkingDelta,
      onAnswerDelta: options?.onAnswerDelta,
      temperature: options?.temperature,
    });

    options?.onThinkingStep?.({
      seconds: (Date.now() - stepStart) / 1000,
      reasoning: r.reasoning,
      assistantNarrative: r.content,
      followingTool: null,
    });

    return {
      text: r.content || r.reasoning,
      reasoning: r.reasoning,
      ...(r.streamedLive ? { skipAnswerTokenReplay: true as const } : {}),
    };
  }

  try {
    return await runInferenceWithMcpTools(content, history, options);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isContextOverflow =
      errMsg.includes("context_overflow") ||
      errMsg.includes("n_keep") ||
      errMsg.includes("n_ctx") ||
      errMsg.toLowerCase().includes("context length");

    if (isContextOverflow) {
      console.error(
        "[inference] context overflow — naikkan n_ctx di LM Studio minimal 8192:",
        errMsg
      );
      throw new ApiError(
        "Context model terlalu kecil untuk memproses tools. Naikkan context length di LM Studio ke minimal 8192 token.",
        502
      );
    }

    console.error("[inference] MCP loop gagal, fallback tanpa tools:", err);

    options?.onAssistantPhase?.({
      phase: "inference",
      stepIndex: 0,
      label: "Langkah 1 — MCP tidak tersedia, menghubungi model…",
    });
    await new Promise<void>((r) => setTimeout(r, 0));

    const messages: OpenAIChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content },
    ];

    const stepStart = Date.now();
    const r = await callInference(messages, null, {
      onReasoningDelta: options?.onThinkingDelta,
      onAnswerDelta: options?.onAnswerDelta,
      temperature: options?.temperature,
    });

    options?.onThinkingStep?.({
      seconds: (Date.now() - stepStart) / 1000,
      reasoning: r.reasoning,
      assistantNarrative: r.content,
      followingTool: null,
    });

    return {
      text: r.content || r.reasoning,
      reasoning: r.reasoning,
      ...(r.streamedLive ? { skipAnswerTokenReplay: true as const } : {}),
    };
  }
}
