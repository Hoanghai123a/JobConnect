import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

/**
 * Component hiển thị overlay yêu cầu user xoay ngang điện thoại
 * Chỉ hiện khi orientation là portrait (dọc)
 */
export const LandscapeMode = () => {
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Kiểm tra nếu chiều cao > chiều rộng = portrait mode
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };

    // Check ngay khi mount
    checkOrientation();

    // Listen orientation change
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Nếu đang landscape (ngang) thì không hiện gì
  if (!isPortrait) return null;

  // Hiện overlay yêu cầu xoay ngang
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center text-white">
      <RotateCw className="w-20 h-20 mb-6 animate-pulse" />
      <h2 className="text-2xl font-bold mb-2">Vui lòng xoay ngang màn hình</h2>
      <p className="text-gray-300 text-center px-6">
        Game này được thiết kế cho chế độ nằm ngang
      </p>
    </div>
  );
};
