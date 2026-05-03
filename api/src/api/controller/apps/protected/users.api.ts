import { SuccessResponse } from "@helper/Response";

export const endpoint = "/api/protected/users";

export default {
  GET: async () => {
    return SuccessResponse([
      {
        id: "internal-user-1",
        fullName: "Admin Stock Agent",
        email: "admin@stock-agent.local",
        role: "admin",
      },
    ]);
  },
};
