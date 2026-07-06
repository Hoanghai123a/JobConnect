import { pb, type UserRecord } from "./pocketbase";

// ---- Types ----

export interface GardenFood {
  id: string;
  name: string;
  emoji: string;
  price: number;
  fullness: number;
  active: boolean;
  /** Pet id cụ thể (cat/dog/...) hoặc "all" (mặc định, dùng cho mọi pet) */
  petType?: string;
  created?: string;
}

export interface GardenExchangeTier {
  id: string;
  min_coins: number;
  exchange_coins: number;
  money_amount: number;
  type: "instant" | "reserve";
  active: boolean;
  created?: string;
}

export interface GardenBalance {
  id: string;
  user: string;
  coins: number;
  reserve_balance: number;
  plots?: unknown[];
  pet?: unknown;
  ownedPets?: string[];
  roamingEnabled?: boolean;
  totalHarvested?: number;
  lastStolenAt?: number;   // epoch ms — lần cuối bị chộm
  stolenCount?: number;    // số lần bị chộm trong chu kỳ hiện tại (max 2)
  gemsBestScore?: number;
  created?: string;
  updated?: string;
}

export type ExchangeStatus = "pending" | "processing" | "approved" | "rejected";

export interface GardenExchangeRequest {
  id: string;
  user: string;
  coins_spent: number;
  money_amount: number;
  type: "instant" | "reserve";
  status: ExchangeStatus;
  admin_note?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  created?: string;
  expand?: {
    user?: UserRecord;
  };
}

export interface GardenVisitSave {
  id: string;
  owner: string;
  target_user: string;
  target_username: string;
  target_name?: string;
  last_visited_at?: string;
  created?: string;
  expand?: {
    target_user?: UserRecord;
  };
}

// ---- Foods ----

export async function fetchFoods() {
  const res = await pb.collection("garden_foods").getList(1, 200, {
    sort: "price",
  });
  return res.items as unknown as GardenFood[];
}

export async function createFood(data: Omit<GardenFood, "id" | "created">) {
  return (await pb.collection("garden_foods").create(data)) as unknown as GardenFood;
}

export async function updateFood(id: string, data: Partial<GardenFood>) {
  return (await pb.collection("garden_foods").update(id, data)) as unknown as GardenFood;
}

export async function deleteFood(id: string) {
  await pb.collection("garden_foods").delete(id);
}

// ---- Exchange Tiers ----

export async function fetchExchangeTiers() {
  const res = await pb.collection("garden_exchange_tiers").getList(1, 200, {
    sort: "min_coins",
  });
  return res.items as unknown as GardenExchangeTier[];
}

export async function createExchangeTier(data: Omit<GardenExchangeTier, "id" | "created">) {
  return (await pb
    .collection("garden_exchange_tiers")
    .create(data)) as unknown as GardenExchangeTier;
}

export async function updateExchangeTier(id: string, data: Partial<GardenExchangeTier>) {
  return (await pb
    .collection("garden_exchange_tiers")
    .update(id, data)) as unknown as GardenExchangeTier;
}

export async function deleteExchangeTier(id: string) {
  await pb.collection("garden_exchange_tiers").delete(id);
}

// ---- Balances ----

const STARTING_COINS = 30;

export async function fetchBalance(userId: string): Promise<GardenBalance> {
  try {
    const list = await pb.collection("garden_balances").getList(1, 1, {
      filter: `user="${userId}"`,
    });
    if (list.items[0]) return list.items[0] as unknown as GardenBalance;
  } catch {
    // Vẫn cho phép ghé thăm bằng cách tìm user và dựng vườn trống bên dưới.
  }
  const created = await pb.collection("garden_balances").create({
    user: userId,
    coins: STARTING_COINS,
    reserve_balance: 0,
    plots: [],
    pet: null,
    ownedPets: [],
    roamingEnabled: true,
    totalHarvested: 0,
  });
  return created as unknown as GardenBalance;
}

export async function updateBalance(id: string, data: Partial<GardenBalance>) {
  return (await pb.collection("garden_balances").update(id, data)) as unknown as GardenBalance;
}

export async function fetchAllBalances() {
  const res = await pb.collection("garden_balances").getList(1, 200, {
    sort: "-coins",
    expand: "user",
  });
  return res.items as unknown as (GardenBalance & { expand?: { user?: UserRecord } })[];
}

export async function addCoins(balanceId: string, currentCoins: number, amount: number) {
  return updateBalance(balanceId, { coins: currentCoins + amount });
}

