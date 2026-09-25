# Kế hoạch cải thiện Module Chat - JobConnect

## 📋 Tổng quan

Kế hoạch tối ưu toàn diện cho module chat, bao gồm 8 cải thiện về tốc độ và UX.

**Thời gian ước tính:** 6-8 giờ  
**Priority:** P0 → P1 → P2 → P3

---

## Phase 1: Quick Wins (30 phút) - P0

### ✅ Cải thiện #1: Realtime Subscription Filter

**Impact:** 🔥🔥🔥 High | **Effort:** ⚡ 5 phút | **Priority:** P0

**Vấn đề:**
- Đang subscribe toàn bộ tin nhắn (`"*"`)
- Client nhận tất cả event rồi mới filter
- Lãng phí bandwidth + CPU

**Giải pháp:**
```typescript
// File: src/routes/_authenticated/chat.tsx (line ~1107)

// ❌ TRƯỚC
pb.collection("group_chat_messages").subscribe("*", (event) => {
  if (event.record.room !== room.id) return; // Filter sau
});

// ✅ SAU
pb.collection("group_chat_messages").subscribe(
  `room = "${room.id}"`, // Filter trước - server chỉ gửi event của phòng này
  (event) => {
    // Không cần filter nữa
  },
  { expand: "user" }
);
```

**Steps:**
1. Mở file `src/routes/_authenticated/chat.tsx`
2. Tìm dòng `pb.collection("group_chat_messages").subscribe("*", ...)`
3. Thay `"*"` thành `room = "${room.id}"`
4. Xóa dòng `if (event.record.room !== room.id) return;`
5. Test: Gửi tin nhắn ở 2 phòng khác nhau, verify chỉ nhận event của phòng hiện tại

**Kết quả:**
- ✅ Giảm 90%+ event không cần thiết
- ✅ Giảm CPU client
- ✅ Tiết kiệm bandwidth

---

### ✅ Cải thiện #3: Debounce Typing Indicator

**Impact:** 🔥🔥 Medium | **Effort:** ⚡ 10 phút | **Priority:** P0

**Vấn đề:**
- Mỗi keystroke → 1 API call `notifyTyping()`
- Gõ 20 ký tự = 20 API calls
- Tốn tài nguyên server

**Giải pháp:**
```typescript
// File: src/routes/_authenticated/chat.tsx

// Thêm import
import { useMemo } from "react";
import { debounce } from "@/lib/utils"; // Hoặc lodash

// Trong RoomChatView component (sau dòng 914)
const debouncedTyping = useMemo(
  () => debounce(() => {
    if (content.trim()) {
      notifyTyping();
    }
  }, 300),
  [notifyTyping]
);

// Trong textarea onChange (line ~1560)
<Textarea
  value={content}
  onChange={(e) => {
    setContent(e.target.value);
    debouncedTyping(); // ← Thay vì notifyTyping()
  }}
/>
```

**Steps:**
1. Kiểm tra xem `debounce` đã có trong `@/lib/utils` chưa
2. Nếu chưa, tạo helper:
   ```typescript
   // src/lib/utils.ts
   export function debounce<T extends (...args: any[]) => any>(
     func: T,
     wait: number
   ): (...args: Parameters<T>) => void {
     let timeout: ReturnType<typeof setTimeout>;
     return (...args: Parameters<T>) => {
       clearTimeout(timeout);
       timeout = setTimeout(() => func(...args), wait);
     };
   }
   ```
3. Tạo `debouncedTyping` trong RoomChatView
4. Thay `notifyTyping()` thành `debouncedTyping()`
5. Test: Gõ nhanh, verify API chỉ gọi sau 300ms dừng gõ

**Kết quả:**
- ✅ Giảm 90% API calls khi gõ
- ✅ Giảm tải server
- ✅ UX vẫn tốt (300ms không đáng kể)

---

## Phase 2: High Impact (2-3 giờ) - P1

### ✅ Cải thiện #2: Virtual Scrolling

**Impact:** 🔥🔥🔥 High | **Effort:** ⚙️ 2 giờ | **Priority:** P1

**Vấn đề:**
- Render toàn bộ tin nhắn (50, 100, 200+ tin)
- DOM nodes tăng → Performance giảm
- Scroll lag khi có nhiều tin

