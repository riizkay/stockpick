import { SuccessResponse } from "@helper/Response";

export const endpoint = "/api/public/health";

export default {
  GET: async () => {
    return SuccessResponse({
      service: "stock-agent-api",
      status: "ok",
      time: new Date().toISOString(),
    });
  },
};
