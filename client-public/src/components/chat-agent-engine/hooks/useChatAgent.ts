import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  INITIAL_SESSION,
  parseSseStream,
  streamReducer,
  type AgentSseEvent,
  type Message,
  type StreamSession,
  type TimelineItem,
} from "../../../lib/chat-agent";
import { timelineToMessageThinking } from "../parts/AssistantThinking";
import type { AssistantPhasePayload, ContextOverflowStrategy } from "../types";
import { InternalToolRegistry } from "../tools/internal-registry";
import type { InternalTool, ParsedMcpServer } from "../tools/types";

const BOTTOM_STICKY_PX = 100;

type Params = {
  baseUrl: string;
  conversationId: string | null;
  temperature?: number;
  contextOverflow?: ContextOverflowStrategy;
  internalTools?: InternalTool[];
  externalMcpServers?: ParsedMcpServer[];
  debugMode?: boolean;
  onCreateConversation?: () => Promise<string | null>;
  onConversationPatch?: (patch: { id: string; title?: string }) => void;
  onError?: (msg: string) => void;
  onAssistantDone?: (userMsg: Message, assistantMsg: Message) => void;
};

export type UseChatAgentReturn = {
  messages: Message[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isSending: boolean;
  isWaiting: boolean;
  isLoadingMsgs: boolean;
  streamBuffer: string;
  elapsedSec: number;
  processTimeline: TimelineItem[];
  thinkingDeltaBuffer: string;
  streamingNarrativeAfterTool: boolean;
  phaseInfo: AssistantPhasePayload | null;
  messagesScrollRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleMessagesScroll: () => void;
  sendWithContent: (content: string) => Promise<void>;
  stopInference: () => void;
  toolRegistry: InternalToolRegistry;
};

async function fetchMessages(baseUrl: string, conversationId: string): Promise<Message[]> {
  const res = await fetch(
    `${baseUrl}/api/auth/chat/conversations/${conversationId}/messages`,
    { credentials: "include", headers: { "Content-Type": "application/json" } }
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.success) {
    const err = new Error(payload?.message ?? "Gagal memuat pesan");
    throw err;
  }
  return (payload.data ?? []) as Message[];
}

export function useChatAgent({
  baseUrl,
  conversationId,
  temperature,
  contextOverflow,
  internalTools,
  externalMcpServers,
  debugMode = false,
  onCreateConversation,
  onConversationPatch,
  onError,
  onAssistantDone,
}: Params): UseChatAgentReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  // tick buat elapsed timer — di luar reducer supaya tidak polusi state
  const [, setTick] = useState(0);

  const [session, dispatch] = useReducer(streamReducer, INITIAL_SESSION);

  const sessionRef = useRef<StreamSession>(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // ref buat conversationId terkini (dipakai di async flow)
  const conversationIdRef = useRef<string | null>(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const abortRef = useRef<AbortController | null>(null);
  const stickToBottomRef = useRef(true);

  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // registry internal tools — recompute kalau props berubah
  const toolRegistry = useMemo(
    () => new InternalToolRegistry(internalTools ?? []),
    [internalTools]
  );

  // derived values
  const isSending = session.phase.name !== "idle";
  const isWaiting = session.phase.name === "pending" || session.phase.name === "thinking";
  const streamBuffer = session.answerBuffer;
  const thinkingDeltaBuffer = session.thinkingBuffer;
  const processTimeline = session.timeline;

  const elapsedSec =
    session.startedAt != null ? (Date.now() - session.startedAt) / 1000 : 0;

  const phaseInfo: AssistantPhasePayload | null =
    session.phase.name === "thinking"
      ? { phase: "thinking", step: session.phase.step, label: session.phase.label }
      : session.phase.name === "pending"
        ? { phase: "thinking", step: 0, label: "" }
        : null;

  const lastTimelineItem = session.timeline[session.timeline.length - 1] ?? null;
  const streamingNarrativeAfterTool =
    lastTimelineItem?.kind === "tool" && lastTimelineItem.status !== "running";

  // elapsed timer — tick tiap 100ms selama sending
  useEffect(() => {
    if (!isSending || session.startedAt == null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(id);
  }, [isSending, session.startedAt]);

  // auto-scroll ke bawah
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = messagesScrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (fromBottom >= BOTTOM_STICKY_PX) return;
    if (isSending && !isWaiting) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer, isWaiting, isSending, processTimeline, thinkingDeltaBuffer]);

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // abort saat unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // reset + load pesan saat conversationId berubah
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: "ABORT" });
    stickToBottomRef.current = true;

    if (!conversationId) {
      setMessages([]);
      return;
    }

    const activeId = conversationId;
    (async () => {
      setIsLoadingMsgs(true);
      setMessages([]);
      try {
        const data = await fetchMessages(baseUrl, activeId);
        if (conversationIdRef.current === activeId) {
          setMessages(data);
        }
      } catch {
        if (conversationIdRef.current === activeId) {
          setMessages([]);
        }
      } finally {
        if (conversationIdRef.current === activeId) {
          setIsLoadingMsgs(false);
        }
      }
    })();
  }, [conversationId, baseUrl]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = fromBottom < BOTTOM_STICKY_PX;
  }, []);

  // POST hasil eksekusi client-side tool ke backend. backend akan resolve
  // promise yg lagi pending di inference loop.
  const postClientToolResult = useCallback(
    async (
      convId: string,
      payload: { callId: string; ok: boolean; content?: string; error?: string }
    ) => {
      await fetch(
        `${baseUrl}/api/auth/chat/conversations/${convId}/messages/stream/tool-result`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      ).catch((err) => {
        console.warn("[chat-agent] gagal post tool-result:", err);
      });
    },
    [baseUrl]
  );

  const handleEvent = useCallback(
    (event: AgentSseEvent) => {
      switch (event.type) {
        case "status":
          dispatch({ type: "STATUS", phase: event.phase, label: event.label, step: event.step });
          break;

        case "thinking_delta":
          dispatch({ type: "THINKING_DELTA", content: event.content });
          break;

        case "thinking_step":
          dispatch({ type: "THINKING_STEP", step: event });
          break;

        case "tool_call":
          dispatch({ type: "TOOL_CALL", id: event.id, name: event.name, args: event.args });
          break;

        case "client_tool_call": {
          // tampilkan di timeline sebagai tool running
          dispatch({ type: "TOOL_CALL", id: event.id, name: event.name, args: event.args });

          const convId = conversationIdRef.current;
          if (!convId) break;

          const tool = toolRegistry.get(event.name);
          if (!tool) {
            void postClientToolResult(convId, {
              callId: event.id,
              ok: false,
              error: `Tool "${event.name}" tidak terdaftar di client`,
            });
            break;
          }

          void (async () => {
            try {
              const result = await tool.execute(event.args);
              const content = typeof result === "string" ? result : JSON.stringify(result);
              await postClientToolResult(convId, {
                callId: event.id,
                ok: true,
                content,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              await postClientToolResult(convId, {
                callId: event.id,
                ok: false,
                error: msg,
              });
            }
          })();
          break;
        }

        case "tool_result":
          dispatch({
            type: "TOOL_RESULT",
            id: event.id,
            name: event.name,
            ok: event.ok,
            content: event.content,
            error: event.error,
          });
          break;

        case "text_delta":
          dispatch({ type: "TEXT_DELTA", content: event.content });
          break;

        case "done": {
          const { timeline, thinkingBuffer, startedAt, optimisticId } = sessionRef.current;
          const wallSec = startedAt != null ? (Date.now() - startedAt) / 1000 : 0;

          let assistantMsg = event.assistantMessage;
          if (!assistantMsg.thinking) {
            const merged = timelineToMessageThinking(timeline, thinkingBuffer, wallSec);
            if (merged) assistantMsg = { ...assistantMsg, thinking: merged };
          }

          setMessages((prev) => [
            ...prev.filter((m) => m.id !== optimisticId),
            event.userMessage,
            assistantMsg,
          ]);

          dispatch({ type: "DONE" });
          onAssistantDone?.(event.userMessage, assistantMsg);
          break;
        }

        case "error":
          setMessages((prev) =>
            prev.filter((m) => m.id !== sessionRef.current.optimisticId)
          );
          dispatch({ type: "ERROR" });
          onError?.(event.message);
          break;
      }
    },
    [onError, onAssistantDone, toolRegistry, postClientToolResult]
  );

  const sendWithContent = useCallback(
    async (content: string) => {
      if (!content || isSending) return;

      let convId = conversationIdRef.current;
      if (!convId) {
        if (!onCreateConversation) {
          onError?.("Belum ada percakapan aktif");
          return;
        }
        const newId = await onCreateConversation();
        if (!newId) return;
        convId = newId;
      }

      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticMsg: Message = {
        id: optimisticId,
        conversation_id: convId,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      stickToBottomRef.current = true;

      // optimistic: kasih tahu parent buat update title conversation
      onConversationPatch?.({ id: convId, title: content.slice(0, 50) });

      dispatch({ type: "SEND_START", optimisticId });

      // build payload. field tambahan (temperature, contextOverflow, tools)
      // dikirim ke server. kalau backend belum handle, akan di-ignore.
      const clientTools = toolRegistry.toDescriptors();
      const body: Record<string, unknown> = { content };
      if (temperature != null) body.temperature = temperature;
      if (contextOverflow) body.contextOverflow = contextOverflow;
      if (debugMode) body.debugMode = true;
      if (clientTools.length > 0) body.clientInternalTools = clientTools;
      if (externalMcpServers && externalMcpServers.length > 0) {
        body.clientExternalMcp = externalMcpServers.map((s) => ({
          id: s.id,
          command: s.command,
          args: s.args,
          // env sengaja ga dikirim — sensitif (password dll)
        }));
      }

      try {
        const res = await fetch(
          `${baseUrl}/api/auth/chat/conversations/${convId}/messages/stream`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: abort.signal,
          }
        );

        if (!res.ok || !res.body) {
          const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          throw new Error((json?.message as string) || `Server error: ${res.status}`);
        }

        for await (const event of parseSseStream(res.body)) {
          if (abort.signal.aborted) break;
          handleEvent(event);
          if (event.type === "done" || event.type === "error") break;
        }
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === "AbortError") {
          dispatch({ type: "ABORT" });

          // reload pesan setelah abort — mungkin ada yang sudah tersimpan di server
          const currentConvId = conversationIdRef.current;
          if (currentConvId) {
            void (async () => {
              try {
                const data = await fetchMessages(baseUrl, currentConvId);
                if (conversationIdRef.current === currentConvId) {
                  setMessages(data);
                }
              } catch {
                // biarkan pesan lokal
              }
            })();
          }
          return;
        }

        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        dispatch({ type: "ERROR" });
        const msg = err instanceof Error ? err.message : "Gagal mengirim pesan. Coba lagi.";
        onError?.(msg);
      }
    },
    [
      isSending,
      baseUrl,
      temperature,
      contextOverflow,
      toolRegistry,
      externalMcpServers,
      debugMode,
      onCreateConversation,
      onConversationPatch,
      onError,
      handleEvent,
    ]
  );

  const stopInference = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    input,
    setInput,
    isSending,
    isWaiting,
    isLoadingMsgs,
    streamBuffer,
    elapsedSec,
    processTimeline,
    thinkingDeltaBuffer,
    streamingNarrativeAfterTool,
    phaseInfo,
    messagesScrollRef,
    messagesEndRef,
    textareaRef,
    handleMessagesScroll,
    sendWithContent,
    stopInference,
    toolRegistry,
  };
}
