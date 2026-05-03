import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../common/api";

type AuthUser = {
  id: string;
  fullName: string;
  email: string;
} | null;

type AuthContextValue = {
  user: AuthUser;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  loginWithGoogle: async () => undefined,
  logout: async () => undefined,
});

const USER_STORAGE_KEY = "stockpick_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const me = await apiRequest<{ id: string; fullName: string; email: string }>("/api/auth/me");
      const nextUser = { id: me.id, fullName: me.fullName, email: me.email };
      setUser(nextUser);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      localStorage.removeItem(USER_STORAGE_KEY);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    const data = await apiRequest<{ authorizationUrl: string }>("/api/auth/google/start");
    window.location.href = data.authorizationUrl;
  };

  const logout = async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // tetap bersihkan state lokal
    }
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user?.id),
      isLoading,
      loginWithGoogle,
      logout,
    }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
