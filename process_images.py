"""
Image Processing Pipeline
Automatically: Remove background → Resize to 64x64px → Convert to WebP

Usage:
    python process_images.py <input_directory>

Example:
    python process_images.py "D:\My App\JobConnect\public\game-assets\crops"
"""
import os
import sys
from pathlib import Path
from rembg import remove
from PIL import Image
from io import BytesIO


def remove_background(image_path):
    """Remove background from image"""
    with open(image_path, 'rb') as f:
        input_data = f.read()
    output_data = remove(input_data)
    return Image.open(BytesIO(output_data))


def resize_with_padding(img, target_size=64):
    """Resize image to target_size x target_size with padding"""
    width, height = img.size

    if width >= height:
        scale = target_size / width
        new_width = target_size
        new_height = int(height * scale)
    else:
        scale = target_size / height
        new_height = target_size
        new_width = int(width * scale)

    img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
    new_img = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
    paste_x = (target_size - new_width) // 2
    paste_y = (target_size - new_height) // 2
    new_img.paste(img_resized, (paste_x, paste_y), img_resized if img_resized.mode == 'RGBA' else None)

    return new_img


def process_image(input_path, output_path):
    """Complete pipeline: Remove background → Resize → Convert to WebP"""
    img_no_bg = remove_background(input_path)
    img_resized = resize_with_padding(img_no_bg, target_size=64)
    img_resized.save(output_path, 'WEBP', quality=95, method=6)


def process_directory(input_dir):
    """Process all PNG images in directory"""
    input_path = Path(input_dir)

    if not input_path.exists():
        print(f"❌ Error: Directory '{input_dir}' does not exist")
        return False

    if not input_path.is_dir():
        print(f"❌ Error: '{input_dir}' is not a directory")
        return False

    png_files = list(input_path.glob("*.png"))

    if not png_files:
        print(f"⚠️  No PNG files found in {input_dir}")
        return False

    print("=" * 70)
    print("🎨 IMAGE PROCESSING PIPELINE")
    print("=" * 70)
    print(f"📁 Input directory: {input_dir}")
    print(f"📊 Found {len(png_files)} PNG images to process")
    print()
    print("Pipeline steps:")
    print("  1️⃣  Remove background (transparent)")
    print("  2️⃣  Resize to 64x64px (with padding)")
    print("  3️⃣  Convert to WebP format")
    print("=" * 70)
    print()

    success_count = 0
    error_count = 0
    total_original_size = 0
    total_output_size = 0

    for i, png_file in enumerate(png_files, 1):
        try:
            output_file = input_path / (png_file.stem + '.webp')
            print(f"[{i}/{len(png_files)}] Processing {png_file.name}...")

            original_size = png_file.stat().st_size
            process_image(png_file, output_file)
            output_size = output_file.stat().st_size

            original_kb = original_size / 1024
            output_kb = output_size / 1024
            reduction = ((original_size - output_size) / original_size * 100) if original_size > 0 else 0

            print(f"  ✓ Success: {original_kb:.1f}KB → {output_kb:.1f}KB (-{reduction:.1f}%)")
            print()

            total_original_size += original_size
            total_output_size += output_size
            success_count += 1

        except Exception as e:
            print(f"  ✗ Error: {e}")
            print()
            error_count += 1

    print("=" * 70)
    print("📈 SUMMARY")
    print("=" * 70)
    print(f"✅ Successfully processed: {success_count}/{len(png_files)} images")
    if error_count > 0:
        print(f"❌ Failed: {error_count} images")

    if success_count > 0:
        total_original_mb = total_original_size / (1024 * 1024)
        total_output_mb = total_output_size / (1024 * 1024)
        total_reduction = ((total_original_size - total_output_size) / total_original_size * 100)

        print()
        print(f"💾 Total size reduction:")
        print(f"   Before: {total_original_mb:.2f} MB")
        print(f"   After:  {total_output_mb:.2f} MB")
        print(f"   Saved:  {total_reduction:.1f}%")

    print()
    print(f"📂 Output saved to: {input_path}")
    print(f"📝 Note: Original PNG files are kept. Delete them manually if needed.")
    print("=" * 70)

    return success_count > 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("=" * 70)
        print("🎨 IMAGE PROCESSING PIPELINE")
        print("=" * 70)
        print()
        print("Usage:")
        print(f"  python {Path(__file__).name} <input_directory>")
        print()
        print("Example:")
        print(f'  python {Path(__file__).name} "D:\\My App\\JobConnect\\public\\game-assets\\crops"')
        print()
        print("What it does:")
        print("  1. Removes background from all PNG images")
        print("  2. Resizes to 64x64px with padding (maintains aspect ratio)")
        print("  3. Converts to WebP format")
        print()
        print("=" * 70)
        sys.exit(1)

    input_directory = sys.argv[1]
    success = process_directory(input_directory)

    sys.exit(0 if success else 1)
