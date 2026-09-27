import { createFileRoute } from "@tanstack/react-router";
import { PhaserGame } from "@/game/PhaserGame";
import { FarmLoader } from "@/game/components/FarmLoader";
import { useState } from "react";
import { pb } from "@/lib/pocketbase";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/farm")({
  component: FarmGamePage,
});

function FarmGamePage() {
  const [loaded, setLoaded] = useState(false);
  const isAuthenticated = pb.authStore.isValid;

  return (
    <>
      {!isAuthenticated && (
        <Alert variant="default" className="m-4 border-yellow-500 bg-yellow-50">
          <Info className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Chế độ chơi thử</AlertTitle>
          <AlertDescription className="text-yellow-700">
            Tiến độ chỉ lưu trên thiết bị này và sẽ bị mất khi xóa cache.{" "}
            <Link to="/login" className="underline font-medium hover:text-yellow-900">
              Đăng nhập
            </Link>{" "}
            để lưu vĩnh viễn.
          </AlertDescription>
        </Alert>
      )}

      <FarmLoader onLoaded={() => setLoaded(true)}>{loaded && <PhaserGame />}</FarmLoader>
    </>
  );
}
