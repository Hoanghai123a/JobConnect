import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";

export function ImageViewer({
  images,
  className,
}: {
  images: { url: string; thumbUrl: string }[];
  className?: string;
}) {
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const activeImage = viewIdx !== null ? images[viewIdx] : null;

  useEffect(() => {
    if (!activeImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewIdx(null);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeImage]);

  if (!images.length) return null;

  return (
    <>
      <div className={className}>
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setViewIdx(i)}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border shadow-sm transition hover:shadow-md active:scale-95"
              aria-label={`Xem ảnh ${i + 1} kích thước lớn`}
            >
              <img
                src={img.thumbUrl}
                alt={`Ảnh ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeImage &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6">
            <button
              type="button"
              onClick={() => setViewIdx(null)}
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-foreground shadow-lg transition hover:bg-white"
              aria-label="Đóng ảnh"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={activeImage.url}
              alt={`Ảnh ${viewIdx + 1}`}
              className="max-h-[88dvh] max-w-[96vw] rounded-lg object-contain shadow-2xl"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