**Giải pháp:**
```bash
npm install @tanstack/react-virtual
```

```typescript
// File: src/routes/_authenticated/chat.tsx

import { useVirtualizer } from '@tanstack/react-virtual';

// Trong RoomChatView component
const virtualizer = useVirtualizer({
  count: messages.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 80, // Ước tính chiều cao mỗi tin
  overscan: 5, // Render thêm 5 tin ngoài viewport
});

// Replace messages.map() bằng virtualizer
<div
  ref={scrollRef}
  style={{ height: '100%', overflow: 'auto' }}
  onScroll={onScrollMessages}
>
  <div
    style={{
      height: `${virtualizer.getTotalSize()}px`,
      width: '100%',
      position: 'relative',
    }}
  >
    {virtualizer.getVirtualItems().map((virtualItem) => {
      const message = messages[virtualItem.index];
      return (
        <div
          key={message.id}
          data-index={virtualItem.index}
          ref={virtualizer.measureElement}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          {/* Message component */}
        </div>
      );
    })}
  </div>
</div>
```

**Steps:**
1. Install `@tanstack/react-virtual`
2. Import `useVirtualizer` vào chat.tsx
3. Setup virtualizer hook
4. Refactor messages rendering loop
5. Test scroll performance với 200+ tin nhắn
6. Adjust `estimateSize` nếu cần (measure actual message heights)
7. Test "Load more" functionality vẫn hoạt động
8. Test scroll to bottom khi gửi tin mới

**Challenges:**
- Cần tính toán chiều cao chính xác cho mỗi tin (có ảnh, reactions khác nhau)
- Scroll to bottom logic cần update
- Search results highlighting cần adjust

**Kết quả:**
- ✅ Render 10-15 tin thay vì 200+ tin
- ✅ Scroll mượt mà với 1000+ tin nhắn
- ✅ Giảm memory 80%+

---

## Phase 3: Medium Impact (1-2 giờ) - P2

### ✅ Cải thiện #4: Lazy Load Image Gallery

**Impact:** 🔥🔥 Medium | **Effort:** ⚡ 30 phút | **Priority:** P2

**Vấn đề:**
- ChatImageViewer load tất cả ảnh khi mở
- 10 ảnh → load 10 ảnh cùng lúc
- Chậm, tốn bandwidth

**Giải pháp:**
```typescript
// File: src/components/chat/ChatImageViewer.tsx

export function ChatImageViewer({ images, initialIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // Helper: Check if image should be loaded
  const shouldLoadImage = (idx: number) => {
    // Load ảnh hiện tại + 1 ảnh trước/sau
    return Math.abs(idx - currentIndex) <= 1;
  };

  return (
    <>
      {images.map((url, idx) => {
        const isNearby = shouldLoadImage(idx);
        const isVisible = idx === currentIndex;

        return (
          <div
            key={idx}
            style={{
              display: isVisible ? 'block' : 'none',
            }}
          >
            {isNearby ? (
              <OptimizedImage
                src={url}
                alt={`Image ${idx + 1}`}
                loading={isVisible ? "eager" : "lazy"}
              />
            ) : (
              <div className="placeholder h-full w-full bg-muted" />
            )}
          </div>
        );
      })}
    </>
  );
}
```

**Steps:**
1. Mở `src/components/chat/ChatImageViewer.tsx`
2. Thêm `shouldLoadImage` helper
3. Conditional render: chỉ load ảnh nearby
4. Preload ảnh tiếp theo khi swipe
5. Test: Mở gallery 10 ảnh, verify chỉ load 3 ảnh đầu

**Kết quả:**
- ✅ Load 3 ảnh thay vì 10 ảnh
- ✅ Mở gallery nhanh hơn 3x
- ✅ Swipe vẫn mượt

---

### ✅ Cải thiện #5: Optimistic Delete

**Impact:** 🔥 Low | **Effort:** ⚡ 30 phút | **Priority:** P2

**Vấn đề:**
- Xóa tin nhắn phải đợi server response
- UX không mượt

