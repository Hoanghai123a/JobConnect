// Mini-game vườn cây + thú cưng. State lưu localStorage theo từng user, không đụng PocketBase.

export interface Plot {
  flowerId: string | null;
  plantedAt: number | null; // epoch ms
  stolenAmount?: number; // xu bị chộm, trừ vào reward khi thu hoạch
}

export interface PetState {
  id: string;
  name: string;
  lastFedAt: number;
  lastPlayedAt: number;
}

export interface GardenState {
  coins: number;
  plots: Plot[];
  unlockedPlots: number; // số ô đất đang mở (6 → tối đa 16)
  pet: PetState;
  ownedPets: string[];
  roamingEnabled: boolean;
  totalHarvested: number;
}

export interface Flower {
  id: string;
  name: string;
  emoji: string;
  sproutEmoji: string;
  seedCost: number;
  reward: number; // coin khi thu hoạch
  growMinutes: number;
}

export interface Pet {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  /** Sprite sheet chứa 4 frame ngang. Đặt trong public/pets/ */
  sprite?: string;
  /** Kích thước 1 frame (px). Default 40. */
  frameSize?: number;
  /** `true` = sprite vẽ thú quay phải. */
  facesRight?: boolean;
}

export const PLOT_COUNT = 6;   // ô ban đầu
export const PLOT_MAX = 16;    // tối đa 16 ô (mở thêm 10)

/** Chi phí mở khóa từng ô bổ sung (slot 7 → 16). Index 0 = ô thứ 7. */
export const PLOT_UNLOCK_COSTS = [20, 35, 55, 80, 110, 150, 200, 260, 330, 420];
const HUNGER_FULL_MS = 8 * 60 * 60 * 1000; // 8h thì đói hẳn
const HAPPY_FULL_MS = 12 * 60 * 60 * 1000; // 12h thì buồn hẳn

export const FLOWERS: Flower[] = [
  { id: "sunflower",  name: "Hướng dương", emoji: "🌻", sproutEmoji: "🌱", seedCost: 10, reward: 22,  growMinutes: 240 }, // 4h  +120%
  { id: "hibiscus",   name: "Dâm bụt",     emoji: "🌺", sproutEmoji: "🌱", seedCost: 12, reward: 31,  growMinutes: 300 }, // 5h  +158%
  { id: "tulip",      name: "Tulip",        emoji: "🌷", sproutEmoji: "🌱", seedCost: 15, reward: 43,  growMinutes: 360 }, // 6h  +187%
  { id: "blossom",    name: "Hoa anh đào",  emoji: "🌸", sproutEmoji: "🌱", seedCost: 18, reward: 57,  growMinutes: 420 }, // 7h  +217%
  { id: "rose",       name: "Hoa hồng",     emoji: "🌹", sproutEmoji: "🌱", seedCost: 22, reward: 77,  growMinutes: 480 }, // 8h  +250%
  { id: "orchid",     name: "Lan",          emoji: "🌼", sproutEmoji: "🌱", seedCost: 30, reward: 135, growMinutes: 600 }, // 10h +350%
  { id: "lotus",      name: "Cỏ 4 lá",     emoji: "🍀", sproutEmoji: "🌱", seedCost: 40, reward: 232, growMinutes: 720 }, // 12h +480%
];

export const PETS: Pet[] = [
  { id: "cat", name: "Mèo", emoji: "🐈", cost: 0, sprite: "/pets/cat-sprite.png", frameSize: 40, facesRight: true },
  { id: "dog", name: "Cún", emoji: "🐕", cost: 60, sprite: "/pets/dog-sprite.png", frameSize: 40, facesRight: true },
  { id: "rabbit", name: "Thỏ", emoji: "🐇", cost: 80, sprite: "/pets/rabbit-sprite.png", frameSize: 40, facesRight: true },
  { id: "chick", name: "Gà con", emoji: "🐤", cost: 50, sprite: "/pets/chick-sprite.png", frameSize: 40, facesRight: true },
  { id: "turtle", name: "Rùa", emoji: "🐢", cost: 150, sprite: "/pets/turtle-sprite.png", frameSize: 40, facesRight: true },
  { id: "hedgehog", name: "Nhím", emoji: "🦔", cost: 120, sprite: "/pets/hedgehog-sprite.png", frameSize: 40, facesRight: true },
];

