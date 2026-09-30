import { createFileRoute } from "@tanstack/react-router";
import { GameStatusGuard } from "@/components/game/GameStatusGuard";

export const Route = createFileRoute("/_authenticated/gems")({
  component: GemsGamePage,
});

function GemsGamePage() {
  return (
    <GameStatusGuard settingKey="gems_game_enabled" gameName="kim cương">
      <div className="flex h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Trò chơi Kim cương</h1>
          <p className="text-muted-foreground">
            Game đang được phát triển...
          </p>
        </div>
      </div>
    </GameStatusGuard>
  );
}