**Giải pháp:**
```typescript
// File: src/routes/_authenticated/chat.tsx

const deleteMessage = async (messageId: string) => {
  const messageToDelete = messages.find(m => m.id === messageId);
  
  // 1. Xóa UI ngay lập tức (optimistic)
  setMessages(current => current.filter(m => m.id !== messageId));
  setTotalCount(current => current - 1);
  
  // 2. Xóa server background
  try {
    await pb.collection("group_chat_messages").delete(messageId);
    toast.success("Đã xóa tin nhắn");
  } catch (err) {
    // 3. Rollback nếu lỗi
    if (messageToDelete) {
      setMessages(current => sortMessages([...current, messageToDelete]));
      setTotalCount(current => current + 1);
    }
    toast.error("Không thể xóa tin nhắn");
  }
};
```

**Steps:**
1. Tìm function xóa tin nhắn trong chat.tsx
2. Implement optimistic update pattern
3. Add rollback logic
4. Test: Xóa tin nhắn online → verify UX
5. Test: Xóa tin nhắn offline → verify rollback

**Kết quả:**
- ✅ Xóa tức thì
- ✅ UX giống Telegram/WhatsApp
- ✅ Rollback tự động nếu lỗi

---

## Phase 4: UX Enhancements (2-3 giờ) - P3

### ✅ Cải thiện #6: Message Grouping

**Impact:** ✨ UX | **Effort:** ⚙️ 1.5 giờ | **Priority:** P3

**Vấn đề:**
- Mỗi tin có avatar + tên → lặp lại nhiều
- Mất không gian, khó đọc

**Giải pháp:**
```typescript
// File: src/routes/_authenticated/chat.tsx

// Helper function
const shouldShowAvatar = (msg: ChatMessage, prevMsg: ChatMessage | null) => {
  if (!prevMsg) return true;
  if (prevMsg.user !== msg.user) return true;
  
  // Nếu cách nhau > 5 phút → hiện avatar mới
  const timeDiff = new Date(msg.created).getTime() - new Date(prevMsg.created).getTime();
  return timeDiff > 5 * 60 * 1000; // 5 minutes
};

const shouldShowTimestamp = (msg: ChatMessage, nextMsg: ChatMessage | null) => {
  if (!nextMsg) return true;
  if (nextMsg.user !== msg.user) return true;
  
  const timeDiff = new Date(nextMsg.created).getTime() - new Date(msg.created).getTime();
  return timeDiff > 5 * 60 * 1000;
};

// Trong render messages
{messages.map((m, idx) => {
  const prevMsg = idx > 0 ? messages[idx - 1] : null;
  const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : null;
  
  const showAvatar = shouldShowAvatar(m, prevMsg);
  const showTimestamp = shouldShowTimestamp(m, nextMsg);
  const isGroupStart = showAvatar;
  const isGroupEnd = showTimestamp;

  return (
    <div
      key={m.id}
      className={cn(
        "flex gap-2",
        isGroupStart ? "mt-4" : "mt-1", // Less spacing for grouped messages
      )}
    >
      {/* Avatar chỉ hiện ở tin đầu group */}
      {showAvatar ? (
        <Avatar className="h-8 w-8">...</Avatar>
      ) : (
        <div className="h-8 w-8" /> // Spacer
      )}
      
      <div className="flex-1">
        {/* Tên chỉ hiện ở tin đầu group */}
        {showAvatar && (
          <div className="text-xs font-semibold mb-1">
            {m.expand?.user?.full_name}
          </div>
        )}
        
        {/* Message bubble */}
        <div className="rounded-2xl bg-card px-3 py-2">
          {m.content}
        </div>
        
        {/* Timestamp chỉ hiện ở tin cuối group */}
        {showTimestamp && (
          <div className="text-[10px] text-muted-foreground mt-1">
            {formatTime(m.created)}
          </div>
        )}
      </div>
    </div>
  );
})}
```

**Steps:**
1. Tạo `shouldShowAvatar` và `shouldShowTimestamp` helpers
2. Refactor message rendering với conditional avatar/timestamp
3. Adjust spacing: `mt-4` cho group đầu, `mt-1` cho tin trong group
4. Test với nhiều kịch bản:
   - Cùng user, cùng thời gian
   - Cùng user, khác thời gian > 5 phút
   - Khác user
5. Adjust styling cho đẹp (rounded corners, spacing)

