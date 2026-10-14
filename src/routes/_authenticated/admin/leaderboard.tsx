import { createFileRoute, redirect } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Users, Settings, Upload } from "lucide-react";
import { AdminRankingsTab } from "@/components/leaderboard/admin/AdminRankingsTab";
import { AdminStaffManagementTab } from "@/components/leaderboard/admin/AdminStaffManagementTab";
import { AdminSettingsTab } from "@/components/leaderboard/admin/AdminSettingsTab";
import { AdminImportTab } from "@/components/leaderboard/admin/AdminImportTab";
import { useAuth } from "@/lib/auth";
import { pb, type UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/admin/leaderboard")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (typeof window !== "undefined" && currentUser?.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: AdminLeaderboardPage,
});

function AdminLeaderboardPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Xếp hạng giờ làm</h1>
        <p className="text-muted-foreground mt-2">
          Quản lý bảng xếp hạng giờ làm của nhân viên nội bộ
        </p>
      </div>

      <Tabs defaultValue="rankings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="rankings" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            <span className="hidden sm:inline">Xếp hạng</span>
          </TabsTrigger>
          <TabsTrigger value="staff" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Quản lý NV</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Cài đặt</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Import</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rankings">
          <AdminRankingsTab />
        </TabsContent>

        <TabsContent value="staff">
          <AdminStaffManagementTab />
        </TabsContent>

        <TabsContent value="settings">
          <AdminSettingsTab />
        </TabsContent>

        <TabsContent value="import">
          <AdminImportTab adminUserId={user.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
