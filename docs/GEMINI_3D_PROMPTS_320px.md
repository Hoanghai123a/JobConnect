# Gemini 3D Image Generation Prompts - 15 Loại Cây Trồng
## Cấu hình tạo ảnh 3D độ phân giải cao

**Settings cho Gemini:**
- Size: 320x320 pixels (sẽ resize xuống 64x64px sau)
- Style: 3D render, isometric view
- Quality: High detail (để giữ nét khi downscale)
- Format: PNG với transparent background

**Workflow:**
1. Generate ở 320x320px với Gemini
2. Remove background (remove.bg hoặc Photoshop)
3. Resize về 64x64px bằng high-quality algorithm (Lanczos3)
4. Optimize file size với TinyPNG
5. Verify độ nét ở size 64x64px

**Lợi ích của 320x320 → 64x64:**
- Giữ được chi tiết khi downscale (tỷ lệ 5:1)
- Anti-aliasing tự nhiên khi resize
- Edges mượt mà hơn
- Colors blend tốt hơn

---

## LEVEL 1 - Cây dễ trồng

### 1. Cà rốt (Carrot)

**carrot_seed.png**
```
A 3D isometric game sprite of a carrot seedling just sprouted, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Show a tiny orange nub barely visible at brown soil surface with 2-3 small 
bright green leaves starting to emerge upward. Very small and delicate.
Soft cartoon 3D modeling, vibrant saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**carrot_ready.png**
```
A 3D isometric game sprite of a fully grown harvestable carrot, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Large bright orange carrot prominently visible above brown soil, with lush 
vibrant green leafy tops spreading wide in fan pattern. 7-8 healthy leaves 
radiating outward. Carrot is plump and glossy with highlights.
Very vibrant saturated colors, ready to harvest appearance.
Soft cartoon 3D modeling, clean edges, studio lighting with soft shadows.
Transparent background. High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 2. Lúa (Rice)

**rice_seed.png**
```
A 3D isometric game sprite of rice seedling just sprouted, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Show 2-3 thin vertical bright green shoots emerging from wet brown soil,
very delicate grass-like blades. Light green color, early growth stage.
Soft cartoon 3D modeling, clean edges, studio lighting with soft shadows.
Transparent background. High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**rice_ready.png**
```
A 3D isometric game sprite of mature rice plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Multiple tall stalks with vibrant golden yellow grain heads drooping at tops.
10-12 visible rice grain heads in rich golden color, contrasting with 
green stalks below. Full and heavy with grain, very appealing.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 3. Rau xà lách (Lettuce)

**lettuce_seed.png**
```
A 3D isometric game sprite of lettuce seedling just sprouted, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Show 3-4 tiny rounded light green leaves forming small rosette pattern,
very compact and low to ground. Fresh appearance, delicate.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**lettuce_ready.png**
```
A 3D isometric game sprite of mature lettuce head ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Large round lettuce head with many ruffled bright green leaves forming 
dense ball shape. Leaves overlap in layers, full bushy appearance.
Vibrant fresh green color, glossy highlights, very appealing.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

## LEVEL 2 - Cây trung bình

### 4. Ngô (Corn)

**corn_seed.png**
```
A 3D isometric game sprite of corn seedling just emerged, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Single thick bright green shoot with 2-3 small leaves unfurling.
Small and compact but thicker than grass, early growth stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**corn_ready.png**
```
A 3D isometric game sprite of mature corn plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Tall green stalk with 1-2 large golden-yellow corn cobs prominently visible.
Husks partially open revealing bright yellow kernels in rows with glossy shine.
Large green leaves spreading from stalk. Very appealing golden color.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 5. Khoai tây (Potato)

**potato_seed.png**
```
A 3D isometric game sprite of potato plant sprout, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small plant with 2-3 rounded bright green leaves, compact and low to ground.
Early sprout stage, simple structure.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**potato_ready.png**
```
A 3D isometric game sprite of mature potato plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Bushy green plant with 2-3 brown potato tubers clearly visible at soil surface.
Potatoes are round, plump, rich brown color with slight texture.
Full green leafy plant surrounding visible potatoes.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 6. Cà chua (Tomato)

**tomato_seed.png**
```
A 3D isometric game sprite of tomato seedling just sprouted, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Tiny stem with 2-3 small serrated leaves, bright light green color.
Very delicate and small, early seedling stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**tomato_ready.png**
```
A 3D isometric game sprite of mature tomato plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Green vine plant with 3-4 bright red ripe tomatoes prominently displayed.
Tomatoes are round, plump, vibrant red color with glossy shine highlights.
Green serrated leaves surrounding red tomatoes, beautiful contrast.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

## LEVEL 3 - Cây khá khó

### 7. Dâu tây (Strawberry)