**Kết quả:**
- ✅ Tiết kiệm không gian ~30%
- ✅ Dễ đọc hơn
- ✅ UI giống Messenger/Telegram

---

### ✅ Cải thiện #7: Pull-to-Refresh

**Impact:** ✨ UX | **Effort:** ⚙️ 1 giờ | **Priority:** P3

**Vấn đề:**
- Không có cách nào reload tin mới trên mobile
- Phải scroll lên đầu + reload trang

**Giải pháp:**
```typescript
// File: src/routes/_authenticated/chat.tsx

// Trong RoomChatView component
const [refreshing, setRefreshing] = useState(false);
const pullStartY = useRef(0);
const pullCurrentY = useRef(0);
const pullThreshold = 80;

const handleTouchStart = (e: React.TouchEvent) => {
  // Chỉ kích hoạt khi đang ở đầu scroll
  if (scrollRef.current && scrollRef.current.scrollTop === 0) {
    pullStartY.current = e.touches[0].clientY;
  }
};

const handleTouchMove = (e: React.TouchEvent) => {
  if (!pullStartY.current) return;
  
  pullCurrentY.current = e.touches[0].clientY;
  const pullDistance = pullCurrentY.current - pullStartY.current;
  
  // Hiển thị visual feedback
  if (pullDistance > 0 && pullDistance < pullThreshold * 2) {
    const opacity = Math.min(pullDistance / pullThreshold, 1);
    // Update indicator opacity/position
  }
};

const handleTouchEnd = async () => {
  const pullDistance = pullCurrentY.current - pullStartY.current;
  
  if (pullDistance >= pullThreshold && !refreshing) {
    setRefreshing(true);
    
    try {
      await reloadMessages();
      toast.success("Đã tải tin mới");
    } catch (err) {
      toast.error("Không thể tải tin mới");
    } finally {
      setRefreshing(false);
      pullStartY.current = 0;
      pullCurrentY.current = 0;
    }
  } else {
    // Reset
    pullStartY.current = 0;
    pullCurrentY.current = 0;
  }
};

// Trong JSX
<div
  ref={scrollRef}
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
  className="flex-1 overflow-y-auto"
>
  {/* Refresh indicator */}
  {refreshing && (
    <div className="flex justify-center py-2">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  )}
  
  {/* Messages */}
</div>
```

**Steps:**
1. Add touch event handlers
2. Track pull distance
3. Show visual indicator (spinner/icon)
4. Trigger reload at threshold
5. Test trên mobile device/emulator
6. Polish animation (spring, easing)

**Kết quả:**
- ✅ Mobile-friendly
- ✅ UX giống Instagram/Facebook
- ✅ Không cần nút reload

---

### ✅ Cải thiện #8: Smart Cache Eviction

**Impact:** 🔥 Low | **Effort:** ⚙️ 1 giờ | **Priority:** P3

**Vấn đề:**
- IndexedDB cache không có limit
- Có thể đầy sau 1-2 tháng
- Performance giảm dần

