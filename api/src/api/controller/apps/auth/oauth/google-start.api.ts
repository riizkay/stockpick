import { SuccessResponse } from "@helper/Response";
import { getGoogleOAuthConfig } from "@services/auth/google-oauth";

export const endpoint = "/api/auth/google/start";

export default {
  GET: async () => {
    const { clientId, redirectUri } = getGoogleOAuthConfig();

    const missing: string[] = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");

    if (missing.length > 0) {
      return Response.json(
        {
          success: false,
          message: `Belum ada di api/.env: ${missing.join(", ")}. Pastikan file bernama .env (bukan api.env) di folder api.`,
        },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    return SuccessResponse({
      authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  },
};
