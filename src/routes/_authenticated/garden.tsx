import { createFileRoute } from "@tanstack/react-router";
import { PhaserGame } from "@/game/PhaserGame";

export const Route = createFileRoute("/_authenticated/garden")({
  component: GardenPage,
});

function GardenPage() {
  return <PhaserGame />;
}
