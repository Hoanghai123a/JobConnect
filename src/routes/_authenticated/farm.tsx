import { createFileRoute } from "@tanstack/react-router";
import { PhaserGame } from "@/game/PhaserGame";
import { FarmLoader } from "@/game/components/FarmLoader";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/farm")({
  component: FarmGamePage,
});

function FarmGamePage() {
  const [loaded, setLoaded] = useState(false);

  return <FarmLoader onLoaded={() => setLoaded(true)}>{loaded && <PhaserGame />}</FarmLoader>;
}
