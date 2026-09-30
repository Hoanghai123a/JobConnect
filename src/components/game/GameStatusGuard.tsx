import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { PageContainer } from "@/components/layout/PageContainer";
import { Activity } from "lucide-react";

type GameStatusGuardProps = {
  children: React.ReactNode;
  settingKey?: string;
  gameName?: string;
};

export function GameStatusGuard({
  children,
  settingKey = "game_enabled",
  gameName = "nông trại"
}: GameStatusGuardProps) {
  const [loading, setLoading] = useState(true);
  const [gameEnabled, setGameEnabled] = useState(false);

  useEffect(() => {
    async function checkGameStatus() {
      try {
        // Lấy setting từ PocketBase
        const result = await pb.collection("coin_settings").getFirstListItem(`setting_key = "${settingKey}"`);
        // Kiểm tra field active
        setGameEnabled(result.active ?? true);
      } catch (error) {
        // Nếu không tìm thấy setting, mặc định là bật
        console.warn(`Could not fetch ${settingKey} setting, defaulting to enabled`, error);
        setGameEnabled(true);
      } finally {
        setLoading(false);
      }
    }

    checkGameStatus();
  }, [settingKey]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <DataLoadingState message="Đang kiểm tra trạng thái trò chơi..." />
      </div>
    );
  }

  if (!gameEnabled) {
    return (
      <PageContainer title="Đang phát triển" subtitle="" showNav>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <Activity className="h-16 w-16 text-muted-foreground opacity-50" />
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Đang phát triển</h2>
            <p className="text-sm text-muted-foreground">
              Trò chơi {gameName} đang được nâng cấp.
              <br />
              Vui lòng quay lại sau!
            </p>
          </div>
        </div>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
