# Mobile Testing Checklist - Nông Trại Game

## Tổng quan

Checklist này đảm bảo game hoạt động tốt trên mobile devices với touch interactions, responsive design, và performance optimization.

---

## Device Coverage

### Test Devices (Minimum)

**iOS:**
- [ ] iPhone SE (small screen, 375x667)
- [ ] iPhone 14 Pro (standard, 390x844)
- [ ] iPad Air (tablet, 820x1180)

**Android:**
- [ ] Samsung Galaxy S21 (standard, 360x800)
- [ ] Google Pixel 7 (standard, 412x915)
- [ ] Samsung Galaxy Tab (tablet, 800x1280)

**Browsers:**
- [ ] Safari (iOS)
- [ ] Chrome (Android)
- [ ] Firefox Mobile
- [ ] Samsung Internet

---

## 1. Touch Interactions

### TC-TOUCH-001: Button Tap Responsiveness
- [ ] Tất cả buttons đều tap được (min 44x44px touch target)
- [ ] Visual feedback ngay lập tức (active state)
- [ ] Không có accidental double-tap
- [ ] Tap không trigger khi swipe/scroll

**Test Steps:**
1. Tap mỗi button trong GameBottomNav (Shop, Plant, Sell, Inventory, Quests)
2. Verify modal mở đúng
3. Tap nhanh nhiều lần → không trigger multiple times
4. Swipe qua button → không trigger tap

**Files to check:**
- [GameBottomNav.tsx](../src/game/components/GameBottomNav.tsx)
- CSS: `touch-manipulation`, `active:scale-95`

---

### TC-TOUCH-002: Plot Interaction
- [ ] Tap vào plot mở PlantModal/HarvestModal
- [ ] Tap area đủ lớn (plot sprite + padding)
- [ ] Visual feedback khi tap (highlight, scale)
- [ ] Không miss tap ở edges

**Test Steps:**
1. Tap vào empty plot → PlantModal mở
2. Tap vào growing plot → không làm gì (expected)
3. Tap vào ready plot → HarvestModal mở
4. Tap ở góc plot → vẫn trigger

**Files to check:**
- [FarmScene.ts](../src/game/scenes/FarmScene.ts) - plot interactive zones

---

### TC-TOUCH-003: Modal Interactions
- [ ] Tap outside modal → close modal
- [ ] Scroll trong modal list (crops, inventory)
- [ ] Buttons trong modal responsive
- [ ] Không accidentally close khi scroll

**Test Modals:**
- ShopModal (scroll crop list)
- PlantModal (select seed từ inventory)
- SellModal (scroll và select crops)
- InventoryModal (scroll inventory)
- QuestsModal (scroll quests)
- CollectionModal (scroll discovered crops)

**Test Steps:**
1. Open modal
2. Scroll danh sách → smooth scroll, no lag
3. Tap item → select/action works
4. Tap outside → modal closes
5. Tap modal content while scrolling → doesn't close

---

### TC-TOUCH-004: Long Press & Gestures
- [ ] No unexpected long-press menus (context menu)
- [ ] No text selection on buttons/UI
- [ ] No zoom on double-tap
- [ ] Pinch zoom disabled

**CSS to verify:**
```css
touch-action: manipulation;
user-select: none;
-webkit-user-select: none;
-webkit-touch-callout: none;
```

---

## 2. Responsive Design

### TC-RESP-001: Screen Sizes

**Small (320px - 375px):**
- [ ] GameHUD không overflow
- [ ] Bottom nav buttons visible
- [ ] Modal fit screen
- [ ] Text readable (min 14px)

**Medium (375px - 768px):**
- [ ] Layout cân đối
- [ ] Farm canvas scale correctly
- [ ] Modals centered

**Large (768px+):**
- [ ] Game không quá nhỏ/lớn
- [ ] UI không stretch weird
- [ ] Touch targets vẫn reasonable size

**Test with preview_resize:**
```javascript
// Mobile
await preview_resize({ preset: 'mobile' }); // 375x812

// Tablet
await preview_resize({ preset: 'tablet' }); // 768x1024

// Desktop (reset)
await preview_resize({ preset: 'desktop' });
```

---

### TC-RESP-002: Orientation

**Portrait (Primary):**
- [ ] UI elements visible
- [ ] Farm canvas fit
- [ ] No awkward spacing

**Landscape:**
- [ ] Game still playable
- [ ] Bottom nav doesn't hide content
- [ ] Modal scrollable if needed

**Test Steps:**
1. Rotate device/browser
2. Verify layout adjusts
3. No broken UI elements

---

### TC-RESP-003: Safe Areas (iOS)

- [ ] Content không bị che bởi notch
- [ ] Bottom nav không bị home indicator che
- [ ] Modals respect safe areas

**CSS to verify:**
```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
```

---

## 3. Performance

### TC-PERF-001: Frame Rate

**Acceptance Criteria:**
- Farm rendering: 60 FPS (16ms per frame)
- Animations smooth (no jank)
- Scroll smooth (no lag)

