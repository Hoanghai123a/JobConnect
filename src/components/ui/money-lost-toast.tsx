import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { formatVND } from "@/lib/salary";

interface MoneyLostToastProps {
  amount: number;
  onComplete: () => void;
}

export function MoneyLostToast({ amount, onComplete }: MoneyLostToastProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Tạo animation giống Phaser Tween
    const animation = element.animate(
      [
        // Keyframe 0%: xuất hiện
        { transform: "translateY(0) scale(0.7)", opacity: 0 },
        // Keyframe 15%: bounce
        { transform: "translateY(0) scale(1.1)", opacity: 1, offset: 0.15 },
        // Keyframe 25%: ổn định
        { transform: "translateY(0) scale(1) rotate(0deg)", opacity: 1, offset: 0.25 },
        // Keyframe 70%: giữ nguyên
        { transform: "translateY(0) rotate(0deg)", opacity: 1, offset: 0.7 },
        // Keyframe 85%: bắt đầu bay
        { transform: "translateY(-60px) rotate(-1deg)", opacity: 0.9, offset: 0.85 },
        // Keyframe 100%: bay xa + fade
        { transform: "translateY(-100px) rotate(2deg)", opacity: 0 },
      ],
      {
        duration: 2500, // 2.5 giây tổng
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        fill: "forwards",
      },
    );

    // Chỉ gọi onComplete SAU KHI animation hoàn tất
    animation.onfinish = () => {
      onComplete();
    };

    return () => {
      animation.cancel();
    };
  }, [onComplete]);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center">
      <div ref={containerRef}>
        <div className="rounded-xl border border-red-200 bg-red-50/95 px-4 py-2.5 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2.5 text-red-950">
            <span className="text-2xl leading-none">😢</span>
            <span className="text-sm font-medium">
              bạn vừa rời xa <strong className="text-base font-semibold">{formatVND(amount)}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
