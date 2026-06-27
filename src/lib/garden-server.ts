import { pb, type UserRecord } from "./pocketbase";

// ---- Types ----

export interface GardenFood {
  id: string;
  name: string;
  emoji: string;
  price: number;
  fullness: number; // 1-100, maps to % of 8h hunger bar restored
  active: boolean;
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
  plots?: any[];
  pet?: any;
  ownedPets?: string[];
  roamingEnabled?: boolean;
  totalHarvested?: number;
  created?: string;
  updated?: string;
}

export type ExchangeStatus = "pending" | "approved" | "rejected";

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

// ---- Foods ----

export async function fetchFoods() {
  return (await pb.collection("garden_foods").getFullList({
    sort: "price",
  })) as unknown as GardenFood[];
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
  return (await pb.collection("garden_exchange_tiers").getFullList({
    sort: "min_coins",
  })) as unknown as GardenExchangeTier[];
}

export async function createExchangeTier(data: Omit<GardenExchangeTier, "id" | "created">) {
  return (await pb.collection("garden_exchange_tiers").create(data)) as unknown as GardenExchangeTier;
}

export async function updateExchangeTier(id: string, data: Partial<GardenExchangeTier>) {
  return (await pb.collection("garden_exchange_tiers").update(id, data)) as unknown as GardenExchangeTier;
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
  } catch {}
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
  return (await pb.collection("garden_balances").getFullList({
    sort: "-coins",
    expand: "user",
  })) as unknown as (GardenBalance & { expand?: { user?: UserRecord } })[];
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
  return (await pb.collection("garden_exchange_requests").getFullList({
    filter,
    sort: "-created",
    expand: "user",
  })) as unknown as GardenExchangeRequest[];
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
  return (await pb.collection("garden_exchange_requests").create({
    ...data,
    status: "pending",
  })) as unknown as GardenExchangeRequest;
}

export async function approveExchangeRequest(requestId: string, adminNote?: string) {
  const request = (await pb.collection("garden_exchange_requests").getOne(requestId)) as unknown as GardenExchangeRequest;
  if (request.status !== "pending") throw new Error("Yêu cầu đã được xử lý");

  const balance = await fetchBalance(request.user);
  if (balance.coins < request.coins_spent) throw new Error("User không đủ xu");

  await updateBalance(balance.id, {
    coins: balance.coins - request.coins_spent,
    ...(request.type === "reserve" ? { reserve_balance: balance.reserve_balance + request.money_amount } : {}),
  });

  return (await pb.collection("garden_exchange_requests").update(requestId, {
    status: "approved",
    admin_note: adminNote || "",
  })) as unknown as GardenExchangeRequest;
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
