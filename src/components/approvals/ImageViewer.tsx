import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ImageViewer({
  images,
  className,
}: {
  images: { url: string; thumbUrl: string }[];
  className?: string;
}) {
  const [viewIdx, setViewIdx] = useState<number | null>(null);

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
              className="h-16 w-16 overflow-hidden rounded-lg border shadow-sm transition hover:shadow-md active:scale-95"
            >
              <img
                src={img.thumbUrl}
                alt={`Ảnh ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={viewIdx !== null} onOpenChange={() => setViewIdx(null)}>
        <DialogContent className="max-w-[95vw] p-2 sm:max-w-2xl">
          {viewIdx !== null && (
            <img
              src={images[viewIdx].url}
              alt={`Ảnh ${viewIdx + 1}`}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
