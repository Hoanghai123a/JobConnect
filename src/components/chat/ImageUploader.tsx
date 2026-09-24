/**
 * ImageUploader - Upload và compress ảnh trước khi gửi
 * - Multi-select hỗ trợ tối đa 5 ảnh/tin nhắn
 * - Auto compress với maxWidth 1200px, quality 0.85
 * - Preview thumbnails trước khi gửi
 */

import { useState, useRef } from "react";
import { X, Image as ImageIcon, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

interface ImageFile {
  file: File;
  preview: string;
}

interface ImageUploaderProps {
  onImagesChange: (files: File[]) => void;
  maxImages?: number;
  className?: string;
}

export function ImageUploader({ onImagesChange, maxImages = 5, className }: ImageUploaderProps) {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [compressing, setCompressing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const remaining = maxImages - images.length;
    const toProcess = files.slice(0, remaining);

    if (toProcess.length === 0) {
      return;
    }

    setCompressing(true);

    try {
      const processed: ImageFile[] = [];

      for (const file of toProcess) {
        // Compress ảnh
        const compressed = await compressImage(file, {
          maxWidth: 1200,
          quality: 0.85,
        });

        // Tạo preview
        const preview = URL.createObjectURL(compressed);

        processed.push({
          file: compressed,
          preview,
        });
      }

      const newImages = [...images, ...processed];
      setImages(newImages);
      onImagesChange(newImages.map((img) => img.file));
    } catch (error) {
      console.error("Failed to process images:", error);
    } finally {
      setCompressing(false);
      // Reset input để có thể chọn lại cùng file
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    // Revoke URL để free memory
    URL.revokeObjectURL(images[index].preview);
    setImages(newImages);
    onImagesChange(newImages.map((img) => img.file));
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const canAddMore = images.length < maxImages;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, index) => (
            <div
              key={index}
              className="group relative h-20 w-20 overflow-hidden rounded-lg border shadow-sm"
            >
              <img
                src={img.preview}
                alt={`Preview ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                aria-label="Xóa ảnh"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {/* Add more button */}
          {canAddMore && (
            <button
              type="button"
              onClick={openFilePicker}
              disabled={compressing}
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-primary/50 bg-primary/5 text-primary transition hover:bg-primary/10 disabled:opacity-50"
            >
              {compressing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-[10px]">Thêm</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Initial upload button */}
      {images.length === 0 && (
        <button
          type="button"
          onClick={openFilePicker}
          disabled={compressing}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition hover:border-primary hover:bg-primary/5 hover:text-primary disabled:opacity-50"
        >
          {compressing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang xử lý...
            </>
          ) : (
            <>
              <ImageIcon className="h-4 w-4" />
              Thêm ảnh (tối đa {maxImages})
            </>
          )}
        </button>
      )}
    </div>
  );
}
