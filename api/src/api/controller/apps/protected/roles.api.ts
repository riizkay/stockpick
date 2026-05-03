import { SuccessResponse } from "@helper/Response";

export const endpoint = "/api/protected/roles";

export default {
  GET: async () => {
    return SuccessResponse([
      {
        id: "role-admin",
        name: "admin",
        permissions: [
          "users.read",
          "users.write",
          "roles.read",
          "roles.write",
          "stock.read",
          "stock.write",
        ],
      },
    ]);
  },
};
