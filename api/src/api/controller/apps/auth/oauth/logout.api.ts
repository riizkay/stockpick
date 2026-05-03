import { SuccessResponse } from "@helper/Response";
import { buildClearSessionCookie } from "@services/auth/auth-sessions";

export const endpoint = "/api/auth/logout";

export default {
  POST: async () => {
    const res = SuccessResponse({ ok: true });
    res.headers.append("Set-Cookie", buildClearSessionCookie());
    return res;
  },
};
