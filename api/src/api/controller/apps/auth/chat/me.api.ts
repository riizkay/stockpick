import { SuccessResponse } from "@helper/Response";
import { requirePublicUser } from "@helper/public-user";

export const endpoint = "/api/auth/me";

export default {
  GET: async (_request: Request, _server: { params?: Record<string, string> }, context: Record<string, unknown>) => {
    const user = requirePublicUser(context);
    return SuccessResponse({
      id: user.userId,
      fullName: user.fullName,
      email: user.email,
    });
  },
};
