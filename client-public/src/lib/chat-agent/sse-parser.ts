import type { AgentSseEvent } from "./types";

/**
 * Async generator — parse ReadableStream body jadi AgentSseEvent.
 * Bisa dipakai di berbagai hook/context tanpa coupling ke React.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AgentSseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";

      for (const part of parts) {
        const event = parseOneSseBlock(part);
        if (event) yield event;
      }
    }

    // flush sisa buffer
    if (buf.trim()) {
      const event = parseOneSseBlock(buf);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseOneSseBlock(block: string): AgentSseEvent | null {
  const line = block.trim();
  if (!line.startsWith("data:")) return null;
  try {
    return JSON.parse(line.slice(5).trim()) as AgentSseEvent;
  } catch {
    return null;
  }
}
