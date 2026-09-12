import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type CurrentUser } from "../../lib/api";
import type { Role } from "../../types";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("learner");
  const [initialAuthError, setInitialAuthError] = useState<unknown>(null);

  const applyUser = useCallback((user: CurrentUser) => {
    setAuthenticated(true);
    setUserId(user.id);
    setRole(user.role);
  }, []);

  const clearAuth = useCallback(() => {
    setAuthenticated(false);
    setUserId(null);
    setRole("learner");
  }, []);

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      const user = await api.signInWithGoogle(credential);
      applyUser(user);
      setInitialAuthError(null);
      return user;
    },
    [applyUser],
  );

  const signOut = useCallback(() => {
    void api.logout().catch(() => undefined);
    api.clearAccessToken();
    clearAuth();
  }, [clearAuth]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const user = await api.me();
        if (active) applyUser(user);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          clearAuth();
          return;
        }
        setInitialAuthError(error);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyUser, clearAuth]);

  return {
    authenticated,
    authLoading,
    initialAuthError,
    role,
    signInWithGoogle,
    signOut,
    userId,
  };
}
