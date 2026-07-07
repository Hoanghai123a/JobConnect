import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { pb, type UserRecord } from "./pocketbase";
import { getPBUpstream } from "./pocketbase-config";
import { clearStaffCache } from "./staff-cache";

interface AuthCtx {
  user: UserRecord | null;
  loading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  login: (identity: string, password: string) => Promise<UserRecord>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const AUTH_REFRESH_TIMEOUT_MS = 3500;
let pendingAuthRefresh: Promise<unknown> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Auth refresh timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function refreshAuthOnce() {
  if (!pendingAuthRefresh) {
    pendingAuthRefresh = withTimeout(
      pb.collection("users").authRefresh(),
      AUTH_REFRESH_TIMEOUT_MS,
    ).finally(() => {
      pendingAuthRefresh = null;
    });
  }
  return pendingAuthRefresh;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setUser((pb.authStore.record as UserRecord | null) ?? null);
    }, false);
    // Validate the stored session before exposing authenticated UI.
    (async () => {
      try {
        if (pb.authStore.isValid) {
          await refreshAuthOnce();
          setUser((pb.authStore.record as UserRecord | null) ?? null);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.warn("[auth] refresh skipped", error);
        pb.authStore.clear();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => unsub();
  }, []);

  const login = useCallback(async (identity: string, password: string) => {
    const res = await fetch("/api/public/pocketbase-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = new Error(payload?.message || "Đăng nhập thất bại") as Error & {
        status?: number;
        data?: unknown;
      };
      error.status = res.status;
      error.data = payload?.data;
      throw error;
    }

    if (payload?.token && payload?.record) {
      pb.authStore.save(payload.token, payload.record);
    }

    return payload.record as UserRecord;
  }, []);

  const logout = useCallback(() => {
    pb.authStore.clear();
    clearStaffCache();
  }, []);

  const refresh = useCallback(async () => {
    if (pb.authStore.isValid) {
      await refreshAuthOnce();
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
        isStaff: user?.role === "staff",
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