**strawberry_seed.png**
```
A 3D isometric game sprite of strawberry seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small plant with 2-3 three-lobed bright green leaves, low to ground.
Compact appearance, early seedling stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**strawberry_ready.png**
```
A 3D isometric game sprite of mature strawberry plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Low spreading plant with 3-4 bright red strawberries prominently visible.
Strawberries are vibrant red with visible yellow seeds, glossy highlights.
Green three-lobed leaves surrounding berries. Very appealing fresh look.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 8. Bí ngô (Pumpkin)

**pumpkin_seed.png**
```
A 3D isometric game sprite of pumpkin seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small vine with 2-3 small lobed bright green leaves, compact.
Low to ground, vine characteristics visible, early growth stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**pumpkin_ready.png**
```
A 3D isometric game sprite of mature pumpkin ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Large bright orange pumpkin with vertical ribbing and green curled stem on top.
Pumpkin is round, plump, vibrant orange with glossy highlights.
Green vines and large leaves surrounding it. Classic shape and color.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 9. Ớt (Chili Pepper)

**chili_seed.png**
```
A 3D isometric game sprite of chili pepper seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small stem with 2-3 tiny oval bright green leaves.
Very delicate and small, early seedling stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**chili_ready.png**
```
A 3D isometric game sprite of mature chili pepper plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Green plant with 3-4 bright red chili peppers hanging from branches.
Peppers are elongated, curved, vibrant red with glossy shine.
Green leaves surrounding peppers. Spicy-looking, eye-catching.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

## LEVEL 4 - Cây khó

### 10. Dưa hấu (Watermelon)

**watermelon_seed.png**
```
A 3D isometric game sprite of watermelon seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small vine with 2-3 rounded bright green leaves, compact.
Low to ground, vine characteristics visible, early seedling stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**watermelon_ready.png**
```
A 3D isometric game sprite of mature watermelon ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Large watermelon with dark green stripes on lighter green background.
Melon is round, plump, glossy with highlights. Distinctive striped pattern.
Green vines and large leaves surrounding it. Very appealing.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 11. Nho (Grape)

**grape_seed.png**
```
A 3D isometric game sprite of grape vine seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small vine stem with 2-3 tiny lobed bright green leaves, compact.
Early vine growth stage, simple structure.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**grape_ready.png**
```
A 3D isometric game sprite of mature grape vine ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Vine plant with 2-3 clusters of deep purple grapes prominently visible.
Grape clusters are full, vibrant purple with glossy shine on individual grapes.
Green vine leaves surrounding grape bunches. Rich purple color, appealing.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 12. Cà tím (Eggplant)

**eggplant_seed.png**
```
A 3D isometric game sprite of eggplant seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small stem with 2-3 small oval bright green leaves, compact.
Early seedling stage, simple structure.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**eggplant_ready.png**
```
A 3D isometric game sprite of mature eggplant plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Green plant with 2-3 large glossy deep purple eggplants hanging visibly.
Eggplants are oval-shaped, shiny dark purple with green stems, highlights.
Green leaves surrounding purple eggplants, beautiful contrast.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

## LEVEL 5 - Cây rất khó (Quý hiếm)

### 13. Hướng dương (Sunflower)

**sunflower_seed.png**
```
A 3D isometric game sprite of sunflower seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Small stem with 2-3 oval bright green leaves, compact.
Very small and low to ground, early seedling stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**sunflower_ready.png**
```
A 3D isometric game sprite of mature sunflower ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Tall green stalk with large bright yellow sunflower bloom at top.
Flower head prominent with vibrant yellow petals radiating outward,
dark brown center filled with seeds, glossy highlights.
Large green leaves along stem. Iconic sunny yellow bloom.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 14. Thanh long (Dragon Fruit)

**dragon_fruit_seed.png**
```
A 3D isometric game sprite of dragon fruit cactus seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Tiny green cactus-like sprout with slight triangular shape, light green.
Very compact, minimal spines, early cactus growth stage.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**dragon_fruit_ready.png**
```
A 3D isometric game sprite of mature dragon fruit ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Green cactus plant with 1-2 large vibrant pink dragon fruits prominently visible.
Fruits are bright magenta-pink with green scale-like leaves protruding,
oval shape, glossy highlights. Very exotic striking appearance.
Contrasting colors against green cactus. Ready to harvest.
Soft cartoon 3D modeling, saturated colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

---

### 15. Gừng vàng (Golden Ginger)

**golden_ginger_seed.png**
```
A 3D isometric game sprite of ginger plant seedling, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Show 1-2 small erect reed-like herbaceous stems just emerging, with 2-3 
alternate sessile lance-shaped glossy bright green leaves embracing the stem.
Very early growth stage, compact and delicate. Stems are thin and upright.
Soft cartoon 3D modeling, vibrant colors, clean edges.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look.
```

