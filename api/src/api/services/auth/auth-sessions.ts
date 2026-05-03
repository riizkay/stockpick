import jwt from "jsonwebtoken";
import { ApiError } from "@helper/Response";

const sessionSecret = process.env.JWT_SECRET || "stock-agent-dev-secret";

export const SESSION_COOKIE_NAME = "stockpick_token";

export type PublicJwtPayload = {
  type: "public";
  userId: string;
  email: string;
  fullName: string;
};

export function createPublicSessionToken(payload: { userId: string; email: string; fullName: string }) {
  return jwt.sign(
    {
      type: "public",
      userId: payload.userId,
      email: payload.email,
      fullName: payload.fullName,
    },
    sessionSecret,
    {
      expiresIn: "7d",
    }
  );
}

export function createInternalSessionToken(payload: { userId: string; role: string }) {
  return jwt.sign(
    {
      type: "internal",
      ...payload,
    },
    sessionSecret,
    {
      expiresIn: "1d",
    }
  );
}

export function verifySessionToken(token: string) {
  try {
    return jwt.verify(token, sessionSecret);
  } catch {
    throw new ApiError("Session tidak valid", 401);
  }
}

export function verifyPublicSessionToken(token: string): PublicJwtPayload {
  const decoded = verifySessionToken(token);
  if (typeof decoded !== "object" || decoded === null) {
    throw new ApiError("Session tidak valid", 401);
  }
  const o = decoded as Record<string, unknown>;
  if (o.type !== "public" || typeof o.userId !== "string") {
    throw new ApiError("Session tidak valid", 401);
  }
  return {
    type: "public",
    userId: o.userId,
    email: typeof o.email === "string" ? o.email : "",
    fullName: typeof o.fullName === "string" ? o.fullName : "",
  };
}

export function parseSessionTokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim() || null;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(trimmed.slice(SESSION_COOKIE_NAME.length + 1));
    }
  }

  return null;
}

export function buildSessionCookie(token: string) {
  const maxAge = 60 * 60 * 24 * 7;
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function buildClearSessionCookie() {
  const secure = process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
