// type aliases komponen/hook internal. chat-agent library asli tetap di
// src/lib/chat-agent — file ini cuma re-export + tipe spesifik engine.

import type { ReactNode } from "react";
import type { Message, TimelineItem } from "../../lib/chat-agent";
import type { InternalTool } from "./tools/types";

export type {
  AgentSseEvent,
  Conversation,
  Message,
  MessageThinking,
  ThinkingStepPayload,
  TimelineItem,
} from "../../lib/chat-agent";

// re-export tool types
export type {
  InternalTool,
  ExternalMcpConfig,
  ExternalMcpServerConfig,
  ParsedMcpServer,
  RuntimeMode,
  ToolParamSchema,
} from "./tools/types";

// alias back-compat
export type AssistantProcessTimelineItem = TimelineItem;

// phase payload yang ditampilkan saat streaming
export type AssistantPhasePayload = {
  phase: "thinking" | "tool_running" | "answering";
  step: number;
  label: string;
};

// strategi context overflow — dikirim ke server, server boleh ignore dulu
export type ContextOverflowStrategy = "rolling" | "truncate" | "stop";

// props utama ChatAgentEngine
export type ChatAgentEngineProps = {
  baseUrl: string;
  conversationId: string | null;
  // dipanggil kalau user kirim pesan padahal belum ada conversation
  onCreateConversation?: () => Promise<string | null>;
  // dipanggil parent utk sync list conversation (mis. update title)
  onConversationPatch?: (patch: { id: string; title?: string }) => void;
  // error callback — biasanya dipakai buat toast/banner di parent
  onError?: (message: string) => void;
  // dipanggil setelah round assistant selesai
  onAssistantDone?: (userMsg: Message, assistantMsg: Message) => void;

  // generation settings
  temperature?: number;
  contextOverflow?: ContextOverflowStrategy;

  // tools (prototype)
  internalTools?: InternalTool[];
  externalMcpConfig?: string;

  // UI config
  title?: ReactNode;
  subtitle?: ReactNode;
  placeholder?: string;
  suggestedQuestions?: string[];
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
  emptyStateIcon?: string;
  welcomeIcon?: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  // tombol mulai percakapan — dipakai saat belum ada conversationId
  startButtonLabel?: string;
  isCreatingConversation?: boolean;
  // tampilkan indikator online di header
  showHeaderStatusDot?: boolean;
  // kalau false, server tidak ikut kirim tool arguments & result ke SSE
  debugMode?: boolean;
};
