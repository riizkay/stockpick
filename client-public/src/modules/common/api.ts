export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json();

  if (!response.ok || !payload?.success) {
    const err = new Error(payload?.message ?? "Request gagal") as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  return payload.data as T;
}
