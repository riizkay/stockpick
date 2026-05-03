// legacy sanitizer — pesan lama di DB kadang masih berisi JSON {"mcp_tool":...}
// di dalam content. sekarang tool call sudah pakai native function calling,
// tapi file ini tetap ada buat render pesan lawas.

function extractBalancedJsonObject(s: string, start: number): string | null {
  if (start >= s.length || s[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i]!;
    if (inString) {
      if (escape) { escape = false; }
      else if (c === "\\") { escape = true; }
      else if (c === '"') { inString = false; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function formatArgsPlain(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => {
      if (v === null || v === undefined) return `${k}: —`;
      if (typeof v === "object") return `${k}: ${JSON.stringify(v)}`;
      return `${k}: ${String(v)}`;
    })
    .join(" · ");
}

function findNextMcpToolObjectStart(s: string, from: number): number {
  const sub = s.slice(from);
  const m = sub.match(/\{\s*"mcp_tool"\s*:/);
  return m && m.index !== undefined ? from + m.index : -1;
}

export function sanitizeAssistantAnswerForDisplay(raw: string): string {
  if (!raw.includes('"mcp_tool"')) return raw;

  let i = 0;
  const parts: string[] = [];

  while (i < raw.length) {
    const idx = findNextMcpToolObjectStart(raw, i);
    if (idx === -1) {
      parts.push(raw.slice(i));
      break;
    }
    parts.push(raw.slice(i, idx));
    const jsonStr = extractBalancedJsonObject(raw, idx);
    if (!jsonStr) break;
    try {
      const o = JSON.parse(jsonStr) as { mcp_tool?: unknown; mcp_args?: unknown };
      const name = typeof o.mcp_tool === "string" ? o.mcp_tool : null;
      const args =
        o.mcp_args != null && typeof o.mcp_args === "object" && !Array.isArray(o.mcp_args)
          ? (o.mcp_args as Record<string, unknown>)
          : null;
      if (name) {
        const argStr = args && Object.keys(args).length > 0 ? formatArgsPlain(args) : "";
        parts.push(
          argStr
            ? `\n\n· \`${name}\` — ${argStr}\n\n`
            : `\n\n· \`${name}\`\n\n`
        );
      } else {
        parts.push(jsonStr);
      }
    } catch {
      parts.push(jsonStr);
    }
    i = idx + jsonStr.length;
  }

  return parts.join("").replace(/\n{3,}/g, "\n\n").trimEnd();
}
