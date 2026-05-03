import { db } from "@database";
import { ApiError } from "@helper/Response";
import {
  type ConversationHistoryItem,
  type SendMessageOptions,
  type SendMessageToolEvent,
  type ThinkingStepPayload,
  runAssistantReply,
} from "@services/inference/inference-runner";

export type { SendMessageOptions, SendMessageToolEvent, ThinkingStepPayload };

const MAX_HISTORY_MESSAGES = 20;

const MAX_THINKING_REASONING_STORE = 120_000;
const MAX_STEP_FIELD_STORE = 60_000;

export type AssistantThinkingPayload = {
  seconds: number;
  reasoning: string;
  tools: {
    name: string;
    ok: boolean;
    error?: string;
    arguments?: Record<string, unknown>;
    result?: string;
  }[];
  steps?: ThinkingStepPayload[];
};

export type AssistantPhasePayload = {
  phase: "inference";
  stepIndex: number;
  label: string;
};

function truncateThinkingForStorage(t: AssistantThinkingPayload): AssistantThinkingPayload {
  const clip = (s: string, max: number, tail: string) =>
    s.length <= max ? s : s.slice(0, max) + tail;

  const reasoning = clip(
    t.reasoning,
    MAX_THINKING_REASONING_STORE,
    "\n\n[… dipendekkan untuk penyimpanan]"
  );
  const steps = t.steps?.map((st) => ({
    ...st,
    reasoning: clip(st.reasoning, MAX_STEP_FIELD_STORE, "…"),
    assistantNarrative: clip(st.assistantNarrative, MAX_STEP_FIELD_STORE, "…"),
  }));
  return {
    ...t,
    reasoning,
    ...(steps && steps.length > 0 ? { steps } : {}),
  };
}

function parseThinkingFromMetadata(metadata: unknown): AssistantThinkingPayload | undefined {
  if (metadata == null) return undefined;
  let parsed: { thinking?: AssistantThinkingPayload };
  if (typeof metadata === "string") {
    try {
      parsed = JSON.parse(metadata) as { thinking?: AssistantThinkingPayload };
    } catch {
      return undefined;
    }
  } else if (typeof metadata === "object" && !Array.isArray(metadata)) {
    parsed = metadata as { thinking?: AssistantThinkingPayload };
  } else {
    return undefined;
  }
  const t = parsed.thinking;
  if (
    t &&
    typeof t.seconds === "number" &&
    typeof t.reasoning === "string" &&
    Array.isArray(t.tools)
  ) {
    return { ...t, ...(Array.isArray(t.steps) ? { steps: t.steps } : {}) };
  }
  return undefined;
}

function mapConversation(row: {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: unknown;
}) {
  const thinking = parseThinkingFromMetadata(row.metadata);
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role as "user" | "assistant",
    content: row.content,
    created_at: row.created_at,
    ...(thinking ? { thinking } : {}),
  };
}

function foldToolEvents(events: SendMessageToolEvent[]): AssistantThinkingPayload["tools"] {
  const pending = new Map<string, { name: string; arguments?: Record<string, unknown> }>();
  const out: AssistantThinkingPayload["tools"] = [];
  for (const ev of events) {
    if (ev.phase === "start") {
      pending.set(ev.id, { name: ev.name, arguments: ev.arguments });
    } else {
      const started = pending.get(ev.id);
      pending.delete(ev.id);
      if (!started) continue;
      const args = started.arguments;
      out.push({
        name: ev.name,
        ok: !ev.error,
        ...(args && Object.keys(args).length > 0 ? { arguments: args } : {}),
        ...(ev.error ? { error: ev.error } : {}),
        ...(ev.result && ev.result.length > 0 ? { result: ev.result } : {}),
      });
    }
  }
  return out;
}

