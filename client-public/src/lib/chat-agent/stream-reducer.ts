import type { StreamAction, StreamSession, TimelineThought, TimelineTool } from "./types";
import { INITIAL_SESSION } from "./types";

export { INITIAL_SESSION };

export function streamReducer(
  state: StreamSession,
  action: StreamAction
): StreamSession {
  switch (action.type) {
    case "SEND_START":
      return {
        phase: { name: "pending" },
        thinkingBuffer: "",
        answerBuffer: "",
        timeline: [],
        startedAt: Date.now(),
        optimisticId: action.optimisticId,
      };

    case "STATUS": {
      if (action.phase === "thinking") {
        return {
          ...state,
          phase: { name: "thinking", step: action.step, label: action.label },
          // reset answer buffer saat masuk putaran thinking baru
          answerBuffer: "",
        };
      }
      if (action.phase === "tool_running") {
        return { ...state, phase: { name: "tool_running" } };
      }
      if (action.phase === "answering") {
        return { ...state, phase: { name: "answering" } };
      }
      return state;
    }

    case "THINKING_DELTA":
      return { ...state, thinkingBuffer: state.thinkingBuffer + action.content };

    case "THINKING_STEP": {
      const thoughtIndex = state.timeline.filter((x) => x.kind === "thought").length;
      const newThought: TimelineThought = {
        kind: "thought",
        id: `th-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        step: action.step,
        thoughtIndex,
      };
      // reset answer buffer kalau step ini diikuti tool call
      const resetAnswer = Boolean(action.step.followingTool);
      return {
        ...state,
        thinkingBuffer: "",
        answerBuffer: resetAnswer ? "" : state.answerBuffer,
        timeline: [...state.timeline, newThought],
      };
    }

    case "TOOL_CALL": {
      const toolItem: TimelineTool = {
        kind: "tool",
        id: action.id,
        name: action.name,
        status: "running",
        arguments: action.args,
      };
      return {
        ...state,
        phase: { name: "tool_running" },
        timeline: [...state.timeline, toolItem],
      };
    }

    case "TOOL_RESULT": {
      const next = [...state.timeline];
      for (let i = next.length - 1; i >= 0; i--) {
        const item = next[i]!;
        if (item.kind === "tool" && item.id === action.id) {
          next[i] = {
            ...item,
            status: action.ok ? "done" : "error",
            ...(action.error ? { error: action.error } : {}),
            ...(action.content ? { result: action.content } : {}),
          } as TimelineTool;
          break;
        }
      }
      return { ...state, timeline: next };
    }

    case "TEXT_DELTA":
      return {
        ...state,
        phase: { name: "answering" },
        answerBuffer: state.answerBuffer + action.content,
        thinkingBuffer: "",
      };

    case "DONE":
      return INITIAL_SESSION;

    case "ERROR":
    case "ABORT":
      return {
        ...state,
        phase: { name: "idle" },
        thinkingBuffer: "",
        answerBuffer: "",
        timeline: [],
        startedAt: null,
      };

    default:
      return state;
  }
}

