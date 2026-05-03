import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const servicesDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = join(servicesDir, "..", "..", "..", "..");
const defaultMcpEntry = join(defaultRepoRoot, "mcp", "src", "index.js");
const defaultMcpCwd = join(defaultRepoRoot, "mcp");

export function isStockbitMcpEnabled(): boolean {
  return process.env.STOCKBIT_MCP_ENABLED !== "false";
}

/** Timeout tools/call (ms). Default SDK 60s sering kurang untuk money flow / fetch besar. */
export function getStockbitMcpCallToolTimeoutMs(): number {
  const raw = process.env.STOCKBIT_MCP_CALL_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 5_000) return n;
  }
  return 300_000;
}

export function callStockbitMcpTool(
  client: Client,
  name: string,
  arguments_: Record<string, unknown>
): ReturnType<Client["callTool"]> {
  return client.callTool({ name, arguments: arguments_ }, CallToolResultSchema, {
    timeout: getStockbitMcpCallToolTimeoutMs(),
  });
}

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

export async function withStockbitMcpSession<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const { command, args, cwd } = getServerParams();
  const transport = new StdioClientTransport({
    command,
    args,
    cwd,
    stderr: "pipe",
    env: getMcpSpawnEnv(),
  });
  const client = new Client({ name: "stock-agent-api", version: "1.0.0" });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

function formatOneToolBlock(t: {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}): string {
  const desc = (t.description ?? "").trim();
  const schemaJson = JSON.stringify(t.inputSchema, null, 2);
  return (
    `=== ${t.name} ===\n` +
    (desc ? `${desc}\n\n` : "") +
    "parameters (JSON Schema from MCP server, same idea as LM Studio / OpenAI function parameters):\n" +
    schemaJson
  );
}

export function formatMcpToolsForSystemPrompt(
  tools: Awaited<ReturnType<Client["listTools"]>>["tools"],
  maxToolRounds = 20
): string {
  if (!tools.length) return "";
  const blocks = tools.map((t) =>
    formatOneToolBlock({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as unknown as Record<string, unknown>,
    })
  );
  return (
    "\n\nYou have MCP tools. Below, each tool includes its full JSON Schema for `mcp_args` (required fields are listed under `required`; other keys are optional with defaults on the server — still set them when they improve coverage, e.g. money flow: days_back, limit, max_pages). " +
    "This matches how LM Studio exposes tool parameters to the model.\n\n" +
    "To call a tool, output a JSON object (no markdown fence), one bare line per call:\n" +
    '{"mcp_tool":"<tool_name>","mcp_args":{...}}\n' +
    "You may output several consecutive lines in one turn so the host can run them in parallel (different tickers or tools).\n\n" +
    blocks.join("\n\n---\n\n") +
    "\n\nWorkflow: treat each turn as “plan next move”. If you still lack facts, call the appropriate tool again (including the same tool) until you are satisfied you can answer. " +
    `You may use at most ${maxToolRounds} tool rounds in this session; after that you must answer from what you have.` +
    "\nIf no tool is needed, reply to the user directly in Indonesian (per the main system instructions)." +
    "\nIf a tool is needed: short plan is ok, then one or more JSON-only lines (parallel batch). " +
    "The JSON may appear in a reasoning channel; the host will still parse it."
  );
}

export async function listStockbitToolsForApi(): Promise<
  { name: string; description?: string; parameters: Record<string, unknown> }[]
> {
  return withStockbitMcpSession(async (client) => {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.inputSchema as unknown as Record<string, unknown>,
    }));
  });
}

export function serializeCallToolResult(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (result && typeof result === "object" && "toolResult" in result) {
    return JSON.stringify((result as { toolResult: unknown }).toolResult).slice(0, 120_000);
  }
  const r = result as {
    isError?: boolean;
    content?: Array<{ type: string; text?: string; [k: string]: unknown }>;
  };
  const chunks: string[] = [];
  if (r.isError) chunks.push("Tool mengembalikan error.");
  for (const c of r.content ?? []) {
    if (c.type === "text" && typeof c.text === "string") chunks.push(c.text);
    else chunks.push(JSON.stringify(c));
  }
  const out = chunks.join("\n");
  return out.length > 120_000 ? `${out.slice(0, 120_000)}\n…(truncated)` : out;
}