async function getOwnedConversation(userId: string, conversationId: string) {
  const row = await db
    .selectFrom("conversations")
    .select(["id", "user_id", "title", "topic_id"])
    .where("id", "=", conversationId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  if (!row) {
    throw new ApiError("Percakapan tidak ditemukan", 404);
  }

  return row;
}

async function ensureTopic(
  userId: string,
  conversationId: string,
  title: string
): Promise<string> {
  const topicId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insertInto("topics").values({
    id: topicId,
    user_id: userId,
    title,
    created_at: now,
    updated_at: now,
  }).execute();

  await db
    .updateTable("conversations")
    .set({ topic_id: topicId })
    .where("id", "=", conversationId)
    .execute();

  return topicId;
}

export async function createConversation(userId: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .insertInto("conversations")
    .values({ id, user_id: userId, topic_id: null, title: null, created_at: now, updated_at: now })
    .execute();

  return mapConversation({ id, title: null, created_at: now, updated_at: now });
}

export async function listConversations(userId: string) {
  const rows = await db
    .selectFrom("conversations")
    .select(["id", "title", "created_at", "updated_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();

  return rows.map(mapConversation);
}

export type ConversationListPage = {
  items: ReturnType<typeof mapConversation>[];
  nextCursor: string | null;
};

function encodeConversationCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}\n${id}`, "utf8").toString("base64url");
}

function decodeConversationCursor(cursor: string): { created_at: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const nl = raw.indexOf("\n");
    if (nl < 0) return null;
    const created_at = raw.slice(0, nl);
    const id = raw.slice(nl + 1);
    if (!created_at || !id) return null;
    return { created_at, id };
  } catch {
    return null;
  }
}

export async function listConversationsPage(
  userId: string,
  opts: { limit: number; cursor: string | null }
): Promise<ConversationListPage> {
  const take = Math.min(100, Math.max(1, opts.limit));
  const decoded = opts.cursor ? decodeConversationCursor(opts.cursor) : null;

  if (opts.cursor && !decoded) {
    throw new ApiError("Cursor tidak valid", 400);
  }

  let qb = db
    .selectFrom("conversations")
    .select(["id", "title", "created_at", "updated_at"])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(take + 1);

  if (decoded) {
    qb = qb.where((eb) =>
      eb.or([
        eb("created_at", "<", decoded.created_at),
        eb.and([eb("created_at", "=", decoded.created_at), eb("id", "<", decoded.id)]),
      ])
    );
  }

  const rows = await qb.execute();
  const hasMore = rows.length > take;
  const slice = hasMore ? rows.slice(0, take) : rows;
  const items = slice.map(mapConversation);

  const last = slice[slice.length - 1];
  const nextCursor =
    hasMore && last ? encodeConversationCursor(last.created_at, last.id) : null;

  return { items, nextCursor };
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string
) {
  const conv = await getOwnedConversation(userId, conversationId);
  const trimmed = title.trim().slice(0, 200);
  if (!trimmed) {
    throw new ApiError("Judul wajib diisi", 400);
  }

  await db
    .updateTable("conversations")
    .set({ title: trimmed })
    .where("id", "=", conversationId)
    .execute();

  if (conv.topic_id) {
    await db
      .updateTable("topics")
      .set({ title: trimmed })
      .where("id", "=", conv.topic_id)
      .execute();
  }

  const row = await db
    .selectFrom("conversations")
    .select(["id", "title", "created_at", "updated_at"])
    .where("id", "=", conversationId)
    .executeTakeFirst();

  if (!row) {
    throw new ApiError("Percakapan tidak ditemukan", 404);
  }

  return mapConversation(row);
}

export async function deleteConversation(userId: string, conversationId: string) {
  await getOwnedConversation(userId, conversationId);
  await db.deleteFrom("conversations").where("id", "=", conversationId).execute();
}

export async function listMessages(userId: string, conversationId: string) {
  await getOwnedConversation(userId, conversationId);

  const rows = await db
    .selectFrom("messages")
    .select(["id", "conversation_id", "role", "content", "metadata", "created_at"])
    .where("conversation_id", "=", conversationId)
    .orderBy("created_at", "asc")
    .execute();

  return rows.map(mapMessage);
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  content: string,
  options?: SendMessageOptions
) {
  const conv = await getOwnedConversation(userId, conversationId);
  const now = new Date().toISOString();

  // ambil history sebelum insert pesan user baru
  const historyRows = await db
    .selectFrom("messages")
    .select(["role", "content"])
    .where("conversation_id", "=", conversationId)
    .orderBy("created_at", "asc")
    .limit(MAX_HISTORY_MESSAGES)
    .execute();

  const history: ConversationHistoryItem[] = historyRows.map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));

  const userMsgId = crypto.randomUUID();

  await db.insertInto("messages").values({
    id: userMsgId,
    conversation_id: conversationId,
    role: "user",
    content,
    metadata: null,
    created_at: now,
  }).execute();

  const wallStart = Date.now();
  const toolEvents: SendMessageToolEvent[] = [];
  const thinkingSteps: ThinkingStepPayload[] = [];

  const wrappedOptions: SendMessageOptions = {
    onToolEvent: (ev) => {
      toolEvents.push(ev);
      options?.onToolEvent?.(ev);
    },
    onThinkingStep: (st) => {
      thinkingSteps.push(st);
      options?.onThinkingStep?.(st);
    },
    onThinkingDelta: options?.onThinkingDelta,
    onAnswerDelta: options?.onAnswerDelta,
    onAssistantPhase: options?.onAssistantPhase,
    onClientToolCall: options?.onClientToolCall,
    clientInternalTools: options?.clientInternalTools,
    temperature: options?.temperature,
    contextOverflow: options?.contextOverflow,
  };

  let reply: string;
  let reasoningCombined: string;
  let skipAnswerTokenReplay = false;
  try {
    const out = await runAssistantReply(content, history, wrappedOptions);
    reply = out.text;
    reasoningCombined = out.reasoning;
    if (out.skipAnswerTokenReplay) skipAnswerTokenReplay = true;
  } catch (err) {
    // hapus user message kalau inference gagal
    await db.deleteFrom("messages").where("id", "=", userMsgId).execute();
    throw err;
  }

  const thinking: AssistantThinkingPayload = truncateThinkingForStorage({
    seconds: Math.round((Date.now() - wallStart) / 10) / 100,
    reasoning: reasoningCombined,
    tools: foldToolEvents(toolEvents),
    ...(thinkingSteps.length > 0 ? { steps: thinkingSteps } : {}),
  });

  const assistantMsgId = crypto.randomUUID();
  const assistantTime = new Date(Date.now() + 1).toISOString();
  const metadataJson = JSON.stringify({ thinking });

  await db.insertInto("messages").values({
    id: assistantMsgId,
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    metadata: metadataJson,
    created_at: assistantTime,
  }).execute();

  const isFirstMessage = !conv.title;
  const title = content.trim().slice(0, 80) || "Percakapan baru";

  if (isFirstMessage) {
    await ensureTopic(userId, conversationId, title);
    await db
      .updateTable("conversations")
      .set({ title, updated_at: assistantTime })
      .where("id", "=", conversationId)
      .execute();
  } else {
    await db
      .updateTable("conversations")
      .set({ updated_at: assistantTime })
      .where("id", "=", conversationId)
      .execute();
  }

  const userMessage = mapMessage({
    id: userMsgId,
    conversation_id: conversationId,
    role: "user",
    content,
    created_at: now,
  });

  const assistantMessage = mapMessage({
    id: assistantMsgId,
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    created_at: assistantTime,
    metadata: metadataJson,
  });

  return {
    userMessage,
    assistantMessage,
    thinking,
    ...(skipAnswerTokenReplay ? { skipAnswerTokenReplay: true as const } : {}),
  };
}
