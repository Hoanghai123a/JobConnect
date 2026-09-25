/**
 * OptimizedImage Component
 * - Lazy loading với Intersection Observer
 * - Progressive loading (blur placeholder → full image)
 * - Cache ảnh trong IndexedDB
 * - Tự động retry khi load fail
 */

import { useState, useEffect, useRef } from "react";
import { imageCache } from "@/lib/image-cache";
import { cn } from "@/lib/utils";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  onClick?: () => void;
  loading?: "lazy" | "eager";
}

export function OptimizedImage({
  src,
  alt,
  className,
  width,
  height,
  onClick,
  loading = "lazy",
}: OptimizedImageProps) {
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (loading === "eager") {
      void loadImage();
      return;
    }

    // Lazy loading với Intersection Observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && state === "idle") {
            void loadImage();
          }
        });
      },
      {
        rootMargin: "200px", // Load trước 200px
        threshold: 0.01,
      },
    );

    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, loading]);

  const loadImage = async () => {
    if (state === "loading" || state === "loaded") return;

    setState("loading");

    try {
      // 1. Kiểm tra cache trước
      const cached = await imageCache.get(src);
      if (cached) {
        const url = URL.createObjectURL(cached);
        setObjectUrl(url);
        setState("loaded");
        return;
      }

      // 2. Fetch ảnh từ server
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const blob = await response.blob();

      // 3. Cache ảnh
      void imageCache.set(src, blob);

      // 4. Hiển thị ảnh
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
      setState("loaded");
      retryCountRef.current = 0;
    } catch (error) {
      console.error("Failed to load image:", error);

      // Retry tối đa 2 lần
      if (retryCountRef.current < 2) {
        retryCountRef.current++;
        setTimeout(() => void loadImage(), 1000 * retryCountRef.current);
      } else {
        setState("error");
      }
    }
  };

  const handleRetry = () => {
    retryCountRef.current = 0;
    setState("idle");
    void loadImage();
  };

  return (
    <div
      className={cn("relative overflow-hidden bg-muted", className)}
      style={{ width, height }}
    >
      {/* Placeholder với blur effect */}
      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted p-4 text-center">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-xs text-muted-foreground">Lỗi tải ảnh</p>
          <button
            onClick={handleRetry}
            className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Actual image */}
      <img
        ref={imgRef}
        src={objectUrl || undefined}
        alt={alt}
        onClick={onClick}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          state === "loaded" ? "opacity-100" : "opacity-0",
          onClick && "cursor-pointer",
        )}
        loading={loading}
      />
    </div>
  );
}
