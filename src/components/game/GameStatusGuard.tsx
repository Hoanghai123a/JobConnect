import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Activity } from "lucide-react";

type GameStatusGuardProps = {
  children: React.ReactNode;
};

export function GameStatusGuard({ children }: GameStatusGuardProps) {
  const [loading, setLoading] = useState(true);
  const [gameEnabled, setGameEnabled] = useState(false);

  useEffect(() => {
    async function checkGameStatus() {
      try {
        // Lấy setting game_enabled từ PocketBase
        const result = await pb.collection("coin_settings").getFirstListItem('setting_key = "game_enabled"');
        setGameEnabled((result.coin_amount ?? 1) === 1);
      } catch (error) {
        // Nếu không tìm thấy setting, mặc định là bật
        console.warn("Could not fetch game_enabled setting, defaulting to enabled", error);
        setGameEnabled(true);
      } finally {
        setLoading(false);
      }
    }

    checkGameStatus();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <DataLoadingState message="Đang kiểm tra trạng thái trò chơi..." />
      </div>
    );
  }

  if (!gameEnabled) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Activity className="h-16 w-16 text-muted-foreground opacity-50" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Đang phát triển</h2>
          <p className="text-sm text-muted-foreground">
            Trò chơi nông trại đang được nâng cấp.
            <br />
            Vui lòng quay lại sau!
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
