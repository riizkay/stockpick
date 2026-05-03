import { ApiError, SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { deleteConversation, renameConversation } from "@services/chat/chat-service";

export const endpoint = "/api/auth/chat/conversations/:id";

export default {
  PATCH: async (
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
    const title = typeof body?.title === "string" ? body.title : "";

    const data = await renameConversation(user.userId, conversationId, title);
    return SuccessResponse(data);
  },
  DELETE: async (
    _request: Request,
    server: { params?: Record<string, string> },
    context: Record<string, unknown>
  ) => {
    const user = requirePublicUser(context);
    const conversationId = server.params?.id;

    if (!conversationId) {
      throw new ApiError("ID percakapan wajib ada", 400);
    }

    await deleteConversation(user.userId, conversationId);
    return SuccessResponse(null);
  },
};
