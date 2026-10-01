# Crop Sprite Generator for Nông Trại Game
# Generates all 30 crop sprites using Pollinations.ai

$outputDir = "D:\My App\JobConnect\public\game-assets\crops"

# Create output directory if it doesn't exist
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Write-Host "Created directory: $outputDir" -ForegroundColor Green
}

# Base settings for all sprites
$basePrompt = "A game sprite for a casual 2D farming game, 64x64 pixels, top-down view, cute and colorful art style, clean silhouette, vibrant colors, transparent background, mobile game quality, soft lighting"

# Define all crops and their states
$crops = @(
    @{
        name = "carrot"
        states = @{
            seed = "A tiny carrot sprout just emerging from soil. Small orange nub barely visible at the base with 2-3 tiny green leaves sprouting upward. The sprout is small and simple, centered in the frame. Soil around the base is light brown. Very early growth stage, minimal detail."
            growing = "A carrot in mid-growth stage. Orange carrot root is partially visible emerging from brown soil, about half-grown. Green leafy tops are growing fuller with 5-6 leaves spreading outward. The orange is bright but not yet fully saturated. Mid-sized, showing clear progress from seed stage."
            ready = "A fully mature, harvestable carrot. Large bright orange carrot root prominently visible above soil, with lush vibrant green foliage spreading wide. The carrot is plump and appealing, with rich saturated orange color. Green leaves are full and healthy, 7-8 leaves radiating outward. This is the most vibrant and appealing state, ready to harvest."
        }
    },
    @{
        name = "rice"
        states = @{
            seed = "A small rice seedling just sprouted. Thin green shoots, 2-3 blades of grass-like leaves emerging vertically from wet soil. Very delicate and small, light green color. The shoots are thin and straight, about 1/4 the final height. Minimal detail, early growth stage."
            growing = "Rice plant in mid-growth. Multiple green stalks growing upward, about medium height. 6-8 grass-like leaves spreading slightly. Still fully green, no grain heads visible yet. The plant is fuller than seedling but not yet mature. Medium green color, clear vertical growth pattern."
            ready = "Fully mature rice plant ready to harvest. Tall stalks with golden yellow grain heads drooping slightly at the tops. The grain heads are full and vibrant golden color, contrasting with green stalks below. Multiple stalks clustered together, 10-12 visible grain heads. Very appealing golden harvest-ready appearance."
        }
    },
    @{
        name = "corn"
        states = @{
            seed = "A small corn seedling just emerged. Single green shoot with 2-3 small leaves unfurling. Light green color, very small and compact. The shoot is thick compared to rice but still tiny. Early growth stage, simple and minimal detail."
            growing = "Corn plant in mid-growth. Medium-height green stalk with 5-6 broad leaves spreading outward. A small developing corn cob is partially visible, still mostly green. The plant is medium-sized, showing clear structure. Medium green color with hints of yellow on the partial cob."
            ready = "Fully mature corn plant ready to harvest. Tall green stalk with large golden-yellow corn cobs prominently visible. 1-2 ripe corn cobs with bright yellow kernels, husks partially open showing the golden corn. Large green leaves spreading wide. Very appealing harvest-ready appearance with vibrant golden yellow cobs."
        }
    },
    @{
        name = "potato"
        states = @{
            seed = "A small potato plant sprout. Tiny plant with 2-3 small rounded leaves, light green color. Very compact and low to the ground. The sprout is emerging from soil, minimal size. Early growth stage, simple appearance."
            growing = "Potato plant in mid-growth. Bushy green plant with 6-8 rounded leaves spreading outward. Hints of brown potato tubers barely visible at the soil surface. Medium-sized plant, fuller than seedling. Medium green leaves with slight shadows suggesting underground potatoes."
            ready = "Fully mature potato plant ready to harvest. Lush green leafy plant with several brown potato tubers clearly visible at the soil surface. 2-3 prominent brown potatoes showing above ground, round and plump. Green foliage is full and healthy. Very appealing harvest-ready appearance with visible brown potatoes."
        }
    },
    @{
        name = "tomato"
        states = @{
            seed = "A tiny tomato seedling just sprouted. Small stem with 2-3 tiny serrated leaves, light green color. Very delicate and small. The seedling is thin and compact. Early growth stage, minimal detail."
            growing = "Tomato plant in mid-growth. Medium-height green plant with 5-6 serrated compound leaves. Small green tomatoes are visible on the vine, not yet ripe. The plant has a bushy appearance with visible stem structure. Medium green color with small green unripe tomatoes."
            ready = "Fully mature tomato plant ready to harvest. Green vine with 3-4 bright red ripe tomatoes prominently displayed. The tomatoes are round, plump, and vibrant red color. Green serrated leaves surround the red tomatoes. Very appealing harvest-ready appearance with rich red tomatoes against green foliage."
        }
    },
    @{
        name = "strawberry"
        states = @{
            seed = "A small strawberry seedling. Tiny plant with 2-3 small three-lobed leaves, light green color. Very low to the ground, compact appearance. The seedling is small and simple. Early growth stage, minimal detail."
            growing = "Strawberry plant in mid-growth. Low bushy plant with 5-6 three-lobed green leaves spreading outward. Small white flowers are visible, indicating fruit is forming. The plant is fuller but flowers are more prominent than fruit. Medium green color with white flower accents."
            ready = "Fully mature strawberry plant ready to harvest. Low spreading plant with bright red strawberries prominently visible among green leaves. 3-4 ripe red strawberries with visible yellow seeds on surface. Green three-lobed leaves surrounding the berries. Very appealing harvest-ready appearance with vibrant red strawberries."
        }
    },
    @{
        name = "watermelon"
        states = @{
            seed = "A small watermelon seedling. Tiny vine with 2-3 small rounded leaves, light green color. Very compact, low to ground. The seedling shows early vine characteristics. Early growth stage, simple appearance."
            growing = "Watermelon plant in mid-growth. Sprawling green vines with large rounded leaves. A small green watermelon is visible, about 1/3 final size, still developing. The vine spreads outward with 5-6 large leaves. Medium green color with small green melon starting to show stripes."
            ready = "Fully mature watermelon ready to harvest. Large watermelon with dark green stripes on lighter green background, prominently displayed on vine. The melon is plump and large, taking up significant space. Green vines and leaves surround it. Very appealing harvest-ready appearance with distinctive striped pattern."
        }
    },
    @{
        name = "pumpkin"
        states = @{
            seed = "A small pumpkin seedling. Tiny vine with 2-3 small lobed leaves, light green color. Very compact and low to ground. The seedling shows early vine characteristics. Early growth stage, minimal detail."
            growing = "Pumpkin plant in mid-growth. Sprawling green vines with large lobed leaves. A small orange pumpkin is visible, about 1/3 final size, still developing. The vine spreads with 5-6 large leaves. Medium green color with small orange pumpkin and green stem visible."
            ready = "Fully mature pumpkin ready to harvest. Large bright orange pumpkin with vertical ribbing and green curled stem on top. The pumpkin is plump, round, and vibrant orange. Green vines and leaves surround it. Very appealing harvest-ready appearance with rich orange color and classic pumpkin shape."
        }
    },
    @{
        name = "sunflower"
        states = @{
            seed = "A small sunflower seedling. Tiny stem with 2-3 small oval leaves, light green color. Very small and compact, low to ground. The seedling is simple and minimal. Early growth stage, basic structure visible."
            growing = "Sunflower plant in mid-growth. Tall green stalk growing upward with 5-6 large leaves spreading from the stem. A developing flower bud is visible at the top, still green with hints of yellow. Medium-height plant showing clear upward growth. Green with budding flower."
            ready = "Fully mature sunflower ready to harvest. Tall green stalk with a large bright yellow sunflower bloom at the top. The flower head is prominent with vibrant yellow petals radiating outward and dark brown center. Large green leaves along the stem. Very appealing harvest-ready appearance with iconic sunny yellow bloom."
        }
    },
    @{
        name = "dragon_fruit"
        states = @{
            seed = "A small dragon fruit cactus seedling. Tiny green cactus-like sprout with slight triangular shape, light green color. Very compact and low. The sprout has minimal spines or texture. Early growth stage, simple cactus appearance."
            growing = "Dragon fruit cactus in mid-growth. Medium-sized triangular cactus plant with 3-4 distinct segments. A small pink dragon fruit is starting to form, about 1/3 final size. The cactus is medium green with slight texture. Small pink fruit beginning to develop with green scales visible."
            ready = "Fully mature dragon fruit ready to harvest. Green cactus plant with 1-2 large vibrant pink dragon fruits prominently displayed. The fruits are bright magenta-pink with green scale-like leaves protruding. Round-oval shape, very exotic and appealing appearance. Very vibrant harvest-ready look with striking pink color against green cactus."
        }
    }
)

