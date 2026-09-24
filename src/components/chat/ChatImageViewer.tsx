/**
 * ChatImageViewer - Image gallery cho chat với zoom & pinch
 * Kế thừa ImageViewer + thêm zoom/pinch gesture
 */

import { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { OptimizedImage } from "./OptimizedImage";
import { cn } from "@/lib/utils";

interface ChatImageViewerProps {
  images: { url: string; thumbUrl: string }[];
  className?: string;
}

export function ChatImageViewer({ images, className }: ChatImageViewerProps) {
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartDistance, setTouchStartDistance] = useState<number | null>(null);

  const activeImage = viewIdx !== null ? images[viewIdx] : null;
  const canBrowse = images.length > 1;

  const closeViewer = useCallback(() => {
    setViewIdx(null);
    setTouchStartX(null);
    setScale(1);
    setTouchStartDistance(null);
  }, []);

  const showPrev = useCallback(() => {
    setViewIdx((current) => {
      if (current === null) return current;
      return current === 0 ? images.length - 1 : current - 1;
    });
    setScale(1);
  }, [images.length]);

  const showNext = useCallback(() => {
    setViewIdx((current) => {
      if (current === null) return current;
      return current === images.length - 1 ? 0 : current + 1;
    });
    setScale(1);
  }, [images.length]);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.5, 1));
  }, []);

  useEffect(() => {
    if (!activeImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft" && canBrowse) showPrev();
      if (event.key === "ArrowRight" && canBrowse) showNext();
      if (event.key === "+" || event.key === "=") zoomIn();
      if (event.key === "-" || event.key === "_") zoomOut();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeImage, canBrowse, closeViewer, showNext, showPrev, zoomIn, zoomOut]);

  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      setTouchStartX(event.touches[0].clientX);
    } else if (event.touches.length === 2) {
      const distance = getTouchDistance(event.touches);
      setTouchStartDistance(distance);
      setTouchStartX(null);
    }
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length === 2 && touchStartDistance !== null) {
      const currentDistance = getTouchDistance(event.touches);
      if (currentDistance !== null) {
        const scaleChange = currentDistance / touchStartDistance;
        setScale((prev) => Math.max(1, Math.min(4, prev * scaleChange)));
        setTouchStartDistance(currentDistance);
      }
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX === null || !canBrowse) {
      setTouchStartX(null);
      setTouchStartDistance(null);
      return;
    }

    const diff = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    setTouchStartDistance(null);

    if (Math.abs(diff) < 40) return;
    if (diff > 0) showPrev();
    else showNext();
  };

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
              className="group relative h-20 w-20 overflow-hidden rounded-lg border shadow-sm transition hover:shadow-md active:scale-95"
              aria-label={`Xem ảnh ${i + 1}`}
            >
              <OptimizedImage
                src={img.thumbUrl}
                alt={`Ảnh ${i + 1}`}
                className="h-full w-full rounded-lg"
                loading="lazy"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                <ZoomIn className="h-5 w-5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeImage &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex touch-none select-none items-center justify-center bg-black/95 p-3"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeViewer();
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeViewer}
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-foreground shadow-lg transition hover:bg-white"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Zoom controls */}
            <div className="absolute left-3 top-3 z-10 flex gap-2">
              <button
                type="button"
                onClick={zoomOut}
                disabled={scale <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-foreground shadow-lg transition hover:bg-white disabled:opacity-50"
                aria-label="Thu nhỏ"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={scale >= 4}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-foreground shadow-lg transition hover:bg-white disabled:opacity-50"
                aria-label="Phóng to"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <div className="flex h-10 items-center rounded-full bg-black/60 px-3 text-sm font-medium text-white">
                {Math.round(scale * 100)}%
              </div>
            </div>

            {/* Navigation arrows */}
            {canBrowse && (
              <>
                <button
                  type="button"
                  onClick={showPrev}
                  className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition hover:bg-white sm:flex"
                  aria-label="Ảnh trước"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={showNext}
                  className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition hover:bg-white sm:flex"
                  aria-label="Ảnh tiếp"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                  {viewIdx! + 1}/{images.length}
                </div>
              </>
            )}

            {/* Main image */}
            <OptimizedImage
              src={activeImage.url}
              alt={`Ảnh ${viewIdx! + 1}`}
              className="max-h-[88dvh] max-w-[96vw] rounded-lg transition-transform duration-200"
              style={{ transform: `scale(${scale})` }}
              onClick={(event) => event.stopPropagation()}
              loading="eager"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
