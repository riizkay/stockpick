// Tipe-tipe inti untuk chat agent framework.
// Bisa dipakai ulang di project lain.

export type Conversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type ThinkingStepPayload = {
  seconds: number;
  reasoning: string;
  assistantNarrative: string;
  followingTool: string | null;
  followingTools?: string[];
};

export type MessageThinking = {
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

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  thinking?: MessageThinking;
};

// Timeline item saat streaming berlangsung
export type TimelineThought = {
  kind: "thought";
  id: string;
  step: ThinkingStepPayload;
  thoughtIndex: number;
};

export type TimelineTool = {
  kind: "tool";
  id: string;
  name: string;
  status: "running" | "done" | "error";
  error?: string;
  arguments?: Record<string, unknown>;
  result?: string;
};

export type TimelineItem = TimelineThought | TimelineTool;

// Protokol SSE — discriminated union yang lengkap
export type AgentSseEvent =
  | {
      type: "status";
      phase: "thinking" | "tool_running" | "answering";
      label: string;
      step: number;
    }
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
  | { type: "done"; userMessage: Message; assistantMessage: Message }
  | { type: "error"; message: string; code?: string };

// State phase selama streaming
export type StreamPhase =
  | { name: "idle" }
  | { name: "pending" }
  | { name: "thinking"; step: number; label: string }
  | { name: "tool_running" }
  | { name: "answering" };

// State lengkap satu sesi streaming
export type StreamSession = {
  phase: StreamPhase;
  thinkingBuffer: string;
  answerBuffer: string;
  timeline: TimelineItem[];
  startedAt: number | null;
  optimisticId: string | null;
};

// Actions untuk reducer
export type StreamAction =
  | { type: "SEND_START"; optimisticId: string }
  | { type: "STATUS"; phase: "thinking" | "tool_running" | "answering"; label: string; step: number }
  | { type: "THINKING_DELTA"; content: string }
  | { type: "THINKING_STEP"; step: ThinkingStepPayload }
  | { type: "TOOL_CALL"; id: string; name: string; args: Record<string, unknown> }
  | { type: "TOOL_RESULT"; id: string; name: string; ok: boolean; content?: string; error?: string }
  | { type: "TEXT_DELTA"; content: string }
  | { type: "DONE" }
  | { type: "ERROR" }
  | { type: "ABORT" };

export const INITIAL_SESSION: StreamSession = {
  phase: { name: "idle" },
  thinkingBuffer: "",
  answerBuffer: "",
  timeline: [],
  startedAt: null,
  optimisticId: null,
};
