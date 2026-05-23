import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackButton({
  className,
  fallback = "/",
}: {
  className?: string;
  fallback?: string;
}) {
  const nav = useNavigate();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    nav({ to: fallback as any });
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 active:bg-muted",
        className,
      )}
      aria-label="Quay lại"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  );
}
