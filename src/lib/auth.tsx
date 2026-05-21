import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { pb, type UserRecord } from "./pocketbase";

interface AuthCtx {
  user: UserRecord | null;
  loading: boolean;
  isAdmin: boolean;
  login: (identity: string, password: string) => Promise<UserRecord>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const AUTH_REFRESH_TIMEOUT_MS = 3500;

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      setUser((pb.authStore.record as UserRecord | null) ?? null);
    }, false);
    // initial refresh
    (async () => {
      try {
        if (pb.authStore.isValid) {
          setUser((pb.authStore.record as UserRecord | null) ?? null);
          await withTimeout(pb.collection("users").authRefresh(), AUTH_REFRESH_TIMEOUT_MS);
        }
      } catch (error) {
        console.warn("[auth] refresh skipped", error);
      } finally {
        setUser((pb.authStore.record as UserRecord | null) ?? null);
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
  }, []);

  const refresh = useCallback(async () => {
    if (pb.authStore.isValid) {
      await pb.collection("users").authRefresh();
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === "admin",
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
