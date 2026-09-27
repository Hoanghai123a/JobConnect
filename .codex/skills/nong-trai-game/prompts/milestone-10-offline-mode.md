# Milestone 10 - Offline Mode

## Mục tiêu

Cho phép người chơi chơi game KHÔNG CẦN đăng nhập, với data lưu trong `localStorage`. 

**QUAN TRỌNG:** Offline data KHÔNG được sync lên server sau này.

---

## Requirements

### 1. Dual Persistence Layer

Tạo abstraction layer hỗ trợ 2 storage backends:

```typescript
interface StorageAdapter {
  savePlayer(player: Player): Promise<boolean>;
  loadPlayer(): Promise<Player | null>;
  savePlots(plots: Plot[]): Promise<boolean>;
  loadPlots(): Promise<Plot[]>;
  saveInventory(inventory: Record<string, number>): Promise<boolean>;
  loadInventory(): Promise<Record<string, number>>;
  saveQuests(quests: Quest[]): Promise<boolean>;
  loadQuests(): Promise<Quest[]>;
}

class LocalStorageAdapter implements StorageAdapter {
  // Save to localStorage
}

class PocketBaseAdapter implements StorageAdapter {
  // Save to PocketBase (existing FarmPersistenceService)
}
```

### 2. Mode Detection

```typescript
// src/game/services/storageFactory.ts
export function getStorageAdapter(): StorageAdapter {
  const isAuthenticated = pb.authStore.isValid;
  
  if (isAuthenticated) {
    return new PocketBaseAdapter();
  } else {
    return new LocalStorageAdapter();
  }
}
```

### 3. LocalStorage Schema

**Keys:**
- `farm_game_player_${playerId}`
- `farm_game_plots_${playerId}`
- `farm_game_inventory_${playerId}`
- `farm_game_quests_${playerId}`
- `farm_game_metadata` (playerId, created_at, last_played)

**playerId Generation:**
```typescript
function getOrCreatePlayerId(): string {
  const metadata = localStorage.getItem('farm_game_metadata');
  if (metadata) {
    return JSON.parse(metadata).playerId;
  }
  
  const newPlayerId = `guest_${generateUUID()}`;
  localStorage.setItem('farm_game_metadata', JSON.stringify({
    playerId: newPlayerId,
    createdAt: new Date().toISOString(),
    mode: 'offline'
  }));
  
  return newPlayerId;
}
```

### 4. UI Indicators

**Authenticated Mode:**
```tsx
<Badge variant="success">
  <CloudCheck /> Đã đồng bộ
</Badge>
```

**Offline Mode:**
```tsx
<Badge variant="warning">
  <CloudOff /> Chế độ thử - không lưu vĩnh viễn
</Badge>
```

**Warning Message:**
```tsx
{!isAuthenticated && (
  <Alert variant="warning">
    <Info />
    <AlertTitle>Chế độ chơi thử</AlertTitle>
    <AlertDescription>
      Tiến độ chỉ lưu trên thiết bị này và sẽ bị mất khi xóa cache.
      <Link to="/signup">Đăng ký</Link> để lưu vĩnh viễn.
    </AlertDescription>
  </Alert>
)}
```

### 5. No Migration Path

**Explicitly block migration:**

```typescript
// src/game/services/migrationService.ts
export function migrateOfflineData(): never {
  throw new Error(
    'Migration from offline to online is not supported. ' +
    'This is intentional to prevent cheating and economy exploits.'
  );
}
```

**UI:**
- No "Import offline progress" button
- No "Sync to account" option
- Clear messaging: "Offline progress cannot be transferred"

---

## Implementation Steps

### Step 1: Create LocalStorageAdapter

File: `src/game/services/localStorageAdapter.ts`