**Test:**
```javascript
// Check FPS in console
let lastTime = performance.now();
let frames = 0;

function checkFPS() {
  frames++;
  const now = performance.now();
  if (now >= lastTime + 1000) {
    console.log(`FPS: ${frames}`);
    frames = 0;
    lastTime = now;
  }
  requestAnimationFrame(checkFPS);
}

checkFPS();
```

**Test Scenarios:**
1. Idle farm → 60 FPS
2. Multiple growing crops → 60 FPS
3. Open/close modals → smooth transition
4. Scroll long lists → no dropped frames

---

### TC-PERF-002: Load Time

**Acceptance Criteria:**
- Initial load: < 3s on 4G
- Farm scene ready: < 1s after load
- Asset loading: < 2s

**Test:**
1. Clear cache
2. Open /farm on mobile network
3. Measure time to interactive

**Metrics:**
- First Contentful Paint (FCP): < 1.5s
- Time to Interactive (TTI): < 3s
- Total Blocking Time (TBT): < 300ms

---

### TC-PERF-003: Memory Usage

**Acceptance Criteria:**
- Heap size: < 50MB
- No memory leaks after 10min gameplay
- Smooth performance after 100+ actions

**Test:**
1. Open Chrome DevTools → Performance Monitor
2. Play game for 10 minutes (plant, harvest, buy, sell)
3. Monitor JS Heap Size
4. Should stay relatively stable (no continuous growth)

---

### TC-PERF-004: Battery Impact

**Test:**
- [ ] Game doesn't drain battery rapidly
- [ ] CPU usage reasonable
- [ ] No excessive network requests

**Monitor:**
- CPU usage < 30% on idle
- Network requests batched (not continuous polling)

---

## 4. Network Conditions

### TC-NET-001: Slow Connection (3G)

**Test:**
1. Enable network throttling (Chrome DevTools)
2. Set to "Slow 3G"
3. Perform actions: buy seed, plant, harvest

**Expected:**
- [ ] Loading indicators shown
- [ ] Actions complete (may be slower)
- [ ] No broken state
- [ ] Timeout handling graceful

---

### TC-NET-002: Offline → Online

**Test:**
1. Start in offline mode
2. Play game (localStorage)
3. Enable network → login
4. Verify no data migration

**Expected:**
- [ ] Offline progress stays local
- [ ] Authenticated mode starts fresh
- [ ] Warning message shown

---

### TC-NET-003: Network Error Handling

**Test:**
1. Start authenticated game
2. Disable network mid-transaction
3. Attempt action (buy seed)

**Expected:**
- [ ] Error message shown
- [ ] State not corrupted
- [ ] Retry works after network restored

---

## 5. Visual & UI/UX

### TC-UI-001: Text Readability

- [ ] All text readable (min 14px on mobile)
- [ ] Contrast ratio > 4.5:1
- [ ] No text cutoff/ellipsis unexpectedly
- [ ] Vietnamese diacritics display correctly

**Check:**
- GameHUD: Level, XP, Coins
- Quest descriptions
- Crop names
- Button labels

---

### TC-UI-002: Tap Targets

**Minimum Size:** 44x44px (Apple HIG), 48x48px (Material Design)

- [ ] All buttons meet minimum size
- [ ] Spacing between tappable elements ≥ 8px
- [ ] Easy to tap without zooming

**Verify:**
```javascript
// Check button sizes
document.querySelectorAll('button').forEach(btn => {
  const rect = btn.getBoundingClientRect();
  if (rect.width < 44 || rect.height < 44) {
    console.warn('Small button:', btn, rect);
  }
});
```

---

### TC-UI-003: Dark Mode

- [ ] Game readable in dark mode
- [ ] No jarring white backgrounds
- [ ] Consistent color scheme

**Test:**
```javascript
await preview_resize({ colorScheme: 'dark' });
```

---

### TC-UI-004: Accessibility

- [ ] Sufficient color contrast
- [ ] Icons have descriptive labels
- [ ] Focus indicators visible (keyboard nav on tablet)
- [ ] Screen reader compatible (bonus)

---

## 6. Game-Specific Tests

### TC-GAME-001: Full Gameplay Loop on Mobile

**Scenario:** Complete player journey on mobile device

**Steps:**
1. Open /farm on mobile
2. Buy 3 carrot seeds
3. Plant on plots 0, 1, 2
4. Wait 30 seconds
5. Harvest all 3
6. Sell 2 carrots
7. Complete quest and claim reward

**Expected:**
- [ ] All actions complete successfully
- [ ] No UI breaks
- [ ] Performance stays smooth
- [ ] Data persists correctly

**Verify:**
- Final coins ≈ expected
- Quest marked as claimed
- Inventory correct
- No console errors

---

### TC-GAME-002: Concurrent Actions

**Test rapid actions:**
1. Tap multiple buttons rapidly
2. Open/close modals quickly
3. Spam buy button

**Expected:**
- [ ] No double-actions
- [ ] State stays consistent
- [ ] No race conditions

---

### TC-GAME-003: Background Tab