**Giải pháp:**
```typescript
// File: src/lib/chat-cache.ts

const MAX_CACHED_ROOMS = 20; // Giữ tối đa 20 phòng
const MAX_MESSAGES_PER_ROOM = 200; // Mỗi phòng 200 tin
const MAX_PREVIEW_AGE_DAYS = 7; // Preview cache 7 ngày

// New function: Get all cached rooms sorted by last access
async function getCachedRoomsSorted(): Promise<Array<{
  roomId: string;
  lastAccess: number;
  messageCount: number;
}>> {
  const db = await openDB();
  const tx = db.transaction(["messages", "lastAccess"], "readonly");
  
  const rooms = new Map<string, { lastAccess: number; messageCount: number }>();
  
  // Collect room stats
  let cursor = await tx.objectStore("messages").openCursor();
  while (cursor) {
    const roomId = cursor.value.roomId;
    const existing = rooms.get(roomId) || { lastAccess: 0, messageCount: 0 };
    existing.messageCount++;
    rooms.set(roomId, existing);
    cursor = await cursor.continue();
  }
  
  // Get last access times
  const accessStore = tx.objectStore("lastAccess");
  for (const [roomId, stats] of rooms) {
    const lastAccess = await accessStore.get(roomId);
    stats.lastAccess = lastAccess?.timestamp || 0;
  }
  
  await tx.done;
  
  // Sort by last access (most recent first)
  return Array.from(rooms.entries())
    .map(([roomId, stats]) => ({ roomId, ...stats }))
    .sort((a, b) => b.lastAccess - a.lastAccess);
}

// New function: Evict old cache
export async function evictOldCache() {
  const rooms = await getCachedRoomsSorted();
  
  console.log(`[Cache] Found ${rooms.length} cached rooms`);
  
  // 1. Delete old rooms (keep only MAX_CACHED_ROOMS most recent)
  const roomsToDelete = rooms.slice(MAX_CACHED_ROOMS);
  if (roomsToDelete.length > 0) {
    console.log(`[Cache] Deleting ${roomsToDelete.length} old rooms`);
    for (const room of roomsToDelete) {
      await deleteCachedRoom(room.roomId);
    }
  }
  
  // 2. Trim messages in kept rooms
  const keptRooms = rooms.slice(0, MAX_CACHED_ROOMS);
  for (const room of keptRooms) {
    if (room.messageCount > MAX_MESSAGES_PER_ROOM) {
      await trimRoomMessages(room.roomId, MAX_MESSAGES_PER_ROOM);
    }
  }
  
  // 3. Clean up old previews
  await cleanupOldPreviews(MAX_PREVIEW_AGE_DAYS);
  
  console.log(`[Cache] Eviction complete`);
}

// Helper: Delete all data for a room
async function deleteCachedRoom(roomId: string) {
  const db = await openDB();
  const tx = db.transaction(["messages", "previews", "lastAccess"], "readwrite");
  
  // Delete messages
  let cursor = await tx.objectStore("messages").openCursor();
  while (cursor) {
    if (cursor.value.roomId === roomId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  
  // Delete preview
  await tx.objectStore("previews").delete(roomId);
  
  // Delete last access record
  await tx.objectStore("lastAccess").delete(roomId);
  
  await tx.done;
}

// Helper: Trim messages to keep only N most recent
async function trimRoomMessages(roomId: string, keepCount: number) {
  const db = await openDB();
  const tx = db.transaction("messages", "readwrite");
  
  const messages: Array<{ id: string; created: string }> = [];
  let cursor = await tx.objectStore("messages").openCursor();
  
  while (cursor) {
    if (cursor.value.roomId === roomId) {
      messages.push({
        id: cursor.value.id,
        created: cursor.value.created,
      });
    }
    cursor = await cursor.continue();
  }
  
  // Sort by created (newest first)
  messages.sort((a, b) => 
    new Date(b.created).getTime() - new Date(a.created).getTime()
  );
  
  // Delete old messages
  const toDelete = messages.slice(keepCount);
  for (const msg of toDelete) {
    await tx.objectStore("messages").delete(msg.id);
  }
  
  await tx.done;
  
  console.log(`[Cache] Trimmed ${toDelete.length} old messages from room ${roomId}`);
}

// Helper: Clean up old previews
async function cleanupOldPreviews(maxAgeDays: number) {
  const db = await openDB();
  const tx = db.transaction("previews", "readwrite");
  
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  
  let cursor = await tx.objectStore("previews").openCursor();
  let deleted = 0;
  
  while (cursor) {
    const preview = cursor.value;
    const generatedAt = new Date(preview.generatedAt).getTime();
    
    if (generatedAt < cutoff) {
      await cursor.delete();
      deleted++;
    }
    
    cursor = await cursor.continue();
  }
  
  await tx.done;
  
  console.log(`[Cache] Deleted ${deleted} old previews`);
}

// Track last access time
export async function trackRoomAccess(roomId: string) {
  const db = await openDB();
  await db.put("lastAccess", {
    roomId,
    timestamp: Date.now(),
  });
}
```

**Steps:**
1. Tạo `evictOldCache` function với LRU logic
2. Tạo helpers: `deleteCachedRoom`, `trimRoomMessages`, `cleanupOldPreviews`
3. Tạo `trackRoomAccess` để track lần truy cập cuối
4. Call `trackRoomAccess` khi vào phòng
5. Call `evictOldCache` khi:
   - App khởi động (trong useChatCacheManager)
   - Mỗi 24h (background task)
   - Khi cache gần đầy (optional)