```typescript
export class LocalStorageAdapter implements StorageAdapter {
  private playerId: string;

  constructor() {
    this.playerId = this.getOrCreatePlayerId();
  }

  async savePlayer(player: Player): Promise<boolean> {
    try {
      const key = `farm_game_player_${this.playerId}`;
      localStorage.setItem(key, JSON.stringify(player));
      this.updateLastPlayed();
      return true;
    } catch (error) {
      console.error('Failed to save player to localStorage:', error);
      return false;
    }
  }

  async loadPlayer(): Promise<Player | null> {
    try {
      const key = `farm_game_player_${this.playerId}`;
      const data = localStorage.getItem(key);
      
      if (!data) {
        // First time - return default player
        return this.createDefaultPlayer();
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to load player from localStorage:', error);
      return null;
    }
  }

  // Similar methods for plots, inventory, quests...

  private getOrCreatePlayerId(): string {
    const metadata = localStorage.getItem('farm_game_metadata');
    if (metadata) {
      return JSON.parse(metadata).playerId;
    }
    
    const newId = `guest_${crypto.randomUUID()}`;
    localStorage.setItem('farm_game_metadata', JSON.stringify({
      playerId: newId,
      createdAt: new Date().toISOString(),
      mode: 'offline',
      lastPlayed: new Date().toISOString()
    }));
    
    return newId;
  }

  private updateLastPlayed(): void {
    const metadata = JSON.parse(localStorage.getItem('farm_game_metadata') || '{}');
    metadata.lastPlayed = new Date().toISOString();
    localStorage.setItem('farm_game_metadata', JSON.stringify(metadata));
  }

  private createDefaultPlayer(): Player {
    return {
      id: this.playerId,
      coins: GAME_CONFIG.player.initialCoins,
      level: GAME_CONFIG.player.initialLevel,
      exp: GAME_CONFIG.player.initialExp,
      expToNextLevel: calculateExpForLevel(GAME_CONFIG.player.initialLevel)
    };
  }
}
```

### Step 2: Update FarmLoader

File: `src/game/components/FarmLoader.tsx`

```typescript
import { getStorageAdapter } from '@/game/services/storageFactory';

export const FarmLoader = ({ children }: FarmLoaderProps) => {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'offline' | 'online'>('offline');

  useEffect(() => {
    loadFarm();
  }, []);

  const loadFarm = async () => {
    try {
      const adapter = getStorageAdapter();
      const isAuthenticated = pb.authStore.isValid;
      
      setMode(isAuthenticated ? 'online' : 'offline');

      // Load via adapter
      const player = await adapter.loadPlayer();
      const plots = await adapter.loadPlots();
      const inventory = await adapter.loadInventory();
      const quests = await adapter.loadQuests();

      // Update Zustand store
      // ...

      setLoading(false);
    } catch (error) {
      console.error('Failed to load farm:', error);
      setError('Không thể tải dữ liệu nông trại');
    }
  };

  // Show mode indicator
  return (
    <>
      <ModeIndicator mode={mode} />
      {children}
    </>
  );
};
```

### Step 3: Update EconomyService

File: `src/game/services/economyService.ts`

```typescript
import { getStorageAdapter } from './storageFactory';

export const EconomyService = {
  buySeed(cropId: string): { success: boolean; error?: string } {
    // ... existing validation ...

    // Persist
    const adapter = getStorageAdapter();
    adapter.savePlayer(store.player);
    adapter.saveInventory(store.inventory);

    return { success: true };
  },

  // Similar updates for sellCrop, plantCrop, harvestCrop
};
```

### Step 4: Add Mode Indicator UI

File: `src/game/components/GameHUD.tsx`

```tsx
import { CloudCheck, CloudOff } from 'lucide-react';
import { pb } from '@/lib/pocketbase';

export const GameHUD = () => {
  const isAuthenticated = pb.authStore.isValid;

  return (
    <div className="...">
      {/* Existing HUD content */}
      
      <div className="absolute top-2 right-2">
        {isAuthenticated ? (
          <Badge variant="success" className="gap-1">
            <CloudCheck className="w-3 h-3" />
            Đã đồng bộ
          </Badge>
        ) : (
          <Badge variant="warning" className="gap-1">
            <CloudOff className="w-3 h-3" />
            Chế độ thử
          </Badge>
        )}
      </div>
    </div>
  );
};
```

### Step 5: Add Warning Banner

File: `src/routes/_authenticated/farm.tsx`

```tsx
export const Route = createFileRoute("/_authenticated/farm")({
  component: FarmGamePage,
});

function FarmGamePage() {
  const [loaded, setLoaded] = useState(false);
  const isAuthenticated = pb.authStore.isValid;

  return (
    <>
      {!isAuthenticated && (
        <Alert variant="warning" className="m-4">
          <Info className="h-4 w-4" />
          <AlertTitle>Chế độ chơi thử</AlertTitle>
          <AlertDescription>
            Tiến độ chỉ lưu trên thiết bị này. 
            <Link to="/login" className="underline ml-1">
              Đăng nhập
            </Link>{" "}
            để lưu vĩnh viễn.
          </AlertDescription>
        </Alert>
      )}
      
      <FarmLoader onLoaded={() => setLoaded(true)}>
        {loaded && <PhaserGame />}
      </FarmLoader>
    </>
  );
}
```

