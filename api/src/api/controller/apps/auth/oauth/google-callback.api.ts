import { exchangeAuthorizationCode, fetchGoogleUserInfo } from "@services/auth/google-oauth";
import { upsertPublicUserFromGoogle } from "@services/auth/public-user-service";
import {
  buildSessionCookie,
  createPublicSessionToken,
} from "@services/auth/auth-sessions";

function frontendBaseUrl() {
  return (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").replace(/\/$/, "");
}

function redirectToApp(path: string, search?: Record<string, string>, setCookie?: string) {
  const url = new URL(path, `${frontendBaseUrl()}/`);
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      url.searchParams.set(k, v);
    }
  }
  const headers = new Headers({ Location: url.toString() });
  if (setCookie) {
    headers.append("Set-Cookie", setCookie);
  }
  return new Response(null, { status: 302, headers });
}

export const endpoint = "/api/auth/google/callback";

export default {
  GET: async (request: Request) => {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      return redirectToApp("/", {
        oauth_error: errorDescription || error,
      });
    }

    const code = url.searchParams.get("code");
    if (!code) {
      return redirectToApp("/", { oauth_error: "missing_code" });
    }

    try {
      const tokens = await exchangeAuthorizationCode(code);
      const profile = await fetchGoogleUserInfo(tokens.access_token);

      const email = profile.email?.trim();
      if (!email) {
        return redirectToApp("/", { oauth_error: "email_tidak_tersedia" });
      }

      const user = await upsertPublicUserFromGoogle({
        sub: profile.sub,
        email,
        name: profile.name?.trim() || email.split("@")[0] || "User",
      });

      const jwtToken = createPublicSessionToken({
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
      });

      return redirectToApp("/chat", undefined, buildSessionCookie(jwtToken));
    } catch {
      return redirectToApp("/", { oauth_error: "login_gagal" });
    }
  },
};