export async function deductCoins(balanceId: string, currentCoins: number, amount: number) {
  const next = Math.max(0, currentCoins - amount);
  return updateBalance(balanceId, { coins: next });
}

// ---- Exchange Requests ----

export async function fetchExchangeRequests(userId?: string) {
  const filter = userId ? `user="${userId}"` : "";
  const res = await pb.collection("garden_exchange_requests").getList(1, 200, {
    filter,
    sort: "-created",
    expand: "user",
  });
  return res.items as unknown as GardenExchangeRequest[];
}

export async function createExchangeRequest(data: {
  user: string;
  coins_spent: number;
  money_amount: number;
  type: "instant" | "reserve";
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
}) {
  const coinsSpent = Number(data.coins_spent) || 0;
  const moneyAmount = Number(data.money_amount) || 0;
  if (coinsSpent <= 0 || moneyAmount <= 0) throw new Error("Mốc quy đổi không hợp lệ");

  const balance = await fetchBalance(data.user);
  const tiers = await fetchExchangeTiers();
  const tier = tiers.find(
    (item) =>
      item.active &&
      item.exchange_coins === coinsSpent &&
      item.money_amount === moneyAmount &&
      item.type === data.type,
  );
  if (!tier) throw new Error("Mốc quy đổi không còn hiệu lực");
  if (balance.coins < tier.min_coins) throw new Error(`Cần tối thiểu ${tier.min_coins} xu để gửi yêu cầu`);
  if (balance.coins < tier.exchange_coins) throw new Error("Không đủ xu để quy đổi");

  return (await pb.collection("garden_exchange_requests").create({
    ...data,
    coins_spent: tier.exchange_coins,
    money_amount: tier.money_amount,
    status: "pending",
  })) as unknown as GardenExchangeRequest;
}

export async function approveExchangeRequest(requestId: string, adminNote?: string) {
  const request = (await pb
    .collection("garden_exchange_requests")
    .getOne(requestId)) as unknown as GardenExchangeRequest;
  if (request.status !== "pending") throw new Error("Yêu cầu đã được xử lý");

  const processingNote = adminNote?.trim() || "Đang xử lý quy đổi";
  const claimedRequest = (await pb.collection("garden_exchange_requests").update(requestId, {
    status: "processing",
    admin_note: processingNote,
  })) as unknown as GardenExchangeRequest;
  if (claimedRequest.status !== "processing") throw new Error("Không thể khóa yêu cầu để xử lý");

  const balance = await fetchBalance(request.user);
  if (balance.coins < request.coins_spent) {
    await pb.collection("garden_exchange_requests").update(requestId, {
      status: "pending",
      admin_note: "Không đủ xu tại thời điểm duyệt",
    });
    throw new Error("User không đủ xu");
  }

  const nextBalance = {
    coins: balance.coins - request.coins_spent,
    ...(request.type === "reserve"
      ? { reserve_balance: balance.reserve_balance + request.money_amount }
      : {}),
  };
  let balanceUpdated = false;

  try {
    await updateBalance(balance.id, nextBalance);
    balanceUpdated = true;

    return (await pb.collection("garden_exchange_requests").update(requestId, {
      status: "approved",
      admin_note: adminNote || "",
    })) as unknown as GardenExchangeRequest;
  } catch (error) {
    if (balanceUpdated) {
      await updateBalance(balance.id, {
        coins: balance.coins,
        ...(request.type === "reserve"
          ? { reserve_balance: balance.reserve_balance }
          : {}),
      });
    }
    await pb.collection("garden_exchange_requests").update(requestId, {
      status: "pending",
      admin_note: "Duyệt lỗi, chưa trừ xu. Vui lòng thử lại.",
    });
    throw error;
  }
}

export async function rejectExchangeRequest(requestId: string, adminNote: string) {
  return (await pb.collection("garden_exchange_requests").update(requestId, {
    status: "rejected",
    admin_note: adminNote,
  })) as unknown as GardenExchangeRequest;
}

export async function resetReserveBalance(balanceId: string) {
  return updateBalance(balanceId, { reserve_balance: 0 });
}

// ---- Visit saves ----

export async function fetchGardenVisitSaves(ownerId: string): Promise<GardenVisitSave[]> {
  const res = await pb.collection("garden_visit_saves").getList(1, 50, {
    filter: `owner="${ownerId}"`,
    sort: "-last_visited_at,-created",
    expand: "target_user",
  });
  return res.items as unknown as GardenVisitSave[];
}