---

## Testing Checklist

### Offline Mode
- [ ] Game loads without authentication
- [ ] Player starts with default coins/level/exp
- [ ] Data saves to localStorage after transactions
- [ ] Data persists across page refresh
- [ ] Multiple browser tabs share same localStorage
- [ ] playerId generated once and reused
- [ ] Mode indicator shows "Chế độ thử"
- [ ] Warning banner visible

### Authenticated Mode
- [ ] Game loads after login
- [ ] Data fetches from PocketBase
- [ ] Data saves to PocketBase after transactions
- [ ] Mode indicator shows "Đã đồng bộ"
- [ ] No warning banner
- [ ] Logout → switch to offline mode
- [ ] Login → switch to authenticated mode

### Migration Prevention
- [ ] No "Import offline progress" button exists
- [ ] No sync option in UI
- [ ] Sign up creates empty farm (ignores offline data)
- [ ] Clear messaging: offline ≠ online

### Edge Cases
- [ ] localStorage full → show error message
- [ ] localStorage disabled → show error message
- [ ] Corrupted localStorage data → reset to default
- [ ] Switch between offline/online modes
- [ ] Multiple devices (offline isolated per device)

---

## Files to Create

1. `src/game/services/storageAdapter.ts` (interface)
2. `src/game/services/localStorageAdapter.ts` (implementation)
3. `src/game/services/pocketBaseAdapter.ts` (wrapper for existing service)
4. `src/game/services/storageFactory.ts` (mode detection)
5. `src/game/components/ModeIndicator.tsx` (UI badge)

## Files to Modify

1. `src/game/components/FarmLoader.tsx` (use adapter)
2. `src/game/services/economyService.ts` (use adapter)
3. `src/game/services/questService.ts` (use adapter)
4. `src/game/components/GameHUD.tsx` (add indicator)
5. `src/routes/_authenticated/farm.tsx` (add warning)

---

## Security Notes

### Why No Migration?

1. **Prevent Cheating:**
   - Offline data không validated server-side
   - Client có thể modify localStorage trực tiếp
   - Attacker có thể craft fake progress

2. **Economy Protection:**
   - Offline mode không có transaction validation
   - Unlimited coins/items possible via devtools
   - Không thể trust offline data cho competitive features

3. **Data Integrity:**
   - Offline và online là 2 isolated worlds
   - Mixing them breaks authentication model
   - Clear separation = better security

### LocalStorage Risks (Accepted)

**Known Issues:**
- User có thể edit localStorage manually
- No encryption (data in plain text)
- Can be deleted by user

**Why It's OK:**
- Chỉ ảnh hưởng single player
- Không competitive/leaderboard
- Just for casual play
- Free to cheat in own game

---

## UI Copy (Vietnamese)

**Mode Indicator:**
- Authenticated: "Đã đồng bộ"
- Offline: "Chế độ thử"

**Warning Banner:**
```
Chế độ chơi thử

Tiến độ chỉ lưu trên thiết bị này và sẽ bị mất khi xóa cache.
Đăng nhập để lưu vĩnh viễn.

[Đăng nhập] [Đăng ký]
```

**FAQ (if needed):**
```
Q: Tôi có thể chuyển tiến độ offline sang tài khoản không?
A: Không. Tiến độ offline không thể chuyển sang tài khoản để đảm bảo
   công bằng và bảo mật. Vui lòng đăng ký trước khi chơi để lưu tiến độ.

Q: Tại sao không cho chuyển offline → online?
A: Dữ liệu offline không được kiểm tra server nên không đảm bảo hợp lệ.
   Cho phép chuyển = tạo lỗ hổng cho gian lận.

Q: Offline data lưu ở đâu?
A: localStorage của trình duyệt. Xóa cache = mất data.
```

---

## Definition of Done

- [ ] Offline mode functional (no auth required)
- [ ] Authenticated mode functional (existing PocketBase)
- [ ] StorageAdapter abstraction complete
- [ ] LocalStorageAdapter implemented
- [ ] Mode indicator in UI
- [ ] Warning banner for offline users
- [ ] No migration path exists
- [ ] Testing checklist complete
- [ ] Build pass
- [ ] No console errors
- [ ] Documentation updated

---

**Note:** Milestone này KHÔNG bao gồm:
- Data encryption
- Cloud sync for offline data
- Offline → online migration
- Multi-device sync for offline
- Conflict resolution
- Background sync

Chỉ implement basic offline play với localStorage.
