import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/BottomNav";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import {
  FLOWERS,
  PETS,
  PLOT_COUNT,
  flowerById,
  petById,
  loadGarden,
  saveGarden,
  growthProgress,
  isReady,
  readyInMinutes,
  hunger,
  happiness,
  petMood,
  applyFood,
  type GardenState,
  type Flower,
} from "@/lib/garden";
import {
  fetchFoods,
  fetchExchangeTiers,
  fetchBalance,
  updateBalance,
  fetchExchangeRequests,
  createExchangeRequest,
  approveExchangeRequest,
  rejectExchangeRequest,
  fetchAllBalances,
  createFood,
  updateFood,
  deleteFood,
  createExchangeTier,
  updateExchangeTier,
  deleteExchangeTier,
  resetReserveBalance,
  type GardenFood,
  type GardenExchangeTier,
  type GardenBalance,
  type GardenExchangeRequest,
} from "@/lib/garden-server";
import { Coins, Sparkles, Drumstick, Hand, Store, Leaf, ArrowRightLeft, Settings2, Check, X, Plus, Trash2, Wallet, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/garden")({
  component: GardenPage,
});

type MainTab = "garden" | "food" | "exchange" | "admin";

function GardenPage() {
  const { user, isAdmin } = useAuth();
  const isStaff = user?.role === "staff";
  const [state, setState] = useState<GardenState | null>(null);
  const [balance, setBalance] = useState<GardenBalance | null>(null);
  const [foods, setFoods] = useState<GardenFood[]>([]);
  const [tiers, setTiers] = useState<GardenExchangeTier[]>([]);
  const [tick, setTick] = useState(0);
  const [seedPickerFor, setSeedPickerFor] = useState<number | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [playHearts, setPlayHearts] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("garden");

  const loadServerData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [bal, foodList, tierList] = await Promise.all([
        fetchBalance(user.id),
        fetchFoods().catch(() => []),
        fetchExchangeTiers().catch(() => []),
      ]);
      setBalance(bal);
      setFoods(foodList.filter((f) => f.active));
      setTiers(tierList.filter((t) => t.active));
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      setState(loadGarden(user.id));
      loadServerData();
    }
  }, [user?.id, loadServerData]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const coins = balance?.coins ?? state?.coins ?? 0;

  const commit = useCallback(
    (next: GardenState) => {
      setState(next);
      saveGarden(user?.id, next);
    },
    [user?.id],
  );

  const syncCoins = useCallback(
    async (newCoins: number) => {
      if (balance) {
        const updated = await updateBalance(balance.id, { coins: newCoins });
        setBalance(updated);
      }
    },
    [balance],
  );

  const now = useMemo(() => Date.now(), [tick, state]);

  if (!state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Đang tải vườn...
      </div>
    );
  }

  const pet = petById(state.pet.id);
  const mood = petMood(state.pet, now);
  const hungerPct = Math.round(hunger(state.pet, now) * 100);
  const happyPct = Math.round(happiness(state.pet, now) * 100);

  const plantSeed = (plotIndex: number, flower: Flower) => {
    if (!isAdmin && coins < flower.seedCost) {
      toast.error("Không đủ xu để mua hạt giống");
      return;
    }
    const plots = state.plots.slice();
    plots[plotIndex] = { flowerId: flower.id, plantedAt: Date.now() };
    const newCoins = isAdmin ? coins : coins - flower.seedCost;
    commit({ ...state, coins: newCoins, plots });
    if (!isAdmin) syncCoins(newCoins);
    setSeedPickerFor(null);
    toast.success(`Đã trồng ${flower.name}`);
  };

  const harvest = (plotIndex: number) => {
    const plot = state.plots[plotIndex];
    const flower = flowerById(plot.flowerId);
    if (!flower || !isReady(plot, now)) return;
    const plots = state.plots.slice();
    plots[plotIndex] = { flowerId: null, plantedAt: null };
    const newCoins = coins + flower.reward;
    commit({
      ...state,
      coins: newCoins,
      plots,
      totalHarvested: state.totalHarvested + 1,
    });
    syncCoins(newCoins);
    toast.success(`Thu hoạch ${flower.name} +${flower.reward} xu`);
  };

  const feedPet = () => {
    commit({ ...state, pet: { ...state.pet, lastFedAt: Date.now() } });
    toast.success(`${state.pet.name} đã được ăn no!`);
  };

  const buyFood = (food: GardenFood) => {
    if (!isAdmin && coins < food.price) {
      toast.error("Không đủ xu");
      return;
    }
    const newCoins = isAdmin ? coins : coins - food.price;
    const newPet = applyFood(state.pet, food.fullness, now);
    commit({ ...state, coins: newCoins, pet: newPet });
    if (!isAdmin) syncCoins(newCoins);
    toast.success(`${state.pet.name} ăn ${food.name}, no thêm ${food.fullness}%!`);
  };

  const playPet = () => {
    commit({ ...state, pet: { ...state.pet, lastPlayedAt: Date.now() } });
    setPlayHearts(true);
    setTimeout(() => setPlayHearts(false), 1500);
  };

  const buyPet = (petId: string, cost: number) => {
    if (state.ownedPets.includes(petId)) {
      commit({ ...state, pet: { ...state.pet, id: petId } });
      toast.success("Đã chọn thú cưng");
      return;
    }
    if (!isAdmin && coins < cost) {
      toast.error("Không đủ xu");
      return;
    }
    const newCoins = isAdmin ? coins : coins - cost;
    commit({
      ...state,
      coins: newCoins,
      ownedPets: [...state.ownedPets, petId],
      pet: { ...state.pet, id: petId },
    });
    if (!isAdmin) syncCoins(newCoins);
    toast.success("Mở khóa thú cưng mới!");
  };

  return (
    <div className="pb-nav">
      <AppHeader
        title="Vườn của tôi"
        subtitle="Trồng hoa, nuôi thú, thư giãn chút nha"
        right={
          <button
            type="button"
            onClick={() => !isStaff && setExchangeOpen(true)}
            className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700 transition active:scale-95"
          >
            <Coins className="h-4 w-4" />
            {coins}
          </button>
        }
      />

      <div className="space-y-4 px-4 pt-4">
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className="space-y-3">
          {isAdmin ? (
            <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="garden" className="rounded-lg text-xs">Vườn</TabsTrigger>
              <TabsTrigger value="admin" className="rounded-lg text-xs">Quản lý</TabsTrigger>
            </TabsList>
          ) : null}

          <TabsContent value="garden" className="mt-0 space-y-4">
        {/* Khu thú cưng */}
        <section className="gradient-hero relative overflow-hidden rounded-3xl p-4 text-white shadow-soft">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className={cn("relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur", playHearts && "animate-wiggle")}>
              {pet.sprite ? (
                <div
                  className={cn(
                    "h-14 w-14",
                    mood === "great" && "animate-bounce",
                    mood === "sad" && "opacity-70",
                  )}
                  style={{
                    backgroundImage: `url(${pet.sprite})`,
                    backgroundSize: "400% 100%",
                    backgroundPosition: "0 0",
                    backgroundRepeat: "no-repeat",
                    imageRendering: "pixelated",
                  }}
                />
              ) : (
                <span
                  className={cn(
                    "inline-block text-5xl",
                    mood === "great" && "animate-bounce",
                    mood === "sad" && "opacity-70",
                  )}
                >
                  {pet.emoji}
                </span>
              )}
              {playHearts && <FloatingHearts />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-lg font-semibold">{state.pet.name}</div>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide backdrop-blur">
                  {pet.name}
                </span>
              </div>
              <Meter label="No bụng" value={hungerPct} icon={<Drumstick className="h-3 w-3" />} />
              <Meter label="Vui vẻ" value={happyPct} icon={<Sparkles className="h-3 w-3" />} />
            </div>
          </div>
          <div className="relative mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => setFeedOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 py-2 text-sm font-medium text-emerald-700 transition active:scale-95"
            >
              <Drumstick className="h-4 w-4" /> Cho ăn
            </button>
            <button
              onClick={playPet}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-white/90 py-2 text-sm font-medium text-emerald-700 transition active:scale-95"
            >
              <Hand className="h-4 w-4" /> Vuốt ve
            </button>
          </div>
        </section>

        {/* Hành động phụ */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShopOpen(true)}
            className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-medium shadow-soft transition active:scale-95"
          >
            <Store className="h-4 w-4 text-primary" /> Cửa hàng thú
          </button>
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-card px-3 py-3 text-sm font-medium shadow-soft">
            <span className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-primary" /> Đi dạo
            </span>
            <Switch
              checked={state.roamingEnabled}
              onCheckedChange={(v) => commit({ ...state, roamingEnabled: v })}
            />
          </div>
        </div>

        {/* Khu vườn */}
        <section className="rounded-3xl bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold tracking-tight">Luống hoa</div>
            <div className="text-[11px] text-muted-foreground">
              Đã thu hoạch: {state.totalHarvested}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: PLOT_COUNT }).map((_, i) => {
              const plot = state.plots[i];
              const flower = flowerById(plot.flowerId);
              const ready = isReady(plot, now);
              const progress = growthProgress(plot, now);
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (!flower) setSeedPickerFor(i);
                    else if (ready) harvest(i);
                  }}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition active:scale-95",
                    flower
                      ? ready
                        ? "border-amber-400 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50"
                      : "border-border bg-muted/40",
                  )}
                >
                  {!flower ? (
                    <span className="text-2xl text-muted-foreground/50">+</span>
                  ) : (
                    <>
                      <span className={cn("text-2xl", ready && "animate-bounce")}>
                        {ready ? flower.emoji : flower.sproutEmoji}
                      </span>
                      <span className="text-[9px] font-medium text-foreground/70">
                        {flower.name}
                      </span>
                      {ready ? (
                        <span className="text-[10px] font-semibold text-amber-600">
                          Thu hoạch
                        </span>
                      ) : (
                        <>
                          <div className="h-1 w-10 overflow-hidden rounded-full bg-emerald-200">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${Math.round(progress * 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground">
                            {readyInMinutes(plot, now) >= 60
                              ? `${Math.floor(readyInMinutes(plot, now) / 60)}h ${readyInMinutes(plot, now) % 60}p`
                              : `${readyInMinutes(plot, now)}p`}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Chạm ô trống để trồng hoa · chạm hoa đã nở để thu hoạch lấy xu
          </p>
        </section>
          </TabsContent>

          <TabsContent value="food" className="mt-0 space-y-3">
            <FoodShopTab foods={foods} coins={coins} petName={state.pet.name} onBuy={buyFood} isAdmin={isAdmin} />
          </TabsContent>

          {!isStaff && (
            <TabsContent value="exchange" className="mt-0 space-y-3">
              <ExchangeTab
                user={user!}
                balance={balance}
                tiers={tiers}
                onSuccess={() => loadServerData()}
              />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="admin" className="mt-0 space-y-3">
              <AdminTab onDataChanged={loadServerData} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Chọn hạt giống */}
      <Dialog open={seedPickerFor !== null} onOpenChange={(o) => !o && setSeedPickerFor(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Chọn hạt giống</DialogTitle>
            <DialogDescription>Hoa sẽ nở sau một khoảng thời gian, ghé lại thu hoạch nhé.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {FLOWERS.map((f) => {
              const affordable = isAdmin || coins >= f.seedCost;
              return (
                <button
                  key={f.id}
                  disabled={!affordable}
                  onClick={() => seedPickerFor !== null && plantSeed(seedPickerFor, f)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
                    affordable ? "border-border bg-card" : "border-border bg-muted/40 opacity-60",
                  )}
                >
                  <span className="text-3xl">{f.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{f.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Nở sau {Math.round(f.growMinutes / 60)}h · bán được {f.reward} xu
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                    <Coins className="h-3 w-3" /> {f.seedCost}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Cho ăn */}
      <Dialog open={feedOpen} onOpenChange={setFeedOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Cho {state.pet.name} ăn</DialogTitle>
            <DialogDescription>Chọn thức ăn để tăng độ no cho thú cưng.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {foods.length === 0 ? (
              <div className="rounded-xl border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                Admin chưa thiết lập thức ăn nào.
              </div>
            ) : (
              foods.map((f) => {
                const affordable = isAdmin || coins >= f.price;
                return (
                  <button
                    key={f.id}
                    disabled={!affordable}
                    onClick={() => { buyFood(f); setFeedOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
                      affordable ? "border-border bg-card" : "border-border bg-muted/40 opacity-60",
                    )}
                  >
                    <span className="text-2xl">{f.emoji || "🍖"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        No thêm {f.fullness}%
                      </div>
                    </div>
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      <Coins className="h-3 w-3" /> {f.price}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quy đổi xu */}
      {!isStaff && (
        <Dialog open={exchangeOpen} onOpenChange={setExchangeOpen}>
          <DialogContent className="max-h-[80vh] overflow-y-auto rounded-3xl">
            <DialogHeader>
              <DialogTitle>Quy đổi xu</DialogTitle>
              <DialogDescription>Đổi xu thành tiền thưởng.</DialogDescription>
            </DialogHeader>
            <ExchangeTab
              user={user!}
              balance={balance}
              tiers={tiers}
              onSuccess={() => { loadServerData(); setExchangeOpen(false); }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Cửa hàng thú */}
      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Cửa hàng thú cưng</DialogTitle>
            <DialogDescription>Mở khóa bạn đồng hành mới bằng xu thu hoạch được.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {PETS.map((p) => {
              const owned = state.ownedPets.includes(p.id);
              const active = state.pet.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => buyPet(p.id, p.cost)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border p-3 transition active:scale-95",
                    active ? "border-primary bg-primary/10" : "border-border bg-card",
                  )}
                >
                  {p.sprite ? (
                    <div
                      className="h-12 w-12"
                      style={{
                        backgroundImage: `url(${p.sprite})`,
                        backgroundSize: "400% 100%",
                        backgroundPosition: "0 0",
                        backgroundRepeat: "no-repeat",
                        imageRendering: "pixelated",
                      }}
                    />
                  ) : (
                    <span className="text-4xl">{p.emoji}</span>
                  )}
                  <span className="text-sm font-semibold">{p.name}</span>
                  {active ? (
                    <span className="text-[10px] font-semibold text-primary">Đang chọn</span>
                  ) : owned ? (
                    <span className="text-[10px] text-muted-foreground">Chạm để chọn</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                      <Coins className="h-3 w-3" /> {p.cost}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Meter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-white/80">
        {icon} {label}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value > 60 ? "bg-emerald-300" : value > 30 ? "bg-amber-300" : "bg-red-300",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ---- Food Shop Tab ----

function FoodShopTab({ foods, coins, petName, onBuy, isAdmin = false }: { foods: GardenFood[]; coins: number; petName: string; onBuy: (food: GardenFood) => void; isAdmin?: boolean }) {
  if (foods.length === 0) {
    return <EmptyState icon={Drumstick} title="Chưa có thức ăn" description="Admin chưa thêm thức ăn vào cửa hàng." />;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Mua thức ăn cho {petName}. Mỗi món cho no bụng khác nhau.</div>
      {foods.map((f) => {
        const canAfford = isAdmin || coins >= f.price;
        return (
          <button
            key={f.id}
            disabled={!canAfford}
            onClick={() => onBuy(f)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
              canAfford ? "border-border bg-card" : "border-border bg-muted/40 opacity-60",
            )}
          >
            <span className="text-3xl">{f.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{f.name}</div>
              <div className="text-[11px] text-muted-foreground">No bụng +{f.fullness}%</div>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
              <Coins className="h-3 w-3" /> {f.price}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Exchange Tab ----

function ExchangeTab({ user, balance, tiers, onSuccess }: { user: { id: string; bank_name?: string; bank_account_number?: string; bank_account_name?: string }; balance: GardenBalance | null; tiers: GardenExchangeTier[]; onSuccess: () => void }) {
  const [requests, setRequests] = useState<GardenExchangeRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExchangeRequests(user.id).then(setRequests).catch(() => {});
  }, [user.id]);

  const coins = balance?.coins ?? 0;
  const reserve = balance?.reserve_balance ?? 0;
  const hasBank = Boolean(user.bank_name && user.bank_account_number);

  const doExchange = async (tier: GardenExchangeTier) => {
    if (!hasBank) { toast.error("Bạn cần cập nhật số tài khoản ngân hàng trước khi quy đổi"); return; }
    if (coins < tier.exchange_coins) { toast.error("Không đủ xu"); return; }
    setSubmitting(true);
    try {
      await createExchangeRequest({
        user: user.id,
        coins_spent: tier.exchange_coins,
        money_amount: tier.money_amount,
        type: tier.type,
        bank_name: user.bank_name || "",
        bank_account_number: user.bank_account_number || "",
        bank_account_name: user.bank_account_name || "",
      });
      toast.success("Gửi thành công, chờ phản hồi từ Admin trong vòng 12h");
      onSuccess();
      const updated = await fetchExchangeRequests(user.id);
      setRequests(updated);
    } catch (e: any) { toast.error(e?.message || "Lỗi gửi yêu cầu"); } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Xu hiện tại</div>
          <div className="flex items-center gap-1 text-sm font-semibold text-amber-700">
            <Coins className="h-4 w-4" /> {coins}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Tiền thưởng dự trữ</div>
          <div className="text-sm font-semibold text-emerald-700">{reserve.toLocaleString("vi-VN")} đ</div>
        </div>
        {!hasBank && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Cần cập nhật STK ngân hàng trong Tài khoản để quy đổi xu.
          </div>
        )}
      </Card>

      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bảng quy đổi</div>
      {tiers.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="Chưa có mốc quy đổi" description="Admin chưa thiết lập bảng quy đổi." />
      ) : (
        tiers.map((t) => {
          const canExchange = coins >= t.exchange_coins && hasBank;
          return (
            <Card key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <div className="text-sm font-semibold">{t.exchange_coins} xu → {t.money_amount.toLocaleString("vi-VN")} đ</div>
                <div className="text-[11px] text-muted-foreground">
                  Cần tối thiểu {t.min_coins} xu · {t.type === "instant" ? "Nhận ngay" : "Tích trữ"}
                </div>
              </div>
              <Button
                size="sm"
                disabled={!canExchange || submitting}
                onClick={() => doExchange(t)}
                className="shrink-0"
              >
                Đổi
              </Button>
            </Card>
          );
        })
      )}

      {requests.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lịch sử yêu cầu</div>
          {requests.slice(0, 10).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">{r.coins_spent} xu → {r.money_amount.toLocaleString("vi-VN")} đ</div>
                <StatusChip tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                  {r.status === "approved" ? "Đã duyệt" : r.status === "rejected" ? "Đã huỷ" : "Chờ duyệt"}
                </StatusChip>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {r.type === "instant" ? "Nhận ngay" : "Tích trữ"} · {r.created ? new Date(r.created).toLocaleDateString("vi-VN") : ""}
              </div>
              {r.admin_note && <div className="mt-1 rounded-lg bg-muted/60 p-2 text-[11px]">{r.admin_note}</div>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// ---- Admin Tab ----

function AdminTab({ onDataChanged }: { onDataChanged: () => void }) {
  const [sub, setSub] = useState<"foods" | "tiers" | "requests" | "balances">("requests");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["requests", "foods", "tiers", "balances"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setSub(k)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              sub === k ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground",
            )}
          >
            {k === "requests" ? "Duyệt yêu cầu" : k === "foods" ? "Thức ăn" : k === "tiers" ? "Bảng quy đổi" : "Xu user"}
          </button>
        ))}
      </div>
      {sub === "requests" && <AdminRequests onDataChanged={onDataChanged} />}
      {sub === "foods" && <AdminFoods onDataChanged={onDataChanged} />}
      {sub === "tiers" && <AdminTiers onDataChanged={onDataChanged} />}
      {sub === "balances" && <AdminBalances />}
    </div>
  );
}

function AdminRequests({ onDataChanged }: { onDataChanged: () => void }) {
  const [requests, setRequests] = useState<GardenExchangeRequest[]>([]);
  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => { fetchExchangeRequests().then(setRequests).catch(() => {}); }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveExchangeRequest(id, note);
      toast.success("Đã duyệt");
      setActiveId(null); setNote("");
      const updated = await fetchExchangeRequests();
      setRequests(updated);
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi duyệt"); }
  };

  const handleReject = async (id: string) => {
    if (!note.trim()) { toast.warning("Nhập lý do huỷ"); return; }
    try {
      await rejectExchangeRequest(id, note);
      toast.success("Đã huỷ");
      setActiveId(null); setNote("");
      const updated = await fetchExchangeRequests();
      setRequests(updated);
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi huỷ"); }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold">Chờ duyệt ({pending.length})</div>
      {pending.length === 0 && <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">Không có yêu cầu nào.</div>}
      {pending.map((r) => (
        <Card key={r.id} className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{r.expand?.user?.full_name || "User"}</div>
            <StatusChip tone="warning">Chờ duyệt</StatusChip>
          </div>
          <div className="text-xs text-muted-foreground">
            {r.coins_spent} xu → {r.money_amount.toLocaleString("vi-VN")} đ · {r.type === "instant" ? "Nhận ngay" : "Tích trữ"}
          </div>
          <div className="text-xs text-muted-foreground">
            STK: {r.bank_name} · {r.bank_account_number} · {r.bank_account_name}
          </div>
          {activeId === r.id ? (
            <div className="space-y-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Phản hồi (bắt buộc khi huỷ)" className="text-xs" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleApprove(r.id)}><Check className="h-3 w-3" /> Duyệt</Button>
                <Button size="sm" variant="destructive" onClick={() => handleReject(r.id)}><X className="h-3 w-3" /> Huỷ</Button>
                <Button size="sm" variant="outline" onClick={() => setActiveId(null)}>Đóng</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setActiveId(r.id)}>Xử lý</Button>
          )}
        </Card>
      ))}
      {resolved.length > 0 && (
        <>
          <div className="text-xs font-semibold">Đã xử lý ({resolved.length})</div>
          {resolved.slice(0, 10).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{r.expand?.user?.full_name || "User"} · {r.coins_spent} xu</div>
                <StatusChip tone={r.status === "approved" ? "success" : "danger"}>
                  {r.status === "approved" ? "Đã duyệt" : "Đã huỷ"}
                </StatusChip>
              </div>
              {r.admin_note && <div className="mt-1 text-[11px] text-muted-foreground">{r.admin_note}</div>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function AdminFoods({ onDataChanged }: { onDataChanged: () => void }) {
  const [foods, setFoods] = useState<GardenFood[]>([]);
  const [form, setForm] = useState({ name: "", emoji: "🍖", price: "10", fullness: "30" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", emoji: "", price: "", fullness: "" });

  useEffect(() => { fetchFoods().then(setFoods).catch(() => {}); }, []);

  const add = async () => {
    if (!form.name.trim()) { toast.warning("Nhập tên thức ăn"); return; }
    await createFood({ name: form.name, emoji: form.emoji, price: Number(form.price) || 10, fullness: Number(form.fullness) || 30, active: true });
    setForm({ name: "", emoji: "🍖", price: "10", fullness: "30" });
    const updated = await fetchFoods();
    setFoods(updated);
    onDataChanged();
    toast.success("Đã thêm");
  };

  const startEdit = (f: GardenFood) => {
    setEditId(f.id);
    setEditForm({ name: f.name, emoji: f.emoji || "🍖", price: String(f.price), fullness: String(f.fullness) });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await updateFood(editId, { name: editForm.name, emoji: editForm.emoji, price: Number(editForm.price) || 10, fullness: Number(editForm.fullness) || 30 });
    setEditId(null);
    const updated = await fetchFoods();
    setFoods(updated);
    onDataChanged();
    toast.success("Đã cập nhật");
  };

  const remove = async (id: string) => {
    await deleteFood(id);
    setFoods((f) => f.filter((x) => x.id !== id));
    onDataChanged();
    toast.success("Đã xoá");
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <div className="text-xs font-semibold">Thêm thức ăn mới</div>
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Tên" className="h-8 text-xs" />
          <Input value={form.emoji} onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))} placeholder="Emoji" className="h-8 text-xs" />
          <Input value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="Giá (xu)" className="h-8 text-xs" type="number" />
          <Input value={form.fullness} onChange={(e) => setForm((f) => ({ ...f, fullness: e.target.value }))} placeholder="No bụng (%)" className="h-8 text-xs" type="number" />
        </div>
        <Button size="sm" onClick={add}><Plus className="h-3 w-3" /> Thêm</Button>
      </Card>
      {foods.map((f) => (
        <div key={f.id} className="rounded-xl border bg-card px-3 py-2">
          {editId === f.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input value={editForm.name} onChange={(e) => setEditForm((ef) => ({ ...ef, name: e.target.value }))} placeholder="Tên" className="h-8 text-xs" />
                <Input value={editForm.emoji} onChange={(e) => setEditForm((ef) => ({ ...ef, emoji: e.target.value }))} placeholder="Emoji" className="h-8 text-xs" />
                <Input value={editForm.price} onChange={(e) => setEditForm((ef) => ({ ...ef, price: e.target.value }))} placeholder="Giá (xu)" className="h-8 text-xs" type="number" />
                <Input value={editForm.fullness} onChange={(e) => setEditForm((ef) => ({ ...ef, fullness: e.target.value }))} placeholder="No bụng (%)" className="h-8 text-xs" type="number" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>Lưu</Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Huỷ</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{f.emoji}</span>
                <div>
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="text-[11px] text-muted-foreground">{f.price} xu · no {f.fullness}%</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(f)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(f.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminTiers({ onDataChanged }: { onDataChanged: () => void }) {
  const [tiers, setTiers] = useState<GardenExchangeTier[]>([]);
  const [form, setForm] = useState({ min_coins: "500", exchange_coins: "500", money_amount: "50000", type: "instant" as "instant" | "reserve" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ min_coins: "", exchange_coins: "", money_amount: "", type: "instant" as "instant" | "reserve" });

  useEffect(() => { fetchExchangeTiers().then(setTiers).catch(() => {}); }, []);

  const add = async () => {
    await createExchangeTier({
      min_coins: Number(form.min_coins) || 500,
      exchange_coins: Number(form.exchange_coins) || 500,
      money_amount: Number(form.money_amount) || 50000,
      type: form.type,
      active: true,
    });
    setForm({ min_coins: "500", exchange_coins: "500", money_amount: "50000", type: "instant" });
    const updated = await fetchExchangeTiers();
    setTiers(updated);
    onDataChanged();
    toast.success("Đã thêm mốc");
  };

  const startEdit = (t: GardenExchangeTier) => {
    setEditId(t.id);
    setEditForm({ min_coins: String(t.min_coins), exchange_coins: String(t.exchange_coins), money_amount: String(t.money_amount), type: t.type });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await updateExchangeTier(editId, { min_coins: Number(editForm.min_coins) || 500, exchange_coins: Number(editForm.exchange_coins) || 500, money_amount: Number(editForm.money_amount) || 50000, type: editForm.type });
    setEditId(null);
    const updated = await fetchExchangeTiers();
    setTiers(updated);
    onDataChanged();
    toast.success("Đã cập nhật");
  };

  const remove = async (id: string) => {
    await deleteExchangeTier(id);
    setTiers((t) => t.filter((x) => x.id !== id));
    onDataChanged();
    toast.success("Đã xoá");
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <div className="text-xs font-semibold">Thêm mốc quy đổi</div>
        <div className="grid grid-cols-2 gap-2">
          <Input value={form.min_coins} onChange={(e) => setForm((f) => ({ ...f, min_coins: e.target.value }))} placeholder="Xu tối thiểu" className="h-8 text-xs" type="number" />
          <Input value={form.exchange_coins} onChange={(e) => setForm((f) => ({ ...f, exchange_coins: e.target.value }))} placeholder="Xu tiêu" className="h-8 text-xs" type="number" />
          <Input value={form.money_amount} onChange={(e) => setForm((f) => ({ ...f, money_amount: e.target.value }))} placeholder="Tiền (VND)" className="h-8 text-xs" type="number" />
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "instant" | "reserve" }))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="instant">Nhận ngay</option>
            <option value="reserve">Tích trữ</option>
          </select>
        </div>
        <Button size="sm" onClick={add}><Plus className="h-3 w-3" /> Thêm mốc</Button>
      </Card>
      {tiers.map((t) => (
        <div key={t.id} className="rounded-xl border bg-card px-3 py-2">
          {editId === t.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input value={editForm.min_coins} onChange={(e) => setEditForm((ef) => ({ ...ef, min_coins: e.target.value }))} placeholder="Xu tối thiểu" className="h-8 text-xs" type="number" />
                <Input value={editForm.exchange_coins} onChange={(e) => setEditForm((ef) => ({ ...ef, exchange_coins: e.target.value }))} placeholder="Xu tiêu" className="h-8 text-xs" type="number" />
                <Input value={editForm.money_amount} onChange={(e) => setEditForm((ef) => ({ ...ef, money_amount: e.target.value }))} placeholder="Tiền (VND)" className="h-8 text-xs" type="number" />
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, type: e.target.value as "instant" | "reserve" }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="instant">Nhận ngay</option>
                  <option value="reserve">Tích trữ</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>Lưu</Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Huỷ</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t.exchange_coins} xu → {t.money_amount.toLocaleString("vi-VN")} đ</div>
                <div className="text-[11px] text-muted-foreground">Tối thiểu {t.min_coins} xu · {t.type === "instant" ? "Nhận ngay" : "Tích trữ"}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(t)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => remove(t.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminBalances() {
  const [balances, setBalances] = useState<(GardenBalance & { expand?: { user?: { full_name?: string; username?: string; uid?: string } } })[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ coins: "", reserve_balance: "" });
  const [search, setSearch] = useState("");

  useEffect(() => { fetchAllBalances().then(setBalances).catch(() => {}); }, []);

  const filtered = balances.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = (b.expand?.user?.full_name || "").toLowerCase();
    const username = (b.expand?.user?.username || "").toLowerCase();
    const uid = (b.expand?.user?.uid || "").toLowerCase();
    return name.includes(q) || username.includes(q) || uid.includes(q);
  });

  const startEdit = (b: GardenBalance) => {
    setEditId(b.id);
    setEditForm({ coins: String(b.coins), reserve_balance: String(b.reserve_balance) });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await updateBalance(editId, { coins: Number(editForm.coins) || 0, reserve_balance: Number(editForm.reserve_balance) || 0 });
    setEditId(null);
    const updated = await fetchAllBalances();
    setBalances(updated);
    toast.success("Đã cập nhật xu");
  };

  const doReset = async (b: GardenBalance) => {
    await resetReserveBalance(b.id);
    toast.success("Đã reset tiền dự trữ");
    const updated = await fetchAllBalances();
    setBalances(updated);
  };

  const getUserLabel = (b: typeof balances[number]) => {
    const user = b.expand?.user;
    const uid = user?.uid;
    const name = user?.full_name || "User";
    const sub = uid || user?.username || "";
    return { name, sub };
  };

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo tên, tài khoản hoặc mã UID..."
        className="h-9 text-xs"
      />
      {filtered.length === 0 && <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">Không tìm thấy.</div>}
      {filtered.map((b) => {
        const { name, sub } = getUserLabel(b);
        return (
        <div key={b.id} className="rounded-xl border bg-card px-3 py-2">
          {editId === b.id ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">{name} {sub && <span className="text-[10px] font-normal text-muted-foreground">({sub})</span>}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Xu</div>
                  <Input value={editForm.coins} onChange={(e) => setEditForm((ef) => ({ ...ef, coins: e.target.value }))} className="h-8 text-xs" type="number" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">Dự trữ (đ)</div>
                  <Input value={editForm.reserve_balance} onChange={(e) => setEditForm((ef) => ({ ...ef, reserve_balance: e.target.value }))} className="h-8 text-xs" type="number" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>Lưu</Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Huỷ</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{name} {sub && <span className="text-[10px] font-normal text-muted-foreground">({sub})</span>}</div>
                <div className="text-[11px] text-muted-foreground">
                  {b.coins} xu · Dự trữ: {b.reserve_balance.toLocaleString("vi-VN")} đ
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(b)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                {b.reserve_balance > 0 && (
                  <Button size="sm" variant="outline" onClick={() => doReset(b)} className="h-7 text-xs">
                    <Wallet className="h-3 w-3" /> Reset
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function FloatingHearts() {
  const emojis = ["❤️", "💕", "💖", "✨", "💗", "🩷", "😍", "🥰", "😻", "🎉"];
  const [emoji] = useState(() => emojis[Math.floor(Math.random() * emojis.length)]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      <span className="absolute left-1/2 -translate-x-1/2 animate-float-up text-2xl">
        {emoji}
      </span>
    </div>
  );
}
