import type { RefObject } from "react";
import type {
  AssistantPhasePayload,
  AssistantProcessTimelineItem,
  Message,
} from "../types";
import {
  AssistantProcessChatRows,
  StockPickAssistantLabel,
  ThinkingCollapsible,
} from "./AssistantThinking";
import { ChatMessageMarkdown } from "./ChatMessageMarkdown";
import { StopIcon } from "./StopIcon";

export type ChatMessagesListProps = {
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  showStreamBubble: boolean;
  streamBuffer: string;
  showTypingDots: boolean;
  elapsedSec: number;
  processTimeline: AssistantProcessTimelineItem[];
  thinkingDeltaBuffer: string;
  streamingNarrativeAfterTool?: boolean;
  phaseInfo?: AssistantPhasePayload | null;
  onStopInference?: () => void;
};

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function ChatMessagesList({
  messages,
  messagesEndRef,
  showStreamBubble,
  streamBuffer,
  showTypingDots,
  elapsedSec,
  processTimeline,
  thinkingDeltaBuffer,
  streamingNarrativeAfterTool = false,
  phaseInfo = null,
  onStopInference,
}: ChatMessagesListProps) {
  const hasLiveTimeline =
    processTimeline.length > 0 ||
    thinkingDeltaBuffer.trim().length > 0 ||
    showTypingDots ||
    Boolean(phaseInfo?.label?.trim());

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-[50rem] grid-cols-[minmax(0,1fr)] gap-8">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={
            "flex w-full min-w-0 flex-col gap-1 transition-opacity duration-200 " +
            (msg.id.startsWith("optimistic-") ? "opacity-[0.65]" : "opacity-100") +
            " " +
            (msg.role === "user" ? "items-end" : "items-stretch")
          }
        >
          {msg.role === "assistant" ? <StockPickAssistantLabel /> : null}

          {msg.role === "user" ? (
            <div className="max-w-[min(80%,36rem)] break-words whitespace-pre-wrap rounded-[18px] rounded-br border border-blue-500/30 bg-blue-700 px-[18px] py-3.5 text-sm leading-relaxed text-slate-200">
              {msg.content}
            </div>
          ) : (
            <div className="w-full min-w-0 py-1.5 text-sm leading-relaxed text-slate-200">
              {msg.thinking ? <ThinkingCollapsible thinking={msg.thinking} /> : null}
              <ChatMessageMarkdown content={msg.content} />
            </div>
          )}

          <div
            className={
              "text-[11px] text-slate-600 " + (msg.role === "user" ? "pr-1" : "pl-0.5")
            }
          >
            {formatTime(msg.created_at)}
          </div>
        </div>
      ))}

      {hasLiveTimeline ? (
        <AssistantProcessChatRows
          items={processTimeline}
          streamingReasoning={thinkingDeltaBuffer}
          streamingNarrativeAfterTool={streamingNarrativeAfterTool}
          phaseInfo={phaseInfo}
          showWaitingPulse={
            !thinkingDeltaBuffer.trim() &&
            !showStreamBubble &&
            (showTypingDots || Boolean(phaseInfo?.label?.trim()))
          }
          elapsedSec={elapsedSec}
          onStop={onStopInference}
        />
      ) : null}

      {showStreamBubble ? (
        <div className="flex w-full min-w-0 flex-col gap-1">
          <StockPickAssistantLabel />
          <div className="w-full min-w-0 py-1.5 text-sm leading-relaxed text-slate-200">
            <ChatMessageMarkdown content={streamBuffer} />
            <span
              className="mb-0.5 ml-0.5 inline-block w-0.5 bg-emerald-500 align-text-bottom"
              style={{
                height: "1em",
                animation: "chat-cursor-blink 0.8s ease-in-out infinite",
              }}
            />
          </div>
          {onStopInference ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onStopInference}
                title="Hentikan respons"
                aria-label="Hentikan respons"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-500/25 bg-slate-800/80 text-slate-200 transition-colors hover:bg-slate-700/90"
              >
                <StopIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div ref={messagesEndRef} />
    </div>
  );
}