export function flowerById(id: string | null): Flower | undefined {
  return id ? FLOWERS.find((f) => f.id === id) : undefined;
}

export function petById(id: string): Pet {
  return PETS.find((p) => p.id === id) ?? PETS[0];
}

const PREFIX = "garden:";
const EVENT = "garden:changed";

function key(userId: string) {
  return `${PREFIX}${userId}`;
}

function defaultState(): GardenState {
  return {
    coins: 30,
    plots: Array.from({ length: PLOT_COUNT }, () => ({ flowerId: null, plantedAt: null })),
    unlockedPlots: PLOT_COUNT,
    pet: { id: "cat", name: "Miu", lastFedAt: Date.now(), lastPlayedAt: Date.now() },
    ownedPets: ["cat"],
    roamingEnabled: true,
    totalHarvested: 0,
  };
}

/** Chi phí mở ô tiếp theo (dựa trên số ô hiện tại). */
export function plotUnlockCost(currentCount: number): number | null {
  const idx = currentCount - PLOT_COUNT;
  if (idx < 0 || idx >= PLOT_UNLOCK_COSTS.length) return null;
  return PLOT_UNLOCK_COSTS[idx];
}

function normalizePastTimestamp(value: unknown, fallback: number, now = Date.now()): number {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return fallback;
  return Math.min(time, now);
}

export function loadGarden(userId?: string): GardenState {
  if (!userId || typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<GardenState>;
    const base = defaultState();
    const unlocked = Math.max(
      PLOT_COUNT,
      Math.min(PLOT_MAX, Number(parsed.unlockedPlots) || PLOT_COUNT),
    );
    const plots = Array.isArray(parsed.plots)
      ? parsed.plots.slice(0, unlocked).map((p) => ({
          flowerId: p?.flowerId ?? null,
          plantedAt: typeof p?.plantedAt === "number" ? p.plantedAt : null,
        }))
      : base.plots;
    while (plots.length < unlocked) plots.push({ flowerId: null, plantedAt: null });
    const next = {
      ...base,
      ...parsed,
      plots,
      unlockedPlots: unlocked,
      pet: {
        ...base.pet,
        ...parsed.pet,
        lastFedAt: normalizePastTimestamp(parsed.pet?.lastFedAt, base.pet.lastFedAt),
        lastPlayedAt: normalizePastTimestamp(parsed.pet?.lastPlayedAt, base.pet.lastPlayedAt),
      },
      ownedPets: parsed.ownedPets?.length ? parsed.ownedPets : base.ownedPets,
    };
    if (
      next.pet.lastFedAt !== parsed.pet?.lastFedAt ||
      next.pet.lastPlayedAt !== parsed.pet?.lastPlayedAt
    ) {
      window.localStorage.setItem(key(userId), JSON.stringify(next));
    }
    return next;
  } catch {
    return defaultState();
  }
}

export function saveGarden(userId: string | undefined, state: GardenState) {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(key(userId), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }));
}

export function onGardenChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ---- fullness / food ----

const HUNGER_FULL_PERCENT = 100;

export function normalizeFullness(fullness: unknown): number {
  const raw = Number(fullness);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const percent = raw > 0 && raw < 1 ? raw * HUNGER_FULL_PERCENT : raw;
  return Math.max(0, Math.min(HUNGER_FULL_PERCENT, percent));
}

/**
 * Apply food fullness to pet. Directly adds fullness% to current hunger level.
 * fullness: 1-100 (percentage points to add).
 */
export function applyFood(pet: PetState, fullness: unknown, now = Date.now()): PetState {
  const safeFullness = normalizeFullness(fullness);
  if (safeFullness <= 0) return pet;
  const lastFedAt = normalizePastTimestamp(pet.lastFedAt, now, now);
  const currentHunger = Math.max(0, Math.min(1, 1 - (now - lastFedAt) / HUNGER_FULL_MS));
  const newHunger = Math.min(1, currentHunger + safeFullness / 100);
  const newLastFedAt = Math.round(now - (1 - newHunger) * HUNGER_FULL_MS);
  return { ...pet, lastFedAt: newLastFedAt };
}

