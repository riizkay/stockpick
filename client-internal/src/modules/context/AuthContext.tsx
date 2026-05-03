import { createContext, useContext, useMemo, useState } from "react";

type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
} | null;

type AuthContextValue = {
  user: AuthUser;
  isAuthenticated: boolean;
  loginDemo: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  loginDemo: () => undefined,
  logout: () => undefined,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user?.id),
      loginDemo: () => {
        setUser({
          id: "internal-user-demo",
          fullName: "Admin CMS",
          email: "admin@stock-agent.local",
          role: "admin",
        });
      },
      logout: () => {
        setUser(null);
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
