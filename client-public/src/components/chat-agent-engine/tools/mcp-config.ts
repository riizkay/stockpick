import type {
  ExternalMcpConfig,
  ExternalMcpServerConfig,
  ParsedMcpServer,
  RuntimeMode,
} from "./types";

// deteksi runtime mode. kalau window.electronAPI ada atau flag VITE_DESKTOP,
// artinya lagi di electron/tauri/desktop wrapper.
export function detectRuntimeMode(): RuntimeMode {
  if (typeof window === "undefined") return "browser";
  const w = window as unknown as { electronAPI?: unknown; __DESKTOP_RUNTIME__?: boolean };
  if (w.electronAPI || w.__DESKTOP_RUNTIME__) return "desktop";
  return "browser";
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

// parse string mcp.json jadi struktur server terpakai. return null kalau input
// kosong. throw McpConfigError kalau JSON invalid / shape salah.
export function parseExternalMcpConfig(raw: string | undefined | null): ParsedMcpServer[] {
  const txt = (raw ?? "").trim();
  if (!txt) return [];

  let json: unknown;
  try {
    json = JSON.parse(txt);
  } catch (e) {
    throw new McpConfigError(
      `mcp.json bukan JSON valid: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!json || typeof json !== "object") {
    throw new McpConfigError("mcp.json harus object root");
  }

  const cfg = json as Partial<ExternalMcpConfig>;
  const servers = cfg.mcpServers;
  if (!servers || typeof servers !== "object") {
    throw new McpConfigError("mcp.json butuh key `mcpServers`");
  }

  const out: ParsedMcpServer[] = [];
  for (const [id, value] of Object.entries(servers)) {
    const srv = value as Partial<ExternalMcpServerConfig>;
    if (!srv || typeof srv !== "object") {
      throw new McpConfigError(`server "${id}" harus object`);
    }
    if (typeof srv.command !== "string" || !srv.command.trim()) {
      throw new McpConfigError(`server "${id}" wajib punya field command`);
    }
    const args = Array.isArray(srv.args) ? srv.args.map((x) => String(x)) : [];
    const env: Record<string, string> = {};
    if (srv.env && typeof srv.env === "object") {
      for (const [k, v] of Object.entries(srv.env)) {
        env[k] = String(v);
      }
    }
    out.push({ id, command: srv.command, args, env });
  }
  return out;
}

// guard — throw kalau user config external mcp tapi runtime bukan desktop.
export function assertExternalMcpAllowed(
  servers: ParsedMcpServer[],
  mode: RuntimeMode = detectRuntimeMode()
) {
  if (servers.length === 0) return;
  if (mode !== "desktop") {
    throw new McpConfigError(
      "External MCP (mcp.json) hanya bisa dijalankan di mode desktop. " +
        "Di browser, pakai internalTools sebagai gantinya."
    );
  }
}
