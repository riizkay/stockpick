import type { InternalTool } from "./types";

// registry simple — lookup tool by name. validasi nama unik.
export class InternalToolRegistry {
  private map: Map<string, InternalTool>;

  constructor(tools: InternalTool[] = []) {
    this.map = new Map();
    for (const t of tools) {
      if (this.map.has(t.name)) {
        throw new Error(`Internal tool duplikat: ${t.name}`);
      }
      this.map.set(t.name, t);
    }
  }

  get(name: string): InternalTool | undefined {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  list(): InternalTool[] {
    return Array.from(this.map.values());
  }

  // eksekusi tool by name. dipakai saat FE terima SSE client_tool_call dan
  // harus run tool-nya di browser lalu POST hasil ke /tool-result.
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.map.get(name);
    if (!tool) throw new Error(`Tool tidak terdaftar: ${name}`);
    const result = await tool.execute(args);
    return typeof result === "string" ? result : JSON.stringify(result);
  }

  // descriptor yg nanti bisa dikirim ke backend buat di-register ke LLM.
  // shape ringkas tanpa callback.
  toDescriptors() {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters ?? {},
    }));
  }
}