$totalImages = $crops.Count * 3
$currentImage = 0

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  Crop Sprite Generator" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Total images to generate: $totalImages" -ForegroundColor Yellow
Write-Host "Output directory: $outputDir`n" -ForegroundColor Yellow

foreach ($crop in $crops) {
    Write-Host "`nProcessing: $($crop.name)" -ForegroundColor Magenta
    Write-Host "-----------------------------------" -ForegroundColor Magenta

    foreach ($state in @("seed", "growing", "ready")) {
        $currentImage++
        $fileName = "$($crop.name)_$state.png"
        $filePath = Join-Path $outputDir $fileName

        $fullPrompt = "$basePrompt. $($crop.states[$state])"

        Write-Host "[$currentImage/$totalImages] Generating: $fileName" -ForegroundColor Yellow

        try {
            $url = "https://image.pollinations.ai/prompt/$fullPrompt" + "?width=512&height=512&model=flux&nologo=true&enhance=true"

            Invoke-WebRequest -Uri $url -OutFile $filePath -TimeoutSec 60 -UseBasicParsing

            if (Test-Path $filePath) {
                $fileInfo = Get-Item $filePath
                Write-Host "  Success! Size: $($fileInfo.Length) bytes" -ForegroundColor Green
            }

            # Small delay to avoid rate limiting
            Start-Sleep -Milliseconds 500

        } catch {
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  Generation Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Generated $currentImage images" -ForegroundColor Green
Write-Host "Location: $outputDir`n" -ForegroundColor Green
