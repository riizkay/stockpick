import { SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";
import { getToolMetadata } from "@services/tools/tool-registry";

export const endpoint = "/api/auth/chat/tools";

export default {
  GET: async (_request: Request, _server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    requirePublicUser(context);
    return SuccessResponse(await getToolMetadata());
  },
};
