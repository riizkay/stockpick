import { ApiError, SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { listMessages, sendMessage } from "@services/chat/chat-service";

export const endpoint = "/api/auth/chat/conversations/:id/messages";

export default {
  GET: async (_request: Request, server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    const user = requirePublicUser(context);
    const conversationId = server.params?.id;

    if (!conversationId) {
      throw new ApiError("ID percakapan wajib ada", 400);
    }

    const data = await listMessages(user.userId, conversationId);
    return SuccessResponse(data);
  },
  POST: async (request: Request, server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    const user = requirePublicUser(context);
    const conversationId = server.params?.id;

    if (!conversationId) {
      throw new ApiError("ID percakapan wajib ada", 400);
    }

    const body = await request.json();
    const content = typeof body?.content === "string" ? body.content : "";

    if (!content) {
      throw new ApiError("Isi pesan wajib ada", 400);
    }

    const data = await sendMessage(user.userId, conversationId, content);
    return SuccessResponse(data, {
      status: 201,
    });
  },
};
