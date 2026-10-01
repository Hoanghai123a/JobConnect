# Mobile Testing Execution Script

## Tổng quan

Script thực thi automated mobile testing cho Nông Trại Game trên real devices.

**Test Date:** 2026-10-01  
**Tools:** Playwright Mobile, Appium (optional)

---

## Setup: Playwright Mobile Testing

### Installation

```bash
# Install Playwright
npm install -D @playwright/test

# Install mobile browsers
npx playwright install webkit
npx playwright install chromium
```

### Test Configuration

```javascript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/mobile',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    // Mobile Safari (iPhone)
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 13'] },
    },
    // Mobile Chrome (Android)
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    // Tablet
    {
      name: 'iPad',
      use: { ...devices['iPad Air'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Automated Test Suite

### Test 1: Touch Interactions

```typescript
// tests/mobile/touch-interactions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Touch Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/farm');
    // Wait for game to load
    await page.waitForSelector('canvas', { timeout: 10000 });
  });

  test('MT-TOUCH-001: Bottom nav buttons are tappable', async ({ page }) => {
    // Tap Shop button
    const shopButton = page.getByRole('button', { name: /shop/i });
    await expect(shopButton).toBeVisible();
    
    const box = await shopButton.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44); // Min 44px touch target
    expect(box?.height).toBeGreaterThanOrEqual(44);
    
    await shopButton.tap();
    await expect(page.getByText(/mua hạt giống/i)).toBeVisible();
  });

  test('MT-TOUCH-002: Plot tap opens modal', async ({ page }) => {
    // Tap empty plot (canvas interaction)
    const canvas = page.locator('canvas');
    await canvas.tap({ position: { x: 100, y: 100 } });
    
    // Verify PlantModal opened
    await expect(page.getByText(/trồng cây/i)).toBeVisible({ timeout: 5000 });
  });

  test('MT-TOUCH-003: Modal scrolls smoothly', async ({ page }) => {
    // Open Shop modal
    await page.getByRole('button', { name: /shop/i }).tap();
    
    // Scroll crop list
    const modal = page.locator('[role="dialog"]');
    await modal.evaluate((el) => {
      el.scrollTop = 100;
    });
    
    // Check scroll worked
    const scrollTop = await modal.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
  });

  test('MT-TOUCH-004: No text selection on buttons', async ({ page }) => {
    const button = page.getByRole('button', { name: /shop/i });
    
    // Try to select text (should be prevented)
    await button.click({ clickCount: 3 }); // Triple click
    
    const selection = await page.evaluate(() => window.getSelection()?.toString());
    expect(selection).toBe('');
  });
});
```

---

### Test 2: Responsive Design

```typescript
// tests/mobile/responsive-design.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  const viewports = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 14 Pro', width: 390, height: 844 },
    { name: 'iPad Air', width: 820, height: 1180 },
    { name: 'Samsung S21', width: 360, height: 800 },
  ];

  for (const viewport of viewports) {
    test(`MT-RESP-001: Layout correct on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/farm');
      
      // Check HUD visible
      await expect(page.getByText(/Level/i)).toBeVisible();
      await expect(page.getByText(/XP/i)).toBeVisible();
      await expect(page.getByText(/Coins/i)).toBeVisible();
      
      // Check bottom nav visible
      const buttons = ['Shop', 'Plant', 'Sell', 'Inventory', 'Quests'];
      for (const btnText of buttons) {
        await expect(page.getByRole('button', { name: new RegExp(btnText, 'i') })).toBeVisible();
      }
      
      // Check no horizontal scroll
      const hasHScroll = await page.evaluate(() => 
        document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(hasHScroll).toBe(false);
    });
  }

  test('MT-RESP-002: Portrait and landscape work', async ({ page }) => {
    await page.goto('/farm');
    
    // Portrait
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByText(/Level/i)).toBeVisible();
    
    // Landscape
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(page.getByText(/Level/i)).toBeVisible();
  });
});
```

---

### Test 3: Performance

```typescript
// tests/mobile/performance.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('MT-PERF-001: Load time under 3s', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/farm');
    await page.waitForSelector('canvas', { timeout: 10000 });
    
    const loadTime = Date.now() - startTime;
    console.log(`Load time: ${loadTime}ms`);
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('MT-PERF-002: Frame rate > 30 FPS', async ({ page }) => {
    await page.goto('/farm');
    await page.waitForSelector('canvas');
    
    // Measure FPS
    const fps = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        const startTime = performance.now();
        
        function countFrame() {
          frameCount++;
          if (performance.now() - startTime < 1000) {
            requestAnimationFrame(countFrame);
          } else {
            resolve(frameCount);
          }
        }
        
        requestAnimationFrame(countFrame);
      });
    });
    
    console.log(`FPS: ${fps}`);
    expect(fps).toBeGreaterThan(30);
  });

  test('MT-PERF-003: Memory usage stable', async ({ page }) => {
    await page.goto('/farm');
    
    // Get initial memory
    const initialMemory = await page.evaluate(() => 
      (performance as any).memory?.usedJSHeapSize
    );
    
    // Perform actions
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: /shop/i }).tap();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }
    
    // Get final memory
    const finalMemory = await page.evaluate(() => 
      (performance as any).memory?.usedJSHeapSize
    );
    
    // Memory shouldn't grow more than 10MB
    const growth = (finalMemory - initialMemory) / 1024 / 1024;
    console.log(`Memory growth: ${growth.toFixed(2)}MB`);
    
    expect(growth).toBeLessThan(10);
  });
});
```

---

### Test 4: Network Conditions

```typescript
// tests/mobile/network.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Network Conditions', () => {
  test('MT-NET-001: Works on Slow 3G', async ({ page, context }) => {
    // Simulate Slow 3G
    await context.route('**/*', (route) => {
      setTimeout(() => route.continue(), 500); // 500ms delay
    });
    
    await page.goto('/farm');
    
    // Should still load (just slower)
    await expect(page.getByText(/Level/i)).toBeVisible({ timeout: 15000 });
  });

  test('MT-NET-002: Offline mode works', async ({ page, context }) => {
    await page.goto('/farm');
    
    // Go offline
    await context.setOffline(true);
    
    // Game should still work (localStorage)
    await page.getByRole('button', { name: /shop/i }).tap();
    await expect(page.getByText(/mua hạt giống/i)).toBeVisible();
    
    // Verify offline indicator
    await expect(page.getByText(/chế độ thử/i)).toBeVisible();
  });
});
```

---

### Test 5: Full Gameplay Loop

```typescript
// tests/mobile/gameplay.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Full Gameplay Loop', () => {
  test('MT-GAME-001: Complete buy→plant→harvest→sell cycle', async ({ page }) => {
    await page.goto('/farm');
    await page.waitForSelector('canvas');
    
    // Get initial coins
    const initialCoins = await page.getByText(/Coins:/).textContent();
    console.log('Initial:', initialCoins);
    
    // 1. Buy seed
    await page.getByRole('button', { name: /shop/i }).tap();
    await page.getByText(/carrot/i).first().tap();
    await page.getByRole('button', { name: /mua/i }).tap();
    await page.keyboard.press('Escape');
    
    // 2. Plant crop
    await page.getByRole('button', { name: /plant/i }).tap();
    await page.getByText(/carrot/i).first().tap();
    const canvas = page.locator('canvas');
    await canvas.tap({ position: { x: 100, y: 100 } });
    
    // 3. Wait for grow (30s for carrot)
    await page.waitForTimeout(31000);
    
    // 4. Harvest
    await canvas.tap({ position: { x: 100, y: 100 } });
    await page.getByRole('button', { name: /thu hoạch/i }).tap();
    
    // 5. Sell
    await page.getByRole('button', { name: /sell/i }).tap();
    await page.getByText(/carrot/i).first().tap();
    await page.getByRole('button', { name: /bán/i }).tap();
    
    // Verify coins increased
    const finalCoins = await page.getByText(/Coins:/).textContent();
    console.log('Final:', finalCoins);
    
    // Should have more coins than initial (earned from harvest + sell)
    expect(finalCoins).not.toBe(initialCoins);
  });
});
```

---

## Real Device Testing Checklist

### iOS Testing (iPhone)

**Device:** iPhone 13 (iOS 17)  
**Browser:** Safari

#### Touch Tests
- [ ] MT-TOUCH-001: Bottom nav buttons tappable
- [ ] MT-TOUCH-002: Plot tap opens modal
- [ ] MT-TOUCH-003: Modal scrolls smoothly
- [ ] MT-TOUCH-004: No unwanted text selection

#### Responsive Tests
- [ ] MT-RESP-001: Layout fits screen
- [ ] MT-RESP-002: Portrait/landscape work
- [ ] MT-RESP-003: Safe areas respected (notch)

#### Performance Tests
- [ ] MT-PERF-001: Load time < 3s
- [ ] MT-PERF-002: FPS > 30
- [ ] MT-PERF-003: No memory leaks

#### Safari-Specific
- [ ] Date.now() works correctly
- [ ] LocalStorage accessible
- [ ] Touch events working
- [ ] Audio plays after user interaction

**Notes:** __________________________

---

### Android Testing (Samsung Galaxy)

**Device:** Samsung Galaxy S21 (Android 13)  
**Browser:** Chrome

#### Touch Tests
- [ ] MT-TOUCH-001: Bottom nav buttons tappable
- [ ] MT-TOUCH-002: Plot tap opens modal
- [ ] MT-TOUCH-003: Modal scrolls smoothly
- [ ] MT-TOUCH-004: No unwanted text selection

#### Responsive Tests
- [ ] MT-RESP-001: Layout fits screen
- [ ] MT-RESP-002: Portrait/landscape work

#### Performance Tests
- [ ] MT-PERF-001: Load time < 3s
- [ ] MT-PERF-002: FPS > 30
- [ ] MT-PERF-003: No memory leaks

#### Android-Specific
- [ ] Back button works
- [ ] Add to home screen works
- [ ] Notifications work (if used)

**Notes:** __________________________

---

### Tablet Testing (iPad Air)

**Device:** iPad Air (iOS 17)  
**Browser:** Safari

#### Layout Tests
- [ ] Game scales appropriately
- [ ] Touch targets not too large
- [ ] Canvas centered

#### Split-Screen Tests
- [ ] Works in split-screen mode
- [ ] Responsive to size changes

**Notes:** __________________________

---

## Running Tests

### Run All Mobile Tests

```bash
# Run all Playwright mobile tests
npx playwright test tests/mobile

# Run specific test file
npx playwright test tests/mobile/touch-interactions.spec.ts

# Run with UI
npx playwright test --ui

# Generate report
npx playwright show-report
```

### Run on Specific Device

```bash
# iPhone only
npx playwright test --project="Mobile Safari"

# Android only
npx playwright test --project="Mobile Chrome"

# iPad only
npx playwright test --project="iPad"
```

### Debug Tests

```bash
# Debug mode
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed
```

---

## BrowserStack / Sauce Labs (Optional)

### BrowserStack Configuration

```javascript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    connectOptions: {
      wsEndpoint: 'wss://cdp.browserstack.com/playwright',
    },
  },
});
```

### Run on BrowserStack

```bash
# Set credentials
export BROWSERSTACK_USERNAME=<username>
export BROWSERSTACK_ACCESS_KEY=<access_key>

# Run tests
npx playwright test
```

**Devices to test:**
- iPhone 14 Pro (iOS 17)
- Samsung Galaxy S23 (Android 13)
- Google Pixel 7 (Android 13)
- iPad Pro 12.9 (iOS 17)

---

## Manual Testing Checklist

### Critical User Journeys

#### Journey 1: New Player Onboarding
1. [ ] Open /farm on mobile
2. [ ] Game loads within 3 seconds
3. [ ] Tutorial/instructions clear
4. [ ] First buy works
5. [ ] First plant works
6. [ ] Wait and harvest works
7. [ ] First sell works

**Issues Found:** __________________________

---

#### Journey 2: Quest Completion
1. [ ] Open Quests modal
2. [ ] See quest list
3. [ ] Complete a quest
4. [ ] Claim reward
5. [ ] Quest marked as completed

**Issues Found:** __________________________

---

#### Journey 3: Progression
1. [ ] Gain XP from harvests
2. [ ] Level up notification appears
3. [ ] New crops unlock
4. [ ] Can buy unlocked crops

**Issues Found:** __________________________

---

## Test Results Summary

### Automated Tests

| Test Suite | Total | Pass | Fail |
|------------|-------|------|------|
| Touch Interactions | 4 | ___ | ___ |
| Responsive Design | 6 | ___ | ___ |
| Performance | 3 | ___ | ___ |
| Network | 2 | ___ | ___ |
| Gameplay | 1 | ___ | ___ |
| **TOTAL** | **16** | ___ | ___ |

### Real Device Tests

| Device | Tests Run | Pass | Fail |
|--------|-----------|------|------|
| iPhone 13 | ___ | ___ | ___ |
| Samsung S21 | ___ | ___ | ___ |
| iPad Air | ___ | ___ | ___ |

### Critical Issues Found

1. **Issue:** __________________________
   - **Device:** __________________________
   - **Severity:** Critical / High / Medium / Low
   - **Steps to Reproduce:** __________________________
   - **Fix:** __________________________

---

## Production Readiness

- [ ] All automated tests pass
- [ ] Manual testing completed on 3+ devices
- [ ] No critical/high issues
- [ ] Performance meets criteria
- [ ] Touch interactions responsive
- [ ] Text readable without zoom
- [ ] No broken layouts

---

## References

- [MOBILE_TESTING.md](MOBILE_TESTING.md) - Full mobile test plan
- [Playwright Mobile Testing](https://playwright.dev/docs/emulation)
- [Touch Target Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
