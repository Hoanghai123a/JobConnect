import { createFileRoute } from "@tanstack/react-router";
import { PhaserGame } from "@/game/PhaserGame";
import { GameStatusGuard } from "@/components/game/GameStatusGuard";

export const Route = createFileRoute("/_authenticated/garden")({
  component: GardenPage,
});

function GardenPage() {
  return (
    <GameStatusGuard>
      <PhaserGame />
    </GameStatusGuard>
  );
}