// ---- logic dẫn xuất ----

export function growthProgress(plot: Plot, now = Date.now()): number {
  const flower = flowerById(plot.flowerId);
  if (!flower || !plot.plantedAt) return 0;
  const elapsed = now - plot.plantedAt;
  const total = flower.growMinutes * 60 * 1000;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function isReady(plot: Plot, now = Date.now()): boolean {
  return Boolean(plot.flowerId) && growthProgress(plot, now) >= 1;
}

export function readyInMinutes(plot: Plot, now = Date.now()): number {
  const flower = flowerById(plot.flowerId);
  if (!flower || !plot.plantedAt) return 0;
  const total = flower.growMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((plot.plantedAt + total - now) / 60000));
}

/** 0..1, 1 = no đủ */
export function hunger(pet: PetState, now = Date.now()): number {
  const lastFedAt = normalizePastTimestamp(pet.lastFedAt, now, now);
  return Math.max(0, Math.min(1, 1 - (now - lastFedAt) / HUNGER_FULL_MS));
}

/** 0..1, 1 = rất vui */
export function happiness(pet: PetState, now = Date.now()): number {
  const lastPlayedAt = normalizePastTimestamp(pet.lastPlayedAt, now, now);
  return Math.max(0, Math.min(1, 1 - (now - lastPlayedAt) / HAPPY_FULL_MS));
}

export function petMood(pet: PetState, now = Date.now()): "great" | "ok" | "sad" {
  const score = (hunger(pet, now) + happiness(pet, now)) / 2;
  if (score > 0.6) return "great";
  if (score > 0.3) return "ok";
  return "sad";
}

// ---- lời thoại của thú cưng ----

const GREETINGS = [
  "Hôm nay chủ nhân ổn chứ?",
  "Chủ nhân nhớ uống nước nha!",
  "Chủ nhân làm việc vừa sức thôi nhé.",
  "Mình ở đây nếu chủ nhân cần bạn đồng hành.",
  "Chủ nhân nghỉ ngơi một chút đi nào.",
  "Chúc chủ nhân một ngày nhẹ nhàng!",
  "Chủ nhân làm tốt lắm rồi đó.",
  "Chủ nhân cười lên nào, mọi chuyện sẽ ổn thôi.",
  "Chủ nhân hít thở sâu một hơi nhé.",
  "Chủ nhân đừng quên duỗi vai một chút!",
  "Mình yêu chủ nhân lắm!",
  "Chủ nhân có biết hôm nay trời đẹp lắm không?",
  "Mình vui vì được ở bên chủ nhân.",
  "Chủ nhân ơi, cố lên nha!",
  "Chủ nhân có mệt không? Nghỉ chút đi!",
];

const HUNGRY_LINES = [
  "Bụng mình kêu rồi... chủ nhân cho mình ăn với?",
  "Chủ nhân ơi, mình hơi đói, ghé vườn cho mình ăn nha!",
  "Có gì ăn không chủ nhân ơi?",
  "Mình thèm ăn quá chủ nhân ơi...",
  "Cho mình miếng gì đi chủ nhân!",
];

const SAD_LINES = [
  "Lâu rồi mình chưa được chơi cùng chủ nhân...",
  "Mình hơi buồn, chủ nhân qua vườn chơi với mình nhé?",
  "Chủ nhân ghé thăm mình chút được không?",
  "Mình nhớ chủ nhân lắm...",
  "Chủ nhân quên mình rồi sao?",
];

const HARVEST_LINES = [
  "Có hoa nở rồi kìa, chủ nhân vào thu hoạch thôi!",
  "Vườn của chủ nhân đang chờ đó nha!",
  "Chủ nhân ơi, hình như có hoa chín rồi đấy!",
  "Chủ nhân nhớ thu hoạch nhé!",
  "Hoa đẹp lắm, chủ nhân vào hái đi!",
  "Vườn đang nở rộ kìa chủ nhân!",
];