**golden_ginger_ready.png**
```
A 3D isometric game sprite of mature ginger plant ready to harvest, 320x320 pixels.
3D render style, cute and stylized. Top-down 45-degree isometric angle.
Show multiple erect reed-like stems (about 3-4 visible) with alternate sessile 
lance-shaped glossy green leaves embracing stems. Below at soil surface, 
2-3 thick fleshy multi-branched yellowish-brown rhizomes (ginger roots) 
partially visible with segmented knobby texture and golden-yellow highlights.
Near base, a small flower spike with green bracts emerging from root.
Roots are the focal point with rich golden-brown color and glossy shine.
Soft cartoon 3D modeling, saturated colors, clean edges, crisp texture on rhizomes.
Studio lighting with soft shadows on transparent background.
High detail for downscaling. Centered composition.
Mobile game art style, polished 3D look, exotic rare appearance.
```

---

## Post-Generation Workflow (CHI TIẾT)

### Bước 1: Generate với Gemini
- Sử dụng Gemini 2.0 Flash Experimental
- Size: 320x320 pixels
- Copy-paste từng prompt trên
- Generate và download file PNG

### Bước 2: Remove Background
**Tool khuyên dùng: remove.bg**
```bash
# Upload ảnh lên remove.bg
# Hoặc dùng Photoshop: Select > Subject > Delete background
# Export PNG với transparent background
```

### Bước 3: Resize về 64x64px (QUAN TRỌNG)
**Dùng high-quality resize algorithm:**

**Option A: ImageMagick (CLI)**
```bash
magick input.png -resize 64x64 -filter Lanczos output.png
```

**Option B: Photoshop**
- Image > Image Size
- Width: 64px, Height: 64px
- Resample: Bicubic Sharper (best for reduction)
- OK

**Option C: Online tool**
- https://www.simpleimageresizer.com/
- Choose Lanczos3 algorithm
- Resize to 64x64

### Bước 4: Optimize File Size
**TinyPNG (recommended)**
```bash
# Upload lên https://tinypng.com/
# Hoặc dùng CLI:
npm install -g tinypng-cli
tinypng *.png
```

**Target: <50KB per file**

### Bước 5: Rename & Place
```bash
# Format: {crop}_seed.png hoặc {crop}_ready.png
# Ví dụ:
carrot_seed.png
carrot_ready.png
rice_seed.png
rice_ready.png
# ...

# Đặt vào:
public/game-assets/crops/
```

---

## Quality Checklist

Trước khi consider sprite hoàn thành:

### Visual Quality (ở 64x64px)
- [ ] Edges vẫn sharp và clean
- [ ] Colors vẫn vibrant (không bị washed out)
- [ ] Details vẫn readable
- [ ] Silhouette rõ ràng
- [ ] Không có pixelation artifacts

### Technical Quality
- [ ] Transparent background hoàn toàn
- [ ] No white/gray halos around edges
- [ ] File size <50KB
- [ ] Format: PNG
- [ ] Dimensions: exactly 64x64px

### Gameplay Quality
- [ ] Distinguishable from other crops
- [ ] Seed → Ready progression visible
- [ ] Colors consistent với art direction
- [ ] Looks good on dark/light backgrounds

---

## Gemini 3D-Specific Tips

**Tối ưu output cho 3D style:**
- Luôn specify "3D render style, isometric"
- Thêm "soft cartoon 3D modeling" cho cute look
- "Studio lighting" cho shadows consistent
- "Glossy highlights" cho materials có depth
- "Saturated colors" để colors pop

**Common 3D issues:**
- Too realistic → Thêm "cute and stylized"
- Flat lighting → Thêm "studio lighting with soft shadows"
- Wrong angle → Emphasize "top-down 45-degree isometric"
- Too complex → Thêm "clean edges, simple shapes"

**Nếu output không như ý:**
- Regenerate 2-3 variants
- Chọn variant có edges cleanest
- Có thể tweak colors trong Photoshop sau
- Downscale test ở 64x64 trước khi accept

---

## Batch Processing Script (Optional)

Nếu bạn có nhiều ảnh cần process:

```bash
#!/bin/bash
# resize-and-optimize.sh

for file in *.png; do
  # Resize về 64x64 với Lanczos3
  magick "$file" -resize 64x64 -filter Lanczos "resized_$file"
  
  # Optimize
  pngquant --quality=65-80 "resized_$file" --output "final_$file"
  
  echo "Processed: $file"
done
```

Sử dụng:
```bash
cd public/game-assets/crops
./resize-and-optimize.sh
```

---

## Danh sách 30 sprites cần tạo

1-2. ✅ Carrot (seed, ready)
3-4. ✅ Rice (seed, ready)
5-6. ✅ Lettuce (seed, ready)
7-8. ✅ Corn (seed, ready)
9-10. ✅ Potato (seed, ready)
11-12. ✅ Tomato (seed, ready)
13-14. ✅ Strawberry (seed, ready)
15-16. ✅ Pumpkin (seed, ready)
17-18. ✅ Chili (seed, ready)
19-20. ✅ Watermelon (seed, ready)
21-22. ✅ Grape (seed, ready)
23-24. ✅ Eggplant (seed, ready)
25-26. ✅ Sunflower (seed, ready)
27-28. ✅ Dragon Fruit (seed, ready)
29-30. ✅ Golden Ginger (seed, ready)

**Total: 30 sprites**
