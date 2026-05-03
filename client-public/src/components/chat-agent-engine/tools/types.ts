// tipe tools prototype. nanti dipakai dual-side (FE + BE).

// shape parameter tool sederhana — subset JSON schema
export type ToolParamSchema = {
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
  required?: boolean;
  enum?: (string | number)[];
  // untuk nested object
  properties?: Record<string, ToolParamSchema>;
  items?: ToolParamSchema;
};

// tools yang hidup di client — execute-nya callback JS biasa
export type InternalTool = {
  name: string;
  description: string;
  parameters?: Record<string, ToolParamSchema>;
  // callback return string (atau promise of string). string biasanya JSON.stringify
  // hasil — supaya format konsumsi model konsisten.
  execute: (args: Record<string, unknown>) => Promise<string> | string;
};

// shape satu server di mcp.json
export type ExternalMcpServerConfig = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// shape mcp.json full
export type ExternalMcpConfig = {
  mcpServers: Record<string, ExternalMcpServerConfig>;
};

// hasil parse mcp.json — jadi list server yg sudah tervalidasi
export type ParsedMcpServer = {
  id: string;
  command: string;
  args: string[];
  env: Record<string, string>;
};

// gabungan tools yg tersedia di sisi client (internal + external handle)
export type ClientToolsBundle = {
  internal: InternalTool[];
  externalServers: ParsedMcpServer[];
};

// mode runtime. mcp external hanya jalan di desktop.
export type RuntimeMode = "browser" | "desktop";
