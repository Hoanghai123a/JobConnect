"""
Script to resize images to 64x64px with padding and convert to WebP
Maintains aspect ratio by padding the shorter dimension
"""
import os
from pathlib import Path
from PIL import Image

def resize_with_padding(input_path, output_path, target_size=64):
    """
    Resize image to target_size x target_size with padding
    Priority: fit the longer dimension, pad the shorter one

    Args:
        input_path: Path to input image
        output_path: Path to save output image
        target_size: Target size (default 64px)
    """
    # Open image
    img = Image.open(input_path)

    # Get original dimensions
    width, height = img.size

    # Calculate scaling factor based on the longer dimension
    if width >= height:
        # Width is longer, scale based on width
        scale = target_size / width
        new_width = target_size
        new_height = int(height * scale)
    else:
        # Height is longer, scale based on height
        scale = target_size / height
        new_height = target_size
        new_width = int(width * scale)

    # Resize image maintaining aspect ratio
    img_resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Create new image with target size and transparent background
    new_img = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))

    # Calculate position to paste (center the image)
    paste_x = (target_size - new_width) // 2
    paste_y = (target_size - new_height) // 2

    # Paste resized image onto the center
    new_img.paste(img_resized, (paste_x, paste_y), img_resized if img_resized.mode == 'RGBA' else None)

    # Save as WebP
    new_img.save(output_path, 'WEBP', quality=95, method=6)

def process_directory(input_dir, output_dir=None):
    """
    Process all PNG images in directory

    Args:
        input_dir: Directory containing images
        output_dir: Directory to save processed images (default: same as input)
    """
    input_path = Path(input_dir)

    if not input_path.exists():
        print(f"Error: Directory {input_dir} does not exist")
        return

    # Use input directory as output if not specified
    if output_dir is None:
        output_path = input_path
    else:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

    # Get all PNG files
    png_files = list(input_path.glob("*.png"))

    if not png_files:
        print(f"No PNG files found in {input_dir}")
        return

    print(f"Found {len(png_files)} PNG images to process")
    print(f"Converting to 64x64px WebP format...")
    print()

    success_count = 0
    error_count = 0

    for i, png_file in enumerate(png_files, 1):
        try:
            # Generate output filename (replace .png with .webp)
            output_file = output_path / (png_file.stem + '.webp')

            print(f"[{i}/{len(png_files)}] {png_file.name} → {output_file.name}...", end=" ")

            # Process image
            resize_with_padding(png_file, output_file)

            # Get file sizes for comparison
            original_size = png_file.stat().st_size / 1024  # KB
            new_size = output_file.stat().st_size / 1024  # KB
            reduction = ((original_size - new_size) / original_size * 100) if original_size > 0 else 0

            print(f"✓ ({original_size:.1f}KB → {new_size:.1f}KB, -{reduction:.1f}%)")
            success_count += 1

        except Exception as e:
            print(f"✗ Error: {e}")
            error_count += 1

    print()
    print(f"Completed! {success_count} images processed successfully")
    if error_count > 0:
        print(f"{error_count} images failed")
    print(f"Output saved to: {output_path}")

if __name__ == "__main__":
    # Directory containing crop images
    crops_dir = r"D:\My App\JobConnect\public\game-assets\crops"

    # Process all images (will save as .webp in the same directory)
    process_directory(crops_dir)

    print("\nNote: Original PNG files are kept. Delete them manually if needed.")
