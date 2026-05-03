// satu sumber kebenaran supaya authorize & token exchange pakai redirect_uri identik
export function getGoogleOAuthConfig() {
  const strip = (value: string) => {
    let s = value.trim();
    if (
      (s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))
    ) {
      s = s.slice(1, -1).trim();
    }
    return s;
  };

  return {
    clientId: strip(process.env.GOOGLE_CLIENT_ID ?? ""),
    clientSecret: strip(process.env.GOOGLE_CLIENT_SECRET ?? ""),
    redirectUri: strip(process.env.GOOGLE_REDIRECT_URI ?? ""),
  };
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, atau GOOGLE_REDIRECT_URI belum diset");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };

  if (!res.ok) {
    throw new Error(json.error_description ?? json.error ?? `Token HTTP ${res.status}`);
  }

  if (!json.access_token) {
    throw new Error("Google tidak mengembalikan access_token");
  }

  return json;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const json = (await res.json()) as GoogleUserInfo & { error?: string };

  if (!res.ok) {
    throw new Error(json.error ?? `Userinfo HTTP ${res.status}`);
  }

  if (!json.sub) {
    throw new Error("Profil Google tidak punya sub");
  }

  return json;
}