**Test:**
1. Plant crops
2. Switch to another app/tab
3. Wait for grow time
4. Return to game

**Expected:**
- [ ] Crops are ready (time-based growth works)
- [ ] Game state correct
- [ ] No crashes on resume

---

## 7. Browser-Specific Tests

### TC-BROWSER-001: Safari iOS

**Known Issues:**
- [ ] Date.now() works correctly
- [ ] LocalStorage accessible
- [ ] Touch events working
- [ ] No webkit-specific bugs

---

### TC-BROWSER-002: Chrome Android

- [ ] Service worker (if used) works
- [ ] Push notifications (if used) work
- [ ] Install prompt (PWA) works correctly

---

### TC-BROWSER-003: Samsung Internet

- [ ] Layout correct (uses Chromium)
- [ ] Touch interactions work
- [ ] No samsung-specific issues

---

## 8. Edge Cases

### TC-EDGE-001: Low Memory Device

**Test on:**
- [ ] Old iPhone (iPhone 6s)
- [ ] Budget Android (2GB RAM)

**Expected:**
- [ ] Game loads (may be slower)
- [ ] No crashes
- [ ] Acceptable performance

---

### TC-EDGE-002: Interrupted Session

**Test:**
1. Start action (buy seed)
2. Lock phone immediately
3. Return after 5 minutes

**Expected:**
- [ ] Action completed or error shown
- [ ] State consistent
- [ ] No broken UI

---

### TC-EDGE-003: Multiple Tabs

**Test:**
1. Open /farm in 2 mobile tabs
2. Make changes in tab 1
3. Switch to tab 2

**Expected:**
- [ ] State may be stale (expected)
- [ ] No crashes
- [ ] Refresh syncs state

---

## Testing Tools

### Browser DevTools (Mobile Mode)

**Chrome:**
1. F12 → Toggle device toolbar (Ctrl+Shift+M)
2. Select device preset
3. Test touch events
4. Check network throttling

**Safari:**
1. Develop → Enter Responsive Design Mode
2. Select device
3. Test iOS-specific features

---

### Real Device Testing

**Remote Debugging:**

**Android:**
```bash
# Connect via USB
chrome://inspect/#devices
```

**iOS:**
```bash
# Connect via USB
Safari → Develop → [Device] → [Page]
```

---

### Automated Testing (Future)

**Playwright Mobile:**
```typescript
const { devices } = require('@playwright/test');

test.use(devices['iPhone 13']);

test('mobile game works', async ({ page }) => {
  await page.goto('http://localhost:5173/farm');
  await page.click('button:has-text("Shop")');
  // ... test interactions
});
```

---

## Test Report Template

```markdown
## Mobile Test Report

**Date:** 2026-10-01
**Tester:** [Name]
**Devices Tested:**
- iPhone 14 (iOS 17.1, Safari)
- Samsung Galaxy S21 (Android 13, Chrome)

### Results Summary
- Total Tests: 50
- Passed: 48
- Failed: 2
- Blocked: 0

### Failed Tests
1. TC-TOUCH-003: Scroll trong SellModal bị lag trên Galaxy S21
   - **Severity:** Medium
   - **Steps to Reproduce:** Open SellModal, scroll quickly
   - **Expected:** Smooth scroll
   - **Actual:** Visible frame drops

2. TC-UI-002: Shop button touch target nhỏ hơn 44px
   - **Severity:** High
   - **Actual Size:** 40x40px
   - **Fix Required:** Increase padding

### Performance Metrics
- Load Time (4G): 2.1s ✅
- FPS (idle): 60 ✅
- FPS (active): 58 ✅
- Memory: 42MB ✅

### Recommendations
1. Increase Shop button size to 48x48px
2. Optimize SellModal rendering (virtualization?)
3. Add haptic feedback on iOS (bonus)
```

---

## Production Checklist

Before launching on mobile:

- [ ] All critical tests passed
- [ ] Performance acceptable on low-end devices
- [ ] Touch interactions feel responsive
- [ ] Text readable without zooming
- [ ] No critical bugs on Safari iOS
- [ ] Network error handling graceful
- [ ] Offline mode works correctly
- [ ] PWA manifest configured (if needed)

---

## Known Mobile Limitations

1. **Phaser Performance:** Complex animations may lag on old devices
   - **Mitigation:** Reduce particle count, simplify effects

2. **Storage Limits:** localStorage has 5-10MB limit
   - **Mitigation:** Clear old data, use IndexedDB if needed

3. **Safari Audio:** iOS requires user interaction before playing sound
   - **Mitigation:** Already handled by AudioService

4. **Viewport Height:** Mobile browsers show/hide address bar
   - **Mitigation:** Use `vh` units carefully, test scroll behavior

---

## Resources

- [Apple Human Interface Guidelines - Touch Targets](https://developer.apple.com/design/human-interface-guidelines/inputs/touch/)
- [Material Design - Touch Targets](https://m3.material.io/foundations/interaction/gestures)
- [Web.dev - Mobile Performance](https://web.dev/mobile/)
- [Can I Use - Touch Events](https://caniuse.com/touch)
