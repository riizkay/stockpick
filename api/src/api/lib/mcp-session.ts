import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const servicesDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(servicesDir, "..", "..", "..", "..");
const defaultMcpEntry = join(defaultRepoRoot, "mcp", "src", "index.js");
const defaultMcpCwd = join(defaultRepoRoot, "mcp");

// session idle → tutup otomatis setelah 5 menit
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

function getMcpSpawnEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("STOCKBIT_")) continue;
    const v = process.env[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function getServerParams() {
  const command = process.env.STOCKBIT_MCP_COMMAND ?? "node";
  const entry = process.env.STOCKBIT_MCP_ENTRY ?? defaultMcpEntry;
  const cwd = process.env.STOCKBIT_MCP_CWD ?? defaultMcpCwd;
  return { command, args: [entry], cwd };
}

function looksLikeConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("closed") ||
    msg.includes("transport") ||
    msg.includes("terminated") ||
    msg.includes("econnreset")
  );
}

class PersistentMcpSession {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connectPromise: Promise<void> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  async withSession<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    await this.ensureConnected();
    this.scheduleIdleClose();

    try {
      return await fn(this.client!);
    } catch (err) {
      if (looksLikeConnectionError(err)) {
        console.warn("[mcp-session] connection error, reconnecting:", (err as Error).message);
        await this.reconnect();
        return fn(this.client!);
      }
      throw err;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.client) return;

    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });

    await this.connectPromise;
  }

  private async connect(): Promise<void> {
    const { command, args, cwd } = getServerParams();
    const transport = new StdioClientTransport({
      command,
      args,
      cwd,
      stderr: "pipe",
      env: getMcpSpawnEnv(),
    });
    const client = new Client({ name: "stock-agent-api", version: "1.0.0" });
    await client.connect(transport);
    this.client = client;
    this.transport = transport;
  }

  private async reconnect(): Promise<void> {
    await this.closeInternal();
    await this.connect();
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.closeInternal();
    }, IDLE_TIMEOUT_MS);
  }

  private async closeInternal(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const c = this.client;
    const t = this.transport;
    this.client = null;
    this.transport = null;
    await c?.close().catch(() => {});
    await t?.close().catch(() => {});
  }
}

const session = new PersistentMcpSession();

export function withPersistentMcpSession<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  return session.withSession(fn);
}