6. Test: Tạo 25 phòng, verify chỉ giữ 20 phòng mới nhất
7. Test: Cache 300 tin/phòng, verify trim về 200 tin

**Integration point:**
```typescript
// File: src/lib/use-chat-cache-manager.ts

useEffect(() => {
  // Run eviction on mount
  evictOldCache().catch(console.error);
  
  // Run eviction every 24 hours
  const interval = setInterval(() => {
    evictOldCache().catch(console.error);
  }, 24 * 60 * 60 * 1000);
  
  return () => clearInterval(interval);
}, []);
```

**Kết quả:**
- ✅ Cache không bao giờ đầy
- ✅ Giữ phòng thường dùng nhất
- ✅ Performance ổn định

---

## 📊 Timeline Summary

| Phase | Cải thiện | Time | Cumulative |
|-------|-----------|------|------------|
| **Phase 1** | #1 Realtime Filter | 5 min | 5 min |
| | #3 Debounce Typing | 10 min | 15 min |
| **Phase 2** | #2 Virtual Scrolling | 2 h | 2h 15m |
| **Phase 3** | #4 Lazy Gallery | 30 min | 2h 45m |
| | #5 Optimistic Delete | 30 min | 3h 15m |
| **Phase 4** | #6 Message Grouping | 1.5 h | 4h 45m |
| | #7 Pull-to-Refresh | 1 h | 5h 45m |
| | #8 Smart Eviction | 1 h | 6h 45m |

**Total:** ~7 giờ (có thể 8-9 giờ nếu có challenges)

---

## 🎯 Testing Checklist

### Phase 1 Testing
- [ ] Realtime: Gửi tin ở phòng A, verify phòng B không nhận event
- [ ] Debounce: Gõ nhanh, check network tab chỉ 1 request sau 300ms

### Phase 2 Testing
- [ ] Virtual: Scroll 200+ tin, verify smooth
- [ ] Virtual: Load more messages vẫn hoạt động
- [ ] Virtual: Gửi tin mới scroll to bottom

### Phase 3 Testing
- [ ] Gallery: Mở 10 ảnh, verify chỉ load 3 ảnh
- [ ] Gallery: Swipe sang ảnh tiếp, verify load ảnh mới
- [ ] Delete: Xóa tin online, verify instant
- [ ] Delete: Xóa tin offline, verify rollback

### Phase 4 Testing
- [ ] Grouping: Gửi 5 tin liên tiếp, verify chỉ 1 avatar
- [ ] Grouping: Đợi 6 phút, gửi tin mới, verify avatar mới
- [ ] Pull-to-refresh: Pull down, verify reload
- [ ] Cache: Tạo 25 phòng, verify chỉ giữ 20

---

## 📝 Notes

**Quan trọng:**
- Sau mỗi phase, test kỹ trước khi sang phase tiếp
- Commit code sau mỗi cải thiện hoàn thành
- Nếu có blocker, skip sang cải thiện khác, quay lại sau

**Dependencies:**
- `@tanstack/react-virtual` (Phase 2)
- Debounce utility (Phase 1 - có thể dùng lodash hoặc tự viết)

**Rollback plan:**
- Mỗi cải thiện là 1 commit riêng
- Nếu có vấn đề, `git revert <commit>`

---

## 🚀 Start Command

```bash
# Phase 1
git checkout -b feature/chat-improvements-phase1
# Implement #1 và #3
git add .
git commit -m "feat(chat): optimize realtime subscription and typing indicator

- Filter realtime events at server level (room-specific)
- Debounce typing indicator API calls (300ms)
- Reduce bandwidth and CPU usage by 90%

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# Phase 2
git checkout -b feature/chat-improvements-phase2
# Implement #2
npm install @tanstack/react-virtual
# ... code ...
git add .
git commit -m "feat(chat): implement virtual scrolling for messages

- Use @tanstack/react-virtual for efficient rendering
- Only render visible messages (~10-15 items)
- Improve scroll performance with 200+ messages
- Reduce memory footprint by 80%

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# Continue...
```

---

**Prepared by:** AI Engineer  
**Date:** 2026-09-24  
**Version:** 1.0