const ATTENDANCE_LINES = [
  "Chủ nhân nhớ chấm công nhé!",
  "Hôm nay chủ nhân chấm công chưa nhỉ?",
  "Chủ nhân ơi, ghé chấm công kẻo quên nha!",
  "Chấm công đi chủ nhân!",
  "Đừng quên chấm công nha chủ nhân!",
  "Chủ nhân chấm công chưa? Đừng để muộn!",
];

const NEWS_LINES = [
  "Có tin mới kìa chủ nhân!",
  "Chủ nhân ơi, có tin tuyển dụng mới!",
  "Bảng tin có cập nhật mới, chủ nhân xem chưa?",
  "Tin mới nè chủ nhân, vào xem đi!",
  "Chủ nhân ơi có thông báo mới kìa!",
];

function pick(arr: string[], seed: number): string {
  return arr[Math.abs(seed) % arr.length];
}

const REACTIONS = {
  hungry: ["🍖", "🥺", "😋", "🍗"],
  sad: ["💧", "😢", "🥀"],
  sleepy: ["💤", "😴"],
  great: ["❤️", "💕", "✨", "💖"],
  ok: ["😊", "🌟", "🎵", "🌸"],
  harvest: ["🌻", "✨", "🎉"],
  attendance: ["⏰"],
  news: ["🔔"],
};

export function pickReaction(
  state: GardenState,
  seed: number,
  ctx: PetContext = EMPTY_CTX,
  now = Date.now(),
): string {
  if (hunger(state.pet, now) < 0.3) return pick(REACTIONS.hungry, seed);
  if (happiness(state.pet, now) < 0.3) return pick(REACTIONS.sad, seed);

  const slot = Math.abs(seed) % 10;
  if (state.plots.some((p) => isReady(p, now)) && slot === 0) {
    return pick(REACTIONS.harvest, seed);
  }
  if (ctx.unreadNews > 0 && slot === 1) return pick(REACTIONS.news, seed);
  if (ctx.needsAttendance && slot === 2) return pick(REACTIONS.attendance, seed);
  if (slot === 3) return pick(REACTIONS.sleepy, seed);

  return petMood(state.pet, now) === "great"
    ? pick(REACTIONS.great, seed)
    : pick(REACTIONS.ok, seed);
}

export interface PetSpeech {
  text: string;
  tone: "happy" | "hungry" | "sad" | "harvest" | "attendance" | "news";
}

export interface PetContext {
  needsAttendance: boolean;
  unreadNews: number;
}

const EMPTY_CTX: PetContext = { needsAttendance: false, unreadNews: 0 };

/** Chọn câu thoại theo trạng thái. seed để tránh Math.random gây hydrate mismatch. */
export function pickSpeech(
  state: GardenState,
  seed: number,
  ctx: PetContext = EMPTY_CTX,
  now = Date.now(),
): PetSpeech {
  if (hunger(state.pet, now) < 0.2) {
    return { text: pick(HUNGRY_LINES, seed), tone: "hungry" };
  }
  if (happiness(state.pet, now) < 0.2) {
    return { text: pick(SAD_LINES, seed), tone: "sad" };
  }

  const anyReady = state.plots.some((p) => isReady(p, now));
  const slot = Math.abs(seed) % 6;
  if (anyReady && slot === 0) return { text: pick(HARVEST_LINES, seed), tone: "harvest" };
  if (ctx.unreadNews > 0 && slot === 1) return { text: pick(NEWS_LINES, seed), tone: "news" };
  if (ctx.needsAttendance && slot === 2) {
    return { text: pick(ATTENDANCE_LINES, seed), tone: "attendance" };
  }
  if (hunger(state.pet, now) < 0.4 && slot === 3) {
    return { text: pick(HUNGRY_LINES, seed), tone: "hungry" };
  }
  if (happiness(state.pet, now) < 0.4 && slot === 4) {
    return { text: pick(SAD_LINES, seed), tone: "sad" };
  }
  return { text: pick(GREETINGS, seed), tone: "happy" };
}
