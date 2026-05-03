import { SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { createConversation, listConversationsPage } from "@services/chat/chat-service";

export const endpoint = "/api/auth/chat/conversations";

export default {
  GET: async (request: Request, _server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    const user = requirePublicUser(context);
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const parsedLimit = limitRaw ? Number(limitRaw) : 30;
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 30;
    const cursor = url.searchParams.get("cursor");

    const data = await listConversationsPage(user.userId, {
      limit,
      cursor,
    });
    return SuccessResponse(data);
  },
  POST: async (_request: Request, _server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    const user = requirePublicUser(context);
    const data = await createConversation(user.userId);
    return SuccessResponse(data, {
      status: 201,
    });
  },
};
