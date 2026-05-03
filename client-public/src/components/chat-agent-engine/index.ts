export { ChatAgentEngine } from "./ChatAgentEngine";

export type {
  ChatAgentEngineProps,
  ContextOverflowStrategy,
  AssistantPhasePayload,
  AssistantProcessTimelineItem,
  Conversation,
  Message,
  MessageThinking,
  ThinkingStepPayload,
  TimelineItem,
  AgentSseEvent,
  // re-export dari tools/types
  InternalTool,
  ExternalMcpConfig,
  ExternalMcpServerConfig,
  ParsedMcpServer,
  RuntimeMode,
  ToolParamSchema,
} from "./types";

// tool helpers — dipakai consumer untuk build internal tools
export {
  InternalToolRegistry,
  McpConfigError,
  parseExternalMcpConfig,
  assertExternalMcpAllowed,
  detectRuntimeMode,
} from "./tools";

export { useChatAgent } from "./hooks/useChatAgent";
