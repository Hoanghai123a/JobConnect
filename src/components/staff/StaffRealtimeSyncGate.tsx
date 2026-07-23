import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchFactoryManagers, isFactoryAssignmentActive } from "@/lib/factories";
import { startStaffRealtimeSync, stopStaffRealtimeSync } from "@/lib/realtime-sync";

export function StaffRealtimeSyncGate() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    if (user.role !== "staff" && user.role !== "admin") return;

    let cancelled = false;
    (async () => {
      try {
        const managers = await fetchFactoryManagers(user.id);
        const managedFactoryIds = new Set(
          managers.filter((item) => isFactoryAssignmentActive(item)).map((item) => item.factory),
        );
        if (cancelled) return;
        await startStaffRealtimeSync(user, managedFactoryIds);
      } catch (error) {
        console.warn("[realtime-sync-gate] start failed", error);
      }
    })();

    return () => {
      cancelled = true;
      stopStaffRealtimeSync().catch((error) =>
        console.warn("[realtime-sync-gate] stop failed", error),
      );
    };
    // Only re-subscribe when identity/role changes, not on every user object change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  return null;
}
