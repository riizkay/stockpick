import { ApiError } from "@helper/Response";

export type PublicUserContext = {
  userId: string;
  email: string;
  fullName: string;
};

export function requirePublicUser(context: Record<string, unknown>): PublicUserContext {
  const raw = context.publicUser;
  if (!raw || typeof raw !== "object") {
    throw new ApiError("Harus login", 401);
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.userId !== "string") {
    throw new ApiError("Harus login", 401);
  }
  return {
    userId: o.userId,
    email: typeof o.email === "string" ? o.email : "",
    fullName: typeof o.fullName === "string" ? o.fullName : "",
  };
}
