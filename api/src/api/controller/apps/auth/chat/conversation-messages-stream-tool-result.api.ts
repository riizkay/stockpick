import { ApiError, SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { resolveClientToolCall } from "@lib/client-tool-bridge";

export const endpoint = "/api/auth/chat/conversations/:id/messages/stream/tool-result";

// dipanggil FE setelah eksekusi client-side tool selesai. backend pakai hasil
// ini buat resolve promise yg sedang di-await di runInferenceWithMcpTools.
export default {
  POST: async (
    request: Request,
    server: { params?: Record<string, string> },
    context: Record<string, unknown>
  ) => {
    const user = requirePublicUser(context);
    const conversationId = server.params?.id;

    if (!conversationId) {
      throw new ApiError("ID percakapan wajib ada", 400);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const callId = typeof body.callId === "string" ? body.callId.trim() : "";
    if (!callId) {
      throw new ApiError("callId wajib ada", 400);
    }

    const ok = body.ok === true;
    const content =
      typeof body.content === "string"
        ? body.content.slice(0, 200_000)
        : undefined;
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error.slice(0, 2000)
        : undefined;

    const resolved = resolveClientToolCall({
      callId,
      userId: user.userId,
      conversationId,
      payload: { ok, content, error },
    });

    if (!resolved) {
      // bisa karena: callId tidak terdaftar, sudah timeout, atau auth mismatch.
      // kasih 404 biar FE tau perlu abort.
      throw new ApiError("Tool call tidak ditemukan / sudah kadaluarsa", 404);
    }

    return SuccessResponse({ callId, received: true });
  },
};
