import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatMessagesList } from "./parts/ChatMessagesList";
import { StopIcon } from "./parts/StopIcon";
import { useChatAgent } from "./hooks/useChatAgent";
import type { ChatAgentEngineProps } from "./types";
import {
  assertExternalMcpAllowed,
  detectRuntimeMode,
  McpConfigError,
  parseExternalMcpConfig,
} from "./tools/mcp-config";

const DEFAULT_EMPTY_ICON = "💹";
const DEFAULT_WELCOME_ICON = "📈";

export function ChatAgentEngine({
  baseUrl,
  conversationId,
  onCreateConversation,
  onConversationPatch,
  onError,
  onAssistantDone,
  temperature,
  contextOverflow,
  internalTools,
  externalMcpConfig,
  title = "Chat Agent",
  subtitle,
  placeholder = "Ketik pesan...",
  suggestedQuestions = [],
  emptyStateTitle = "Mulai dengan pertanyaanmu",
  emptyStateSubtitle = "Atau pilih salah satu contoh di bawah",
  emptyStateIcon = DEFAULT_EMPTY_ICON,
  welcomeIcon = DEFAULT_WELCOME_ICON,
  welcomeTitle = "Mulai percakapan baru",
  welcomeSubtitle = "Buat percakapan lalu kirim pesan untuk mulai.",
  startButtonLabel = "Mulai Percakapan",
  isCreatingConversation = false,
  showHeaderStatusDot = true,
  debugMode = false,
}: ChatAgentEngineProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  // parse external mcp sekali saat string berubah. guard desktop mode.
  const externalMcpServers = useMemo(() => {
    try {
      const servers = parseExternalMcpConfig(externalMcpConfig);
      assertExternalMcpAllowed(servers, detectRuntimeMode());
      return servers;
    } catch (e) {
      const msg = e instanceof McpConfigError ? e.message : String(e);
      // report ke parent via onError + tampilkan di banner local
      setLocalError(msg);
      onError?.(msg);
      return [];
    }
  }, [externalMcpConfig, onError]);

  const {
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
  } = useChatAgent({
    baseUrl,
    conversationId,
    temperature,
    contextOverflow,
    internalTools,
    externalMcpServers,
    debugMode,
    onCreateConversation,
    onConversationPatch,
    onError,
    onAssistantDone,
  });

  // auto-dismiss error banner setelah 5 detik
  useEffect(() => {
    if (!localError) return;
    const t = setTimeout(() => setLocalError(null), 5000);
    return () => clearTimeout(t);
  }, [localError]);

  const sendMessage = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    // jangan kirim kalau masih streaming — biar input user tidak hilang
    if (isSending) return;
    setInput("");
    void sendWithContent(content);
  }, [input, isSending, setInput, sendWithContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const handleCreateConversation = useCallback(() => {
    if (!onCreateConversation) return;
    void onCreateConversation();
  }, [onCreateConversation]);

  const hasConversation = Boolean(conversationId);
  const showEmpty = hasConversation && !isLoadingMsgs && messages.length === 0 && !isSending;
  const showStreamBubble = isSending && !isWaiting && streamBuffer.length > 0;
  const showTypingDots = isSending && isWaiting;

  return (
    <>
      <div className="flex shrink-0 items-center gap-2.5 border-b border-slate-400/[0.06] bg-[#0a0f1e] px-7 py-4">
        {showHeaderStatusDot ? (
          <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]" />
        ) : null}
        <span className="text-sm font-semibold text-slate-400">{title}</span>
        {subtitle ? (
          <span className="text-xs text-slate-600">· {subtitle}</span>
        ) : null}
      </div>

      {localError ? (
        <div className="mx-7 mt-3 flex shrink-0 items-center justify-between gap-2 rounded-[10px] border border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-[13px] text-red-400">
          <span>{localError}</span>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-lg leading-none text-red-400"
          >
            ×
          </button>
        </div>
      ) : null}

      <div
        ref={messagesScrollRef}
        onScroll={handleMessagesScroll}
        className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-10 lg:px-14"
      >
        {!hasConversation ? (
          <div className="pt-20 text-center">
            <div className="mb-4 text-[40px] leading-none">{welcomeIcon}</div>
            <div className="mb-2 text-xl font-bold text-slate-200">{welcomeTitle}</div>
            <div className="mb-8 text-sm text-slate-600">{welcomeSubtitle}</div>
            {onCreateConversation ? (
              <button
                type="button"
                onClick={handleCreateConversation}
                disabled={isCreatingConversation}
                className="cursor-pointer rounded-xl border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-500/30"
              >
                {isCreatingConversation ? "Membuat..." : startButtonLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        {hasConversation && isLoadingMsgs ? (
          <div className="pt-[60px] text-center text-sm text-slate-600">Memuat pesan...</div>
        ) : null}

        {showEmpty ? (
          <div className="mx-auto max-w-[80rem]">
            <div className="pb-10 pt-[60px] text-center">
              <div className="mb-3 text-[32px] leading-none">{emptyStateIcon}</div>
              <div className="mb-1.5 text-lg font-bold text-slate-200">{emptyStateTitle}</div>
              <div className="text-[13px] text-slate-600">{emptyStateSubtitle}</div>
            </div>

            {suggestedQuestions.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5">
                {suggestedQuestions.map((q) => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => sendWithContent(q)}
                    disabled={isSending}
                    className="cursor-pointer rounded-xl border border-slate-400/10 bg-slate-950 px-4 py-3.5 text-left text-[13px] leading-snug text-slate-400 transition-colors hover:border-emerald-500/30 hover:text-slate-200 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {hasConversation &&
        (messages.length > 0 || showStreamBubble || showTypingDots || phaseInfo != null) ? (
          <ChatMessagesList
            messages={messages}
            messagesEndRef={messagesEndRef}
            showStreamBubble={showStreamBubble}
            streamBuffer={streamBuffer}
            showTypingDots={showTypingDots}
            elapsedSec={elapsedSec}
            processTimeline={processTimeline}
            thinkingDeltaBuffer={thinkingDeltaBuffer}
            streamingNarrativeAfterTool={streamingNarrativeAfterTool}
            phaseInfo={phaseInfo}
            onStopInference={isSending ? stopInference : undefined}
          />
        ) : null}
      </div>

      <div className="shrink-0 border-t border-slate-400/[0.06] bg-[#020617] px-6 pb-5 pt-4 sm:px-10 lg:px-14">
        <div className="mx-auto grid w-full max-w-[80rem] grid-cols-[1fr_auto] gap-2.5 rounded-2xl border border-slate-400/12 bg-slate-950 py-2.5 pl-[18px] pr-2.5 transition-colors focus-within:border-emerald-500/35">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="scrollbar-chat min-h-8 max-h-40 w-full resize-none overflow-auto border-0 bg-transparent py-1.5 text-sm leading-relaxed text-slate-200 outline-none"
          />
          <button
            type="button"
            onClick={isSending ? stopInference : sendMessage}
            disabled={!isSending && !input.trim()}
            title={isSending ? "Hentikan respons" : "Kirim"}
            aria-label={isSending ? "Hentikan respons" : "Kirim pesan"}
            className={
              "flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-[10px] border-0 text-base transition-colors " +
              (isSending
                ? "cursor-pointer bg-slate-700 text-slate-200 hover:bg-slate-600"
                : !input.trim()
                  ? "cursor-not-allowed bg-emerald-500/15 text-slate-600"
                  : "cursor-pointer bg-gradient-to-br from-emerald-500 to-emerald-600 text-white")
            }
          >
            {isSending ? <StopIcon className="h-[15px] w-[15px]" /> : "↑"}
          </button>
        </div>
        <div className="mx-auto mt-2 w-full max-w-[80rem] text-center text-[11px] text-slate-800">
          Enter untuk kirim · Shift+Enter untuk baris baru
        </div>
      </div>
    </>
  );
}
