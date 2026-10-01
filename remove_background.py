"""
Script to remove background from crop images
Uses rembg library for automatic background removal
"""
import os
from pathlib import Path
from rembg import remove
from PIL import Image

def remove_background_from_images(input_dir, output_dir=None):
    """
    Remove background from all PNG images in a directory

    Args:
        input_dir: Directory containing images
        output_dir: Directory to save processed images (default: overwrite originals)
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
    image_files = list(input_path.glob("*.png"))

    if not image_files:
        print(f"No PNG files found in {input_dir}")
        return

    print(f"Found {len(image_files)} images to process")
    print(f"Processing images...")

    for i, image_file in enumerate(image_files, 1):
        try:
            print(f"[{i}/{len(image_files)}] Processing {image_file.name}...", end=" ")

            # Read input image
            with open(image_file, 'rb') as f:
                input_data = f.read()

            # Remove background
            output_data = remove(input_data)

            # Save output image
            output_file = output_path / image_file.name
            with open(output_file, 'wb') as f:
                f.write(output_data)

            print("✓ Done")

        except Exception as e:
            print(f"✗ Error: {e}")

    print(f"\nCompleted! Processed images saved to: {output_path}")

if __name__ == "__main__":
    # Directory containing crop images
    crops_dir = r"D:\My App\JobConnect\public\game-assets\crops"

    # Process all images (will overwrite originals with transparent background)
    # To save to a different directory, uncomment and modify the line below:
    # remove_background_from_images(crops_dir, output_dir=r"D:\My App\JobConnect\public\game-assets\crops-no-bg")

    remove_background_from_images(crops_dir)
