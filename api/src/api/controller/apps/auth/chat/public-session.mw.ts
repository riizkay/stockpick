import { parseSessionTokenFromRequest, verifyPublicSessionToken } from "@services/auth/auth-sessions";

export default async function publicSessionMiddleware(request: Request) {
  const token = parseSessionTokenFromRequest(request);
  if (!token) {
    return {
      publicUser: null,
    };
  }

  try {
    const payload = verifyPublicSessionToken(token);
    return {
      publicUser: {
        userId: payload.userId,
        email: payload.email,
        fullName: payload.fullName,
      },
    };
  } catch {
    return {
      publicUser: null,
    };
  }
}