export async function saveGardenVisit(
  ownerId: string,
  garden: GardenBalance & { expand?: { user?: UserRecord } },
): Promise<GardenVisitSave> {
  const targetUser = garden.expand?.user;
  const targetUsername = targetUser?.username || "";
  const targetName = targetUser?.full_name || targetUsername;
  const nowIso = new Date().toISOString();

  const existing = await pb.collection("garden_visit_saves").getList(1, 1, {
    filter: `owner="${ownerId}" && target_user="${garden.user}"`,
  });

  const data = {
    owner: ownerId,
    target_user: garden.user,
    target_username: targetUsername,
    target_name: targetName,
    last_visited_at: nowIso,
  };

  if (existing.items[0]) {
    return (await pb
      .collection("garden_visit_saves")
      .update(existing.items[0].id, data)) as unknown as GardenVisitSave;
  }

  return (await pb.collection("garden_visit_saves").create(data)) as unknown as GardenVisitSave;
}

export async function deleteGardenVisitSave(id: string) {
  await pb.collection("garden_visit_saves").delete(id);
}

// ---- Steal (ăn chộm) ----

const STEAL_PROTECT_MS = 30 * 60 * 1000; // 30 phút bảo vệ sau mỗi lần bị chộm
const STEAL_MAX_COUNT = 2;                // tối đa 2 lần bị chộm / chu kỳ

export function isGardenProtected(balance: GardenBalance, now = Date.now()): boolean {
  if (!balance.lastStolenAt) return false;
  return now - balance.lastStolenAt < STEAL_PROTECT_MS;
}

export function gardenProtectRemainingMs(balance: GardenBalance, now = Date.now()): number {
  if (!balance.lastStolenAt) return 0;
  return Math.max(0, STEAL_PROTECT_MS - (now - balance.lastStolenAt));
}

export async function fetchGardenByUsername(
  username: string,
): Promise<(GardenBalance & { expand?: { user?: UserRecord } }) | null> {
  const safeUsername = username.trim().replace(/"/g, '\\"');
  if (!safeUsername) return null;

  try {
    const res = await pb.collection("garden_balances").getList(1, 1, {
      filter: `user.username = "${safeUsername}"`,
      expand: "user",
    });
    if (res.items[0]) return res.items[0] as unknown as GardenBalance & { expand?: { user?: UserRecord } };
  } catch {
    // Không tìm được user hoặc không có quyền đọc user thì xem như không có vườn để ghé.
  }

  try {
    const res = await pb.collection("users").getList(1, 1, {
      filter: `username = "${safeUsername}"`,
    });
    const owner = res.items[0] as unknown as UserRecord | undefined;
    if (!owner) return null;

    return {
      id: "",
      user: owner.id,
      coins: 0,
      reserve_balance: 0,
      plots: [],
      pet: null,
      ownedPets: [],
      roamingEnabled: true,
      totalHarvested: 0,
      stolenCount: 0,
      expand: { user: owner },
    };
  } catch {
    // Không tìm được user hoặc không có quyền đọc user thì xem như không có vườn để ghé.
  }

  return null;
}

export async function stealCoins(params: {
  attackerBalanceId: string;
  attackerCurrentCoins: number;
  victimBalanceId: string;
  plotIndex: number;
  flowerReward: number;
}): Promise<{ newAttackerCoins: number; stolen: number }> {
  if (!params.victimBalanceId) throw new Error("Vườn này chưa có dữ liệu để chộm");
  if (params.attackerBalanceId === params.victimBalanceId) throw new Error("Không thể chộm vườn của chính mình");

  const victim = (await pb
    .collection("garden_balances")
    .getOne(params.victimBalanceId)) as unknown as GardenBalance;

  const plots: { flowerId: string | null; plantedAt: number | null; stolenAmount?: number }[] = Array.isArray(victim.plots)
    ? (victim.plots as { flowerId: string | null; plantedAt: number | null; stolenAmount?: number }[])
    : [];

  const plot = plots[params.plotIndex];
  if (!plot || !plot.flowerId) throw new Error("Ô này không có hoa để chộm");
  if (plot.stolenAmount) throw new Error("Ô này đã bị chộm rồi");

  const stolen = Math.ceil(params.flowerReward * 0.1);
  plots[params.plotIndex] = { ...plot, stolenAmount: stolen };

  await updateBalance(victim.id, { plots });

  const newAttackerCoins = params.attackerCurrentCoins + stolen;
  await updateBalance(params.attackerBalanceId, { coins: newAttackerCoins });

  return { newAttackerCoins, stolen };
}
