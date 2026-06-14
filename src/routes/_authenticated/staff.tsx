import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import { canAccessStaffWorkspace } from "@/lib/staff-permissions";

export const Route = createFileRoute("/_authenticated/staff")({
  beforeLoad: () => {
    const user = pb.authStore.record as any;
    if (!user || !canAccessStaffWorkspace(user)) {
      throw redirect({ to: "/" });
    }
  },
  component: StaffLayout,
});

function StaffLayout() {
  return <Outlet />;
}
