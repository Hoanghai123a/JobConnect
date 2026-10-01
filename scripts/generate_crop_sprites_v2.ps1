# Advanced Crop Sprite Generator with Multiple APIs
# Supports fallback to different image generation services

param(
    [Parameter(Mandatory=$false)]
    [string]$CropName = "all",

    [Parameter(Mandatory=$false)]
    [string]$State = "all"
)

$outputDir = "D:\My App\JobConnect\public\game-assets\crops"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Enhanced base prompt for 3D isometric style
$basePrompt = "3D isometric game asset, cute casual farming game style, slightly rounded 3D appearance, soft shading, vibrant colors, transparent background, clean silhouette, mobile game quality, isometric 45-degree angle view, professional game art"

# API configurations with fallback
$apis = @(
    @{
        name = "Pollinations-Flux-3D"
        url = "https://image.pollinations.ai/prompt/{PROMPT}?width=512&height=512&model=flux-3d&nologo=true&enhance=true"
        enabled = $true
    },
    @{
        name = "Pollinations-Flux"
        url = "https://image.pollinations.ai/prompt/{PROMPT}?width=512&height=512&model=flux&nologo=true&enhance=true"
        enabled = $true
    },
    @{
        name = "Pollinations-Turbo"
        url = "https://image.pollinations.ai/prompt/{PROMPT}?width=512&height=512&model=turbo&nologo=true"
        enabled = $true
    }
)

# Define crops with 3D-enhanced descriptions
$crops = @{
    "carrot" = @{
        seed = "A tiny 3D carrot sprout emerging from isometric soil tile. Small orange carrot nub with 2-3 tiny green leaves. Cute rounded 3D style, soft shadows, centered on brown soil patch. Minimal detail, early growth stage."
        growing = "A mid-growth 3D carrot. Orange carrot root half-visible above isometric soil, bright color. 5-6 green leaves spreading outward with soft 3D depth. Clear progress from seed, appealing rounded shapes."
        ready = "A fully mature 3D carrot ready to harvest. Large bright orange carrot with lush vibrant green foliage. Plump 3D appearance with soft highlights, rich saturated colors. 7-8 healthy leaves radiating outward. Most appealing harvest state with sparkle effects."
    }
    "rice" = @{
        seed = "A small 3D rice seedling just sprouted. 2-3 thin grass-like shoots emerging vertically from wet soil. Delicate light green color, minimal detail. Isometric view, soft 3D rendering."
        growing = "A mid-growth 3D rice plant. Multiple green stalks growing upward, medium height. 6-8 grass-like leaves with soft 3D depth. Fully green, no grain heads yet. Clear vertical growth pattern."
        ready = "A fully mature 3D rice plant ready to harvest. Tall stalks with golden yellow grain heads drooping slightly. Vibrant golden color contrasting with green stalks. 10-12 grain heads, very appealing harvest-ready appearance with glow effects."
    }
    "corn" = @{
        seed = "A small 3D corn seedling emerged. Single green shoot with 2-3 small unfurling leaves. Light green, compact 3D shape. Early growth stage, simple rounded forms."
        growing = "A mid-growth 3D corn plant. Green stalk with 5-6 broad leaves spreading outward. Small developing corn cob partially visible, mostly green. Medium size with clear 3D structure."
        ready = "A fully mature 3D corn plant ready to harvest. Tall green stalk with 1-2 bright golden-yellow corn cobs prominently visible. Husks partially open showing golden kernels. Large leaves spreading wide. Vibrant harvest-ready with sparkle."
    }
    "potato" = @{
        seed = "A small 3D potato sprout. 2-3 small rounded leaves, light green. Very compact, low to ground. Emerging from soil with soft 3D shading. Early growth, simple appearance."
        growing = "A mid-growth 3D potato plant. Bushy green plant with 6-8 rounded leaves spreading outward. Hints of brown potato tubers barely visible at soil surface. Medium-sized with soft 3D depth."
        ready = "A fully mature 3D potato plant ready to harvest. Lush green foliage with 2-3 brown potato tubers clearly visible above ground. Potatoes are round, plump with 3D shading. Very appealing harvest-ready with glow."
    }
    "tomato" = @{
        seed = "A tiny 3D tomato seedling sprouted. Small stem with 2-3 tiny serrated leaves, light green. Very delicate, thin and compact. Early growth stage with soft 3D rendering."
        growing = "A mid-growth 3D tomato plant. Green plant with 5-6 serrated compound leaves. Small green tomatoes visible on vine, not yet ripe. Bushy appearance with visible 3D stem structure."
        ready = "A fully mature 3D tomato plant ready to harvest. Green vine with 3-4 bright red ripe tomatoes prominently displayed. Round, plump tomatoes with vibrant red color and 3D highlights. Green leaves surrounding. Sparkle effects."
    }
    "strawberry" = @{
        seed = "A small 3D strawberry seedling. 2-3 small three-lobed leaves, light green. Very low to ground, compact 3D appearance. Simple and minimal with soft shading."
        growing = "A mid-growth 3D strawberry plant. Low bushy plant with 5-6 three-lobed green leaves. Small white flowers visible with 3D depth. Flowers more prominent than fruit. White flower accents."
        ready = "A fully mature 3D strawberry plant ready to harvest. Low spreading plant with 3-4 bright red strawberries prominently visible. Ripe red berries with visible yellow seeds, 3D shading and highlights. Very appealing with sparkle effects."
    }
    "watermelon" = @{
        seed = "A small 3D watermelon seedling. Tiny vine with 2-3 small rounded leaves, light green. Very compact, low to ground. Early vine characteristics with soft 3D rendering."
        growing = "A mid-growth 3D watermelon plant. Sprawling green vines with large rounded leaves. Small green watermelon visible, 1/3 final size. 5-6 large leaves with 3D depth. Starting to show stripes."
        ready = "A fully mature 3D watermelon ready to harvest. Large watermelon with dark green stripes on lighter green background. Plump and large with soft 3D highlights. Green vines and leaves surrounding. Distinctive striped pattern with glow."
    }
    "pumpkin" = @{
        seed = "A small 3D pumpkin seedling. Tiny vine with 2-3 small lobed leaves, light green. Compact, low to ground. Early vine characteristics with soft 3D shading."
        growing = "A mid-growth 3D pumpkin plant. Sprawling vines with large lobed leaves. Small orange pumpkin visible, 1/3 final size. 5-6 large leaves with 3D depth. Orange pumpkin with green stem."
        ready = "A fully mature 3D pumpkin ready to harvest. Large bright orange pumpkin with vertical ribbing and green curled stem on top. Plump, round with vibrant 3D highlights. Rich orange color, classic shape with sparkle."
    }
    "sunflower" = @{
        seed = "A small 3D sunflower seedling. Tiny stem with 2-3 small oval leaves, light green. Very small, compact, low to ground. Simple 3D rendering with soft shadows."
        growing = "A mid-growth 3D sunflower plant. Tall green stalk with 5-6 large leaves spreading from stem. Developing flower bud at top, green with hints of yellow. Clear upward growth with 3D depth."
        ready = "A fully mature 3D sunflower ready to harvest. Tall green stalk with large bright yellow sunflower bloom at top. Vibrant yellow petals radiating outward, dark brown center. Large green leaves along stem. Iconic sunny appearance with glow."
    }
    "dragon_fruit" = @{
        seed = "A small 3D dragon fruit cactus seedling. Tiny green cactus-like sprout with triangular shape, light green. Very compact and low. Minimal texture, early growth with soft 3D rendering."
        growing = "A mid-growth 3D dragon fruit cactus. Medium triangular cactus with 3-4 segments. Small pink dragon fruit starting to form, 1/3 final size. Medium green with 3D texture. Pink fruit with green scales developing."
        ready = "A fully mature 3D dragon fruit ready to harvest. Green cactus plant with 1-2 large vibrant pink dragon fruits prominently displayed. Bright magenta-pink with green scale-like leaves protruding. Round-oval shape with exotic 3D appearance and sparkle."
    }
}

function Generate-Image {
    param($prompt, $outputPath, $apiIndex = 0)

    if ($apiIndex -ge $apis.Count) {
        Write-Host "  All APIs failed" -ForegroundColor Red
        return $false
    }

    $api = $apis[$apiIndex]

    if (-not $api.enabled) {
        return Generate-Image -prompt $prompt -outputPath $outputPath -apiIndex ($apiIndex + 1)
    }

    try {
        $fullPrompt = "$basePrompt. $prompt"
        $url = $api.url -replace '\{PROMPT\}', $fullPrompt

        Write-Host "  Trying: $($api.name)" -ForegroundColor Cyan

        Invoke-WebRequest -Uri $url -OutFile $outputPath -TimeoutSec 60 -UseBasicParsing -ErrorAction Stop

        if (Test-Path $outputPath) {
            $fileInfo = Get-Item $outputPath
            if ($fileInfo.Length -gt 1000) {
                Write-Host "  Success! Size: $($fileInfo.Length) bytes" -ForegroundColor Green
                return $true
            }
        }

        return Generate-Image -prompt $prompt -outputPath $outputPath -apiIndex ($apiIndex + 1)

    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like "*402*" -or $errorMsg -like "*Payment Required*") {
            Write-Host "  $($api.name): Payment required, trying next API..." -ForegroundColor Yellow
        } else {
            Write-Host "  $($api.name): $errorMsg" -ForegroundColor Yellow
        }

        Start-Sleep -Milliseconds 500
        return Generate-Image -prompt $prompt -outputPath $outputPath -apiIndex ($apiIndex + 1)
    }
}

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  3D Isometric Crop Sprite Generator" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Output: $outputDir`n" -ForegroundColor Yellow

$successCount = 0
$failCount = 0

$cropsToProcess = if ($CropName -eq "all") { $crops.Keys } else { @($CropName) }
$statesToProcess = if ($State -eq "all") { @("seed", "growing", "ready") } else { @($State) }

foreach ($cropName in $cropsToProcess) {
    if (-not $crops.ContainsKey($cropName)) {
        Write-Host "Unknown crop: $cropName" -ForegroundColor Red
        continue
    }

    Write-Host "`nProcessing: $cropName" -ForegroundColor Magenta
    Write-Host "-----------------------------------" -ForegroundColor Magenta

    foreach ($state in $statesToProcess) {
        $fileName = "${cropName}_${state}.png"
        $filePath = Join-Path $outputDir $fileName

        Write-Host "Generating: $fileName" -ForegroundColor Yellow

        $success = Generate-Image -prompt $crops[$cropName][$state] -outputPath $filePath

        if ($success) {
            $successCount++
        } else {
            $failCount++
        }

        Start-Sleep -Milliseconds 1000
    }
}

Write-Host "`n=====================================" -ForegroundColor Cyan
Write-Host "  Generation Complete!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Success: $successCount | Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host "Location: $outputDir`n" -ForegroundColor Green
