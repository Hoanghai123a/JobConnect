import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
  PLOT_MAX,
  flowerById,
  petById,
  plotUnlockCost,
  loadGarden,
  saveGarden,
  growthProgress,
  isReady,
  readyInMinutes,
  hunger,
  happiness,
  petMood,
  applyFood,
  applyPlay,
  normalizeFullness,
  type GardenState,
  type Flower,
  type Plot,
  type PetState,
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
  fetchGardenByUsername,
  fetchGardenVisitSaves,
  saveGardenVisit,
  deleteGardenVisitSave,
  stealCoins,
  type GardenFood,
  type GardenExchangeTier,
  type GardenBalance,
  type GardenExchangeRequest,
  type GardenVisitSave,
} from "@/lib/garden-server";
import {
  Coins,
  Sparkles,
  Drumstick,
  Hand,
  Store,
  Leaf,
  ArrowRightLeft,
  Settings2,
  Check,
  X,
  Plus,
  Trash2,
  Wallet,
  Pencil,
  DoorOpen,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/garden")({
  component: GardenPage,
});

type MainTab = "garden" | "food" | "exchange" | "admin";
type GardenOwner = { id?: string; full_name?: string; username?: string };
type VisitedGarden = GardenBalance & { expand?: { user?: GardenOwner } };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
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
  const [harvestAnim, setHarvestAnim] = useState<{
    emoji: string;
    plotIndex: number;
    key: number;
  } | null>(null);
  const [stealAnim, setStealAnim] = useState<{
    emoji: string;
    plotIndex: number;
    key: number;
  } | null>(null);
  const [renamingPet, setRenamingPet] = useState(false);
  const [petNameInput, setPetNameInput] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("garden");
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitUsername, setVisitUsername] = useState("");
  const [visitSaves, setVisitSaves] = useState<GardenVisitSave[]>([]);
  const [visitedGarden, setVisitedGarden] = useState<VisitedGarden | null>(null);
  const [gardenDetailOpen, setGardenDetailOpen] = useState(false);
  const [visiting, setVisiting] = useState(false);
  const [stealing, setStealing] = useState(false);
  const [curtainPhase, setCurtainPhase] = useState<"idle" | "close" | "open">("idle");

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

      // Hydrate local state từ server (PB là source of truth cho plots, pet, coins)
      if (bal) {
        setState((prev) => {
          const local = prev ?? loadGarden(user.id);
          const serverPlots: Plot[] =
            Array.isArray(bal.plots) && bal.plots.length > 0
              ? (bal.plots as Plot[]).map((p: any) => ({
                  flowerId: p?.flowerId ?? null,
                  plantedAt: typeof p?.plantedAt === "number" ? p.plantedAt : null,
                  stolenAmount: p?.stolenAmount,
                }))
              : local.plots;
          const serverPet: PetState | null =
            bal.pet && typeof (bal.pet as any).id === "string"
              ? (bal.pet as unknown as PetState)
              : null;
          const unlockedPlots = Math.max(PLOT_COUNT, serverPlots.length, local.unlockedPlots);
          while (serverPlots.length < unlockedPlots)
            serverPlots.push({ flowerId: null, plantedAt: null });

          const merged: GardenState = {
            coins: bal.coins ?? local.coins,
            plots: serverPlots,
            unlockedPlots,
            pet: serverPet ?? local.pet,
            ownedPets: (bal.ownedPets as string[] | undefined)?.length
              ? (bal.ownedPets as string[])
              : local.ownedPets,
            roamingEnabled: bal.roamingEnabled ?? local.roamingEnabled,
            totalHarvested: bal.totalHarvested ?? local.totalHarvested,
          };
          saveGarden(user.id, merged);
          return merged;
        });
      }
    } catch {
      setBalance(null);
      setFoods([]);
      setTiers([]);
    }
  }, [user?.id]);

  const loadVisitSaves = useCallback(async () => {
    if (!user?.id) return;
    try {
      const saved = await fetchGardenVisitSaves(user.id);
      setVisitSaves(saved);
    } catch {
      setVisitSaves([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      setState(loadGarden(user.id));
      loadServerData();
      loadVisitSaves();
    }
  }, [user?.id, loadServerData, loadVisitSaves]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  // Thông báo bị chộm khi mở vườn
  useEffect(() => {
    if (!balance?.lastStolenAt || !user?.id) return;
    const seenKey = `garden:lastStolenSeen:${user.id}`;
    const lastSeen = Number(localStorage.getItem(seenKey) ?? 0);
    if (balance.lastStolenAt > lastSeen) {
      toast.warning("Vườn của bạn vừa bị ăn chộm! 🌿");
      localStorage.setItem(seenKey, String(balance.lastStolenAt));
    }
  }, [balance?.lastStolenAt, user?.id]);

  const coins = balance?.coins ?? state?.coins ?? 0;

  const commit = useCallback(
    (next: GardenState) => {
      setState(next);
      saveGarden(user?.id, next);
      if (balance) {
        updateBalance(balance.id, {
          coins: next.coins,
          plots: next.plots as any,
          pet: next.pet as any,
          ownedPets: next.ownedPets as any,
          roamingEnabled: next.roamingEnabled,
          totalHarvested: next.totalHarvested,
        })
          .then((updated) => setBalance(updated))
          .catch(() => {});
      }
    },
    [user?.id, balance],
  );

  const now = Date.now();

  if (isStaff) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Tính năng này không khả dụng cho tài khoản staff.
      </div>
    );
  }

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
  const petFoods = foods.filter(
    (f) => !f.petType || f.petType === "all" || f.petType === state.pet.id,
  );
  const gardenPlots = state.plots.slice(0, state.unlockedPlots);
  const plantedPlots = gardenPlots.filter((plot) => Boolean(plot?.flowerId)).length;
  const readyPlots = gardenPlots.filter(
    (plot) => Boolean(plot?.flowerId) && isReady(plot, now),
  ).length;

  const plantSeed = (plotIndex: number, flower: Flower) => {
    if (coins < flower.seedCost) {
      toast.error("Không đủ xu để mua hạt giống");
      return;
    }
    const plots = state.plots.slice();
    plots[plotIndex] = { flowerId: flower.id, plantedAt: Date.now() };
    const newCoins = coins - flower.seedCost;
    commit({ ...state, coins: newCoins, plots });
    setSeedPickerFor(null);
    toast.success(`Đã trồng ${flower.name}`);
  };

  const harvest = (plotIndex: number) => {
    const plot = state.plots[plotIndex];
    const flower = flowerById(plot.flowerId);
    if (!flower || !isReady(plot, now)) return;
    const plots = state.plots.slice();
    const stolenAmount = plot.stolenAmount ?? 0;
    const actualReward = Math.max(0, flower.reward - stolenAmount);
    plots[plotIndex] = { flowerId: null, plantedAt: null };
    const newCoins = coins + actualReward;
    commit({ ...state, coins: newCoins, plots, totalHarvested: state.totalHarvested + 1 });
    setHarvestAnim({ emoji: flower.emoji, plotIndex, key: Date.now() });
    setTimeout(() => setHarvestAnim(null), 1200);
    toast.success(
      `Thu hoạch ${flower.name} +${actualReward} xu${stolenAmount > 0 ? ` (bị chộm ${stolenAmount})` : ""}`,
    );
  };

  const feedPet = () => {
    commit({ ...state, pet: { ...state.pet, lastFedAt: Date.now() } });
    toast.success(`${state.pet.name} đã được ăn no!`);
  };

  const buyFood = (food: GardenFood) => {
    if (coins < food.price) {
      toast.error("Không đủ xu");
      return;
    }
    const fullness = normalizeFullness(food.fullness);
    if (fullness <= 0) {
      toast.error("Thức ăn này chưa có điểm no hợp lệ");
      return;
    }
    const newCoins = coins - food.price;
    const newPet = applyFood(state.pet, fullness, Date.now());
    commit({ ...state, coins: newCoins, pet: newPet });
    toast.success(`${state.pet.name} ăn ${food.name}, no thêm ${fullness}%!`);
  };

  const playPet = () => {
    const { pet: newPet, addedPct } = applyPlay(state.pet);
    commit({ ...state, pet: newPet });
    setPlayHearts(true);
    setTimeout(() => setPlayHearts(false), 1500);
    toast.success(`${state.pet.name} vui hơn +${addedPct}%`);
  };

  const unlockPlot = () => {
    const nextCount = state.unlockedPlots + 1;
    if (nextCount > PLOT_MAX) return;
    const cost = plotUnlockCost(state.unlockedPlots);
    if (cost === null) return;
    if (coins < cost) {
      toast.error("Không đủ xu để mở ô đất");
      return;
    }
    const newCoins = coins - cost;
    const newPlots = [...state.plots, { flowerId: null, plantedAt: null }];
    commit({ ...state, coins: newCoins, plots: newPlots, unlockedPlots: nextCount });
    toast.success(`Đã mở ô đất thứ ${nextCount}!`);
  };

  const buyPet = (petId: string, cost: number) => {
    if (state.ownedPets.includes(petId)) {
      commit({ ...state, pet: { ...state.pet, id: petId } });
      toast.success("Đã chọn thú cưng");
      return;
    }
    if (coins < cost) {
      toast.error("Không đủ xu");
      return;
    }
    const newCoins = coins - cost;
    commit({
      ...state,
      coins: newCoins,
      ownedPets: [...state.ownedPets, petId],
      pet: { ...state.pet, id: petId },
    });
    toast.success("Mở khóa thú cưng mới!");
  };

  // ---- Visit / Steal ----

  const visitGarden = async (username: string) => {
    if (!username.trim()) return;
    // Nếu đã có vườn → curtain close → fetch → curtain open
    if (visitedGarden) {
      setCurtainPhase("close");
      await new Promise((r) => setTimeout(r, 350));
      setVisitedGarden(null);
    }
    setVisiting(true);
    try {
      const garden = await fetchGardenByUsername(username.trim());
      if (!garden) {
        toast.error("Không tìm thấy vườn");
        setCurtainPhase("idle");
        return;
      }
      if (garden.user === user?.id) {
        toast.error("Đây là vườn của bạn!");
        setCurtainPhase("idle");
        return;
      }
      setVisitedGarden(garden);
      setGardenDetailOpen(true);
      if (user?.id) {
        try {
          await saveGardenVisit(user.id, garden);
          await loadVisitSaves();
        } catch {
          toast.warning("Chưa lưu được vườn này vào danh sách đã lưu");
        }
      }
      setCurtainPhase("open");
      setTimeout(() => setCurtainPhase("idle"), 400);
    } catch {
      toast.error("Không thể tải vườn");
      setCurtainPhase("idle");
    } finally {
      setVisiting(false);
    }
  };

  const removeVisitSave = async (saveId: string) => {
    try {
      await deleteGardenVisitSave(saveId);
      setVisitSaves((items) => items.filter((item) => item.id !== saveId));
      toast.success("Đã xoá khỏi danh sách đã lưu");
    } catch {
      toast.error("Không thể xoá mục đã lưu");
    }
  };

  const stealFrom = async (
    victim: VisitedGarden,
    plotIndex: number,
    flowerReward: number,
    flowerEmoji?: string,
  ) => {
    if (!balance) return;
    setStealing(true);
    try {
      const { newAttackerCoins, stolen } = await stealCoins({
        attackerBalanceId: balance.id,
        attackerCurrentCoins: coins,
        victimBalanceId: victim.id,
        plotIndex,
        flowerReward,
      });
      setBalance({ ...balance, coins: newAttackerCoins });
      if (flowerEmoji) {
        setStealAnim({ emoji: flowerEmoji, plotIndex, key: Date.now() });
        setTimeout(() => setStealAnim(null), 1200);
      }
      const refreshed = await fetchGardenByUsername(visitUsername.trim());
      if (refreshed) setVisitedGarden(refreshed);
      const victimName =
        victim.expand?.user?.full_name || victim.expand?.user?.username || "người dùng này";
      toast.success(`Chộm thành công! +${stolen} xu từ vườn của ${victimName} 🌿`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Chộm thất bại"));
    } finally {
      setStealing(false);
    }
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
              <TabsTrigger value="garden" className="rounded-lg text-xs">
                Vườn
              </TabsTrigger>
              <TabsTrigger value="admin" className="rounded-lg text-xs">
                Quản lý
              </TabsTrigger>
            </TabsList>
          ) : null}

          <TabsContent value="garden" className="mt-0 space-y-4">
            <div className="worker-game-layout">
              <aside className="worker-game-desktop-rail" aria-label="Chỉ số khu vườn">
                <div className="worker-game-rail-title">Chỉ số khu vườn</div>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">Xu hiện tại</div>
                  <div className="worker-game-stat-value">{coins}</div>
                </Card>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">Ô đất</div>
                  <div className="worker-game-stat-value">
                    {state.unlockedPlots}/{PLOT_MAX}
                  </div>
                </Card>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">Đang trồng</div>
                  <div className="worker-game-stat-value">{plantedPlots}</div>
                </Card>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">Sẵn thu hoạch</div>
                  <div className="worker-game-stat-value">{readyPlots}</div>
                </Card>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">Tổng thu hoạch</div>
                  <div className="worker-game-stat-value">{state.totalHarvested}</div>
                </Card>
                <Card className="worker-game-stat">
                  <div className="worker-game-stat-label">No bụng thú cưng</div>
                  <div className="worker-game-stat-value">{hungerPct}%</div>
                </Card>
              </aside>
              <div className="worker-game-main space-y-4">
                {/* Khu thú cưng */}
                <section className="gradient-hero relative overflow-hidden rounded-3xl p-4 text-white shadow-soft">
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                  <div className="relative flex items-center gap-4">
                    <div
                      className={cn(
                        "relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/20 backdrop-blur",
                        playHearts && "animate-wiggle",
                      )}
                    >
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
                        {renamingPet ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = petNameInput.trim();
                              if (trimmed) {
                                const newPet = { ...state.pet, name: trimmed };
                                commit({ ...state, pet: newPet });
                                if (balance?.id)
                                  updateBalance(balance.id, { pet: newPet }).catch(() => {});
                              }
                              setRenamingPet(false);
                            }}
                            className="flex items-center gap-1"
                          >
                            <input
                              autoFocus
                              value={petNameInput}
                              onChange={(e) => setPetNameInput(e.target.value)}
                              maxLength={20}
                              className="w-28 rounded-lg bg-white/30 px-2 py-0.5 text-sm font-semibold text-white placeholder-white/60 outline-none ring-2 ring-white/60"
                              onBlur={() => {
                                const trimmed = petNameInput.trim();
                                if (trimmed) {
                                  const newPet = { ...state.pet, name: trimmed };
                                  commit({ ...state, pet: newPet });
                                  if (balance?.id)
                                    updateBalance(balance.id, { pet: newPet }).catch(() => {});
                                }
                                setRenamingPet(false);
                              }}
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPetNameInput(state.pet.name);
                              setRenamingPet(true);
                            }}
                            className="flex items-center gap-1 text-lg font-semibold hover:underline"
                          >
                            {state.pet.name}
                            <Pencil className="h-3.5 w-3.5 opacity-60" />
                          </button>
                        )}
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide backdrop-blur">
                          {pet.name}
                        </span>
                      </div>
                      <Meter
                        label="No bụng"
                        value={hungerPct}
                        icon={<Drumstick className="h-3 w-3" />}
                      />
                      <Meter
                        label="Vui vẻ"
                        value={happyPct}
                        icon={<Sparkles className="h-3 w-3" />}
                      />
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
                    <div>
                      <div className="text-sm font-semibold tracking-tight">Luống hoa</div>
                      <div className="text-[11px] text-muted-foreground">
                        {state.unlockedPlots} ô · Thu hoạch: {state.totalHarvested}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: state.unlockedPlots }).map((_, i) => {
                      const plot = state.plots[i];
                      const flower = flowerById(plot?.flowerId ?? null);
                      const ready = isReady(plot ?? { flowerId: null, plantedAt: null }, now);
                      const progress = growthProgress(
                        plot ?? { flowerId: null, plantedAt: null },
                        now,
                      );
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            if (!flower) setSeedPickerFor(i);
                            else if (ready) harvest(i);
                          }}
                          className={cn(
                            "relative flex aspect-square flex-col items-center justify-center gap-0 rounded-lg border border-dashed text-center transition active:scale-95",
                            flower
                              ? ready
                                ? "border-amber-400 bg-amber-50"
                                : "border-emerald-200 bg-emerald-50"
                              : "border-border bg-muted/40",
                          )}
                        >
                          {harvestAnim?.plotIndex === i && (
                            <span
                              key={harvestAnim.key}
                              className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 text-xl animate-float-up"
                            >
                              {harvestAnim.emoji}
                            </span>
                          )}
                          {!flower ? (
                            <span className="text-lg text-muted-foreground/50">+</span>
                          ) : (
                            <>
                              <span
                                className={cn(
                                  "text-base leading-none inline-block",
                                  ready && "animate-bounce",
                                )}
                                style={{
                                  transform: `scale(${ready ? 1 : (0.35 + progress * 0.65).toFixed(2)})`,
                                  transformOrigin: "center bottom",
                                  transition: "transform 0.4s ease",
                                }}
                              >
                                {flower.emoji}
                              </span>
                              <span className="text-[9px] font-medium text-foreground/80 leading-tight truncate w-full text-center px-0.5">
                                {flower.name}
                              </span>
                              {ready ? (
                                <span className="text-[9px] font-semibold text-amber-600 leading-tight">
                                  Thu hoạch
                                </span>
                              ) : (
                                <>
                                  <div className="h-1 w-7 overflow-hidden rounded-full bg-emerald-200">
                                    <div
                                      className="h-full bg-emerald-500 transition-all"
                                      style={{ width: `${Math.round(progress * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-muted-foreground leading-tight">
                                    {readyInMinutes(plot, now) >= 60
                                      ? `${Math.floor(readyInMinutes(plot, now) / 60)}h${readyInMinutes(plot, now) % 60}p`
                                      : `${readyInMinutes(plot, now)}p`}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}

                    {/* Nút mở ô tiếp theo */}
                    {state.unlockedPlots < PLOT_MAX &&
                      (() => {
                        const cost = plotUnlockCost(state.unlockedPlots);
                        const canAfford = coins >= (cost ?? Infinity);
                        return (
                          <button
                            onClick={unlockPlot}
                            className={cn(
                              "flex aspect-square flex-col items-center justify-center gap-px rounded-lg border border-dashed text-center transition active:scale-95",
                              canAfford
                                ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                                : "border-border bg-muted/20 opacity-60",
                            )}
                          >
                            <span className="text-sm text-primary leading-none">🔒</span>
                            <span className="text-[8px] font-semibold text-primary leading-none">
                              Mở ô
                            </span>
                            <span className="flex items-center gap-0.5 text-[8px] font-medium text-amber-700 leading-none">
                              <Coins className="h-2 w-2 shrink-0" />
                              {cost}
                            </span>
                          </button>
                        );
                      })()}
                  </div>
                  <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    Chạm ô trống để trồng hoa · chạm hoa đã nở để thu hoạch lấy xu
                  </p>
                </section>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="food" className="mt-0 space-y-3">
            <FoodShopTab foods={petFoods} coins={coins} petName={state.pet.name} onBuy={buyFood} />
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
            <DialogDescription>
              Hoa sẽ nở sau một khoảng thời gian, ghé lại thu hoạch nhé.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {FLOWERS.map((f) => {
              const affordable = coins >= f.seedCost;
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
            {petFoods.length === 0 ? (
              <div className="rounded-xl border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
                Chưa có thức ăn nào phù hợp cho {state.pet.name}.
              </div>
            ) : (
              petFoods.map((f) => {
                const affordable = coins >= f.price;
                return (
                  <button
                    key={f.id}
                    disabled={!affordable}
                    onClick={() => {
                      buyFood(f);
                      setFeedOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.98]",
                      affordable ? "border-border bg-card" : "border-border bg-muted/40 opacity-60",
                    )}
                  >
                    <span className="text-2xl">{f.emoji || "🍖"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">No thêm {f.fullness}%</div>
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
              onSuccess={() => {
                loadServerData();
                setExchangeOpen(false);
              }}
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

      {/* FAB — Ghé vườn hàng xóm */}
      <button
        type="button"
        onClick={() => setVisitOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-20 flex items-center gap-1.5 rounded-full bg-card shadow-soft border border-border/60 px-3 py-2 transition active:scale-95"
        aria-label="Ghé vườn hàng xóm"
      >
        <DoorOpen className="h-4 w-4 text-primary shrink-0" />
        <span className="text-[11px] font-medium text-primary">Ghé thăm</span>
      </button>

      {/* Dialog ghé vườn hàng xóm */}
      <Dialog
        open={visitOpen}
        onOpenChange={(o) => {
          setVisitOpen(o);
          if (!o) {
            setVisitedGarden(null);
            setGardenDetailOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" /> Ghé vườn hàng xóm
            </DialogTitle>
            <DialogDescription>
              Nhập username để ghé thăm vườn. Hoa đã chín mới có thể ăn chộm.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Nhập username..."
                value={visitUsername}
                onChange={(e) => setVisitUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && visitGarden(visitUsername)}
                className="flex-1"
              />
              <Button
                onClick={() => visitGarden(visitUsername)}
                disabled={visiting || !visitUsername.trim()}
              >
                {visiting ? "..." : "Vào"}
              </Button>
            </div>

            <div className="rounded-2xl border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">Đã lưu</div>
                <div className="text-[10px] text-muted-foreground">{visitSaves.length} vườn</div>
              </div>
              {visitSaves.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  Chưa có vườn đã lưu. Ghé thăm thành công sẽ tự lưu vào danh sách này.
                </div>
              ) : (
                <div className="space-y-2">
                  {visitSaves.map((item) => {
                    const label =
                      item.target_name ||
                      item.expand?.target_user?.full_name ||
                      item.target_username ||
                      item.expand?.target_user?.username ||
                      "Vườn đã lưu";
                    const username =
                      item.target_username || item.expand?.target_user?.username || "";
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-2 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setVisitUsername(username);
                            visitGarden(username);
                          }}
                          disabled={!username || visiting}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-sm font-medium">{label}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            @{username || "chưa có username"}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeVisitSave(item.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive active:scale-95"
                          aria-label="Xoá khỏi danh sách đã lưu"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={gardenDetailOpen && Boolean(visitedGarden)} onOpenChange={setGardenDetailOpen}>
        <DialogContent className="max-h-[86vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" /> Vườn của{" "}
              {visitedGarden?.expand?.user?.full_name ||
                visitedGarden?.expand?.user?.username ||
                "người dùng"}
            </DialogTitle>
            <DialogDescription>Xem ô đất, tình trạng hoa và thời gian thu hoạch.</DialogDescription>
          </DialogHeader>
          {visitedGarden && (
            <GardenVisitPreview
              garden={visitedGarden}
              curtainPhase={curtainPhase}
              stealing={stealing}
              stealAnim={stealAnim}
              onSteal={stealFrom}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GardenVisitPreview({
  garden,
  curtainPhase,
  stealing,
  stealAnim,
  onSteal,
}: {
  garden: VisitedGarden;
  curtainPhase: "idle" | "close" | "open";
  stealing: boolean;
  stealAnim: { emoji: string; plotIndex: number; key: number } | null;
  onSteal: (
    victim: VisitedGarden,
    plotIndex: number,
    flowerReward: number,
    flowerEmoji?: string,
  ) => void;
}) {
  const now = Date.now();
  const victimCoins = garden.coins ?? 0;
  const serverPlots: { flowerId: string | null; plantedAt: number | null }[] = Array.isArray(
    garden.plots,
  )
    ? (garden.plots as { flowerId: string | null; plantedAt: number | null }[])
    : [];
  const readyPlots = serverPlots
    .map((plot, index) => ({ plot, index }))
    .filter(({ plot }) => {
      if (!plot?.flowerId || !plot?.plantedAt) return false;
      const flower = flowerById(plot.flowerId);
      if (!flower) return false;
      return now - plot.plantedAt >= flower.growMinutes * 60 * 1000;
    });

  const plantedCount = serverPlots.filter((p) => p.flowerId).length;
  const plotCount = serverPlots.length || 6;

  return (
    <div
      className={cn(
        "space-y-3",
        curtainPhase === "close" && "animate-curtain-close",
        curtainPhase === "open" && "animate-curtain-open",
      )}
    >
      <section className="rounded-3xl bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight">Luống hoa</div>
            <div className="text-[11px] text-muted-foreground">
              {plotCount} ô · {plantedCount} đang trồng · {victimCoins} xu
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
              readyPlots.length > 0
                ? "bg-amber-100 text-amber-700"
                : "bg-muted text-muted-foreground",
            )}
          >
            {readyPlots.length > 0 ? "Có hoa chín" : "Chưa chín"}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: plotCount }).map((_, idx) => {
            const plot = serverPlots[idx];
            const flower = flowerById(plot?.flowerId ?? null);
            if (!flower) {
              return (
                <div
                  key={idx}
                  className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-lg text-muted-foreground/50"
                >
                  +
                </div>
              );
            }
            const elapsed = plot.plantedAt ? now - plot.plantedAt : 0;
            const total = flower.growMinutes * 60 * 1000;
            const progress = Math.max(0, Math.min(1, elapsed / total));
            const ready = progress >= 1;
            const alreadyStolen = !!(plot as { stolenAmount?: number }).stolenAmount;
            const canSteal = ready && !stealing && !alreadyStolen;
            const remainMinutes = Math.max(0, Math.ceil((total - elapsed) / 60000));
            return (
              <button
                key={idx}
                disabled={!canSteal}
                onClick={() => canSteal && onSteal(garden, idx, flower.reward, flower.emoji)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center gap-0 rounded-lg border border-dashed text-center transition active:scale-95",
                  ready
                    ? canSteal
                      ? "border-amber-400 bg-amber-50 hover:bg-amber-100"
                      : "border-amber-400 bg-amber-50 opacity-60"
                    : "border-emerald-200 bg-emerald-50",
                )}
              >
                {stealAnim?.plotIndex === idx && (
                  <span
                    key={stealAnim.key}
                    className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 text-xl animate-float-up"
                  >
                    {stealAnim.emoji}
                  </span>
                )}
                <span
                  className={cn("inline-block text-base leading-none", ready && "animate-bounce")}
                  style={{
                    transform: `scale(${ready ? 1 : (0.35 + progress * 0.65).toFixed(2)})`,
                    transformOrigin: "center bottom",
                    transition: "transform 0.4s ease",
                  }}
                >
                  {flower.emoji}
                </span>
                <span className="w-full truncate px-0.5 text-center text-[9px] font-medium leading-tight text-foreground/80">
                  {flower.name}
                </span>
                {ready ? (
                  <span
                    className={cn(
                      "text-[9px] font-semibold leading-tight",
                      alreadyStolen ? "text-muted-foreground" : "text-amber-600",
                    )}
                  >
                    {alreadyStolen ? "Đã chộm" : "Chộm"}
                  </span>
                ) : (
                  <>
                    <div className="h-1 w-7 overflow-hidden rounded-full bg-emerald-200">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] leading-tight text-muted-foreground">
                      {remainMinutes >= 60
                        ? `${Math.floor(remainMinutes / 60)}h${remainMinutes % 60}p`
                        : `${remainMinutes}p`}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {serverPlots.length === 0 && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Vườn này chưa trồng gì cả
          </p>
        )}

        {readyPlots.length > 0 && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Chạm hoa đã chín để chộm
          </p>
        )}
      </section>
    </div>
  );
}

function Meter({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[10px] text-white/80">
        {icon} {label} {value}%
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

function FoodShopTab({
  foods,
  coins,
  petName,
  onBuy,
}: {
  foods: GardenFood[];
  coins: number;
  petName: string;
  onBuy: (food: GardenFood) => void;
}) {
  if (foods.length === 0) {
    return (
      <EmptyState
        icon={Drumstick}
        title="Chưa có thức ăn"
        description="Admin chưa thêm thức ăn vào cửa hàng."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Mua thức ăn cho {petName}. Mỗi món cho no bụng khác nhau.
      </div>
      {foods.map((f) => {
        const canAfford = coins >= f.price;
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

function ExchangeTab({
  user,
  balance,
  tiers,
  onSuccess,
}: {
  user: {
    id: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_account_name?: string;
  };
  balance: GardenBalance | null;
  tiers: GardenExchangeTier[];
  onSuccess: () => void;
}) {
  const [requests, setRequests] = useState<GardenExchangeRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExchangeRequests(user.id)
      .then(setRequests)
      .catch(() => {});
  }, [user.id]);

  const coins = balance?.coins ?? 0;
  const reserve = balance?.reserve_balance ?? 0;
  const hasBank = Boolean(user.bank_name && user.bank_account_number);

  const doExchange = async (tier: GardenExchangeTier) => {
    if (!hasBank) {
      toast.error("Bạn cần cập nhật số tài khoản ngân hàng trước khi quy đổi");
      return;
    }
    if (coins < tier.min_coins) {
      toast.error(`Cần tối thiểu ${tier.min_coins} xu để gửi yêu cầu`);
      return;
    }
    if (coins < tier.exchange_coins) {
      toast.error("Không đủ xu để quy đổi");
      return;
    }
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
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Lỗi gửi yêu cầu"));
    } finally {
      setSubmitting(false);
    }
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
          <div className="text-sm font-semibold text-emerald-700">
            {reserve.toLocaleString("vi-VN")} đ
          </div>
        </div>
        {!hasBank && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            Cần cập nhật STK ngân hàng trong Tài khoản để quy đổi xu.
          </div>
        )}
      </Card>

      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Bảng quy đổi
      </div>
      {tiers.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="Chưa có mốc quy đổi"
          description="Admin chưa thiết lập bảng quy đổi."
        />
      ) : (
        tiers.map((t) => {
          const canExchange = coins >= t.min_coins && coins >= t.exchange_coins && hasBank;
          return (
            <Card key={t.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <div className="text-sm font-semibold">
                  {t.exchange_coins} xu → {t.money_amount.toLocaleString("vi-VN")} đ
                </div>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lịch sử yêu cầu
          </div>
          {requests.slice(0, 10).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {r.coins_spent} xu → {r.money_amount.toLocaleString("vi-VN")} đ
                </div>
                <StatusChip
                  tone={
                    r.status === "approved"
                      ? "success"
                      : r.status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {r.status === "approved"
                    ? "Đã duyệt"
                    : r.status === "rejected"
                      ? "Đã huỷ"
                      : r.status === "processing"
                        ? "Đang xử lý"
                        : "Chờ duyệt"}
                </StatusChip>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {r.type === "instant" ? "Nhận ngay" : "Tích trữ"} ·{" "}
                {r.created ? new Date(r.created).toLocaleDateString("vi-VN") : ""}
              </div>
              {r.admin_note && (
                <div className="mt-1 rounded-lg bg-muted/60 p-2 text-[11px]">{r.admin_note}</div>
              )}
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
              sub === k
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            {k === "requests"
              ? "Duyệt yêu cầu"
              : k === "foods"
                ? "Thức ăn"
                : k === "tiers"
                  ? "Bảng quy đổi"
                  : "Xu user"}
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

  useEffect(() => {
    fetchExchangeRequests()
      .then(setRequests)
      .catch(() => {});
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveExchangeRequest(id, note);
      toast.success("Đã duyệt");
      setActiveId(null);
      setNote("");
      const updated = await fetchExchangeRequests();
      setRequests(updated);
      onDataChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Lỗi duyệt"));
    }
  };

  const handleReject = async (id: string) => {
    if (!note.trim()) {
      toast.warning("Nhập lý do huỷ");
      return;
    }
    try {
      await rejectExchangeRequest(id, note);
      toast.success("Đã huỷ");
      setActiveId(null);
      setNote("");
      const updated = await fetchExchangeRequests();
      setRequests(updated);
      onDataChanged();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Lỗi huỷ"));
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const processing = requests.filter((r) => r.status === "processing");
  const resolved = requests.filter((r) => r.status !== "pending" && r.status !== "processing");

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold">Chờ duyệt ({pending.length})</div>
      {pending.length === 0 && (
        <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
          Không có yêu cầu nào.
        </div>
      )}
      {pending.map((r) => (
        <Card key={r.id} className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">{r.expand?.user?.full_name || "User"}</div>
            <StatusChip tone="warning">Chờ duyệt</StatusChip>
          </div>
          <div className="text-xs text-muted-foreground">
            {r.coins_spent} xu → {r.money_amount.toLocaleString("vi-VN")} đ ·{" "}
            {r.type === "instant" ? "Nhận ngay" : "Tích trữ"}
          </div>
          <div className="text-xs text-muted-foreground">
            STK: {r.bank_name} · {r.bank_account_number} · {r.bank_account_name}
          </div>
          {activeId === r.id ? (
            <div className="space-y-2">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Phản hồi (bắt buộc khi huỷ)"
                className="text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleApprove(r.id)}>
                  <Check className="h-3 w-3" /> Duyệt
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleReject(r.id)}>
                  <X className="h-3 w-3" /> Huỷ
                </Button>
                <Button size="sm" variant="outline" onClick={() => setActiveId(null)}>
                  Đóng
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setActiveId(r.id)}>
              Xử lý
            </Button>
          )}
        </Card>
      ))}
      {processing.length > 0 && (
        <>
          <div className="text-xs font-semibold">Đang xử lý ({processing.length})</div>
          {processing.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {r.expand?.user?.full_name || "User"} · {r.coins_spent} xu
                </div>
                <StatusChip tone="warning">Đang xử lý</StatusChip>
              </div>
              {r.admin_note && (
                <div className="mt-1 text-[11px] text-muted-foreground">{r.admin_note}</div>
              )}
            </Card>
          ))}
        </>
      )}
      {resolved.length > 0 && (
        <>
          <div className="text-xs font-semibold">Đã xử lý ({resolved.length})</div>
          {resolved.slice(0, 10).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {r.expand?.user?.full_name || "User"} · {r.coins_spent} xu
                </div>
                <StatusChip tone={r.status === "approved" ? "success" : "danger"}>
                  {r.status === "approved" ? "Đã duyệt" : "Đã huỷ"}
                </StatusChip>
              </div>
              {r.admin_note && (
                <div className="mt-1 text-[11px] text-muted-foreground">{r.admin_note}</div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function AdminFoods({ onDataChanged }: { onDataChanged: () => void }) {
  const [foods, setFoods] = useState<GardenFood[]>([]);
  const [form, setForm] = useState({
    name: "",
    emoji: "🍖",
    price: "10",
    fullness: "30",
    petType: "all",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    emoji: "",
    price: "",
    fullness: "",
    petType: "all",
  });

  useEffect(() => {
    fetchFoods()
      .then(setFoods)
      .catch(() => {});
  }, []);

  const add = async () => {
    if (!form.name.trim()) {
      toast.warning("Nhập tên thức ăn");
      return;
    }
    await createFood({
      name: form.name,
      emoji: form.emoji,
      price: Math.max(0, Number(form.price) || 10),
      fullness: normalizeFullness(form.fullness) || 30,
      petType: form.petType,
      active: true,
    });
    setForm({ name: "", emoji: "🍖", price: "10", fullness: "30", petType: "all" });
    const updated = await fetchFoods();
    setFoods(updated);
    onDataChanged();
    toast.success("Đã thêm");
  };

  const startEdit = (f: GardenFood) => {
    setEditId(f.id);
    setEditForm({
      name: f.name,
      emoji: f.emoji || "🍖",
      price: String(f.price),
      fullness: String(f.fullness),
      petType: f.petType || "all",
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await updateFood(editId, {
      name: editForm.name,
      emoji: editForm.emoji,
      price: Math.max(0, Number(editForm.price) || 10),
      fullness: normalizeFullness(editForm.fullness) || 30,
      petType: editForm.petType,
    });
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

  const petLabel = (pt?: string) =>
    !pt || pt === "all" ? "Tất cả" : (PETS.find((p) => p.id === pt)?.name ?? pt);

  const PetSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-xs"
    >
      <option value="all">Tất cả loài thú</option>
      {PETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.emoji} {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <div className="text-xs font-semibold">Thêm thức ăn mới</div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Tên"
            className="h-8 text-xs"
          />
          <Input
            value={form.emoji}
            onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
            placeholder="Emoji"
            className="h-8 text-xs"
          />
          <Input
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="Giá (xu)"
            className="h-8 text-xs"
            type="number"
          />
          <Input
            value={form.fullness}
            onChange={(e) => setForm((f) => ({ ...f, fullness: e.target.value }))}
            placeholder="No bụng (%)"
            className="h-8 text-xs"
            type="number"
            min={1}
            max={100}
            step={1}
          />
          <PetSelect
            value={form.petType}
            onChange={(v) => setForm((f) => ({ ...f, petType: v }))}
          />
        </div>
        <Button size="sm" onClick={add}>
          <Plus className="h-3 w-3" /> Thêm
        </Button>
      </Card>
      {foods.map((f) => (
        <div key={f.id} className="rounded-xl border bg-card px-3 py-2">
          {editId === f.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, name: e.target.value }))}
                  placeholder="Tên"
                  className="h-8 text-xs"
                />
                <Input
                  value={editForm.emoji}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, emoji: e.target.value }))}
                  placeholder="Emoji"
                  className="h-8 text-xs"
                />
                <Input
                  value={editForm.price}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, price: e.target.value }))}
                  placeholder="Giá (xu)"
                  className="h-8 text-xs"
                  type="number"
                />
                <Input
                  value={editForm.fullness}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, fullness: e.target.value }))}
                  placeholder="No bụng (%)"
                  className="h-8 text-xs"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                />
                <PetSelect
                  value={editForm.petType}
                  onChange={(v) => setEditForm((ef) => ({ ...ef, petType: v }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>
                  Lưu
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                  Huỷ
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">{f.emoji}</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{f.name}</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                      {petLabel(f.petType)}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {f.price} xu · no {f.fullness}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(f)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(f.id)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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
  const [form, setForm] = useState({
    min_coins: "500",
    exchange_coins: "500",
    money_amount: "50000",
    type: "instant" as "instant" | "reserve",
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    min_coins: "",
    exchange_coins: "",
    money_amount: "",
    type: "instant" as "instant" | "reserve",
  });

  useEffect(() => {
    fetchExchangeTiers()
      .then(setTiers)
      .catch(() => {});
  }, []);

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
    setEditForm({
      min_coins: String(t.min_coins),
      exchange_coins: String(t.exchange_coins),
      money_amount: String(t.money_amount),
      type: t.type,
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    await updateExchangeTier(editId, {
      min_coins: Number(editForm.min_coins) || 500,
      exchange_coins: Number(editForm.exchange_coins) || 500,
      money_amount: Number(editForm.money_amount) || 50000,
      type: editForm.type,
    });
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
          <Input
            value={form.min_coins}
            onChange={(e) => setForm((f) => ({ ...f, min_coins: e.target.value }))}
            placeholder="Xu tối thiểu"
            className="h-8 text-xs"
            type="number"
          />
          <Input
            value={form.exchange_coins}
            onChange={(e) => setForm((f) => ({ ...f, exchange_coins: e.target.value }))}
            placeholder="Xu tiêu"
            className="h-8 text-xs"
            type="number"
          />
          <Input
            value={form.money_amount}
            onChange={(e) => setForm((f) => ({ ...f, money_amount: e.target.value }))}
            placeholder="Tiền (VND)"
            className="h-8 text-xs"
            type="number"
          />
          <select
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value as "instant" | "reserve" }))
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="instant">Nhận ngay</option>
            <option value="reserve">Tích trữ</option>
          </select>
        </div>
        <Button size="sm" onClick={add}>
          <Plus className="h-3 w-3" /> Thêm mốc
        </Button>
      </Card>
      {tiers.map((t) => (
        <div key={t.id} className="rounded-xl border bg-card px-3 py-2">
          {editId === t.id ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editForm.min_coins}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, min_coins: e.target.value }))}
                  placeholder="Xu tối thiểu"
                  className="h-8 text-xs"
                  type="number"
                />
                <Input
                  value={editForm.exchange_coins}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, exchange_coins: e.target.value }))}
                  placeholder="Xu tiêu"
                  className="h-8 text-xs"
                  type="number"
                />
                <Input
                  value={editForm.money_amount}
                  onChange={(e) => setEditForm((ef) => ({ ...ef, money_amount: e.target.value }))}
                  placeholder="Tiền (VND)"
                  className="h-8 text-xs"
                  type="number"
                />
                <select
                  value={editForm.type}
                  onChange={(e) =>
                    setEditForm((ef) => ({ ...ef, type: e.target.value as "instant" | "reserve" }))
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="instant">Nhận ngay</option>
                  <option value="reserve">Tích trữ</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdit}>
                  Lưu
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                  Huỷ
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {t.exchange_coins} xu → {t.money_amount.toLocaleString("vi-VN")} đ
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Tối thiểu {t.min_coins} xu · {t.type === "instant" ? "Nhận ngay" : "Tích trữ"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(t)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(t.id)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminBalances() {
  const [balances, setBalances] = useState<
    (GardenBalance & {
      expand?: { user?: { full_name?: string; username?: string; uid?: string } };
    })[]
  >([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ coins: "", reserve_balance: "" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchAllBalances()
      .then(setBalances)
      .catch(() => {});
  }, []);

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
    await updateBalance(editId, {
      coins: Number(editForm.coins) || 0,
      reserve_balance: Number(editForm.reserve_balance) || 0,
    });
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

  const getUserLabel = (b: (typeof balances)[number]) => {
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
      {filtered.length === 0 && (
        <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
          Không tìm thấy.
        </div>
      )}
      {filtered.map((b) => {
        const { name, sub } = getUserLabel(b);
        return (
          <div key={b.id} className="rounded-xl border bg-card px-3 py-2">
            {editId === b.id ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {name}{" "}
                  {sub && (
                    <span className="text-[10px] font-normal text-muted-foreground">({sub})</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Xu</div>
                    <Input
                      value={editForm.coins}
                      onChange={(e) => setEditForm((ef) => ({ ...ef, coins: e.target.value }))}
                      className="h-8 text-xs"
                      type="number"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Dự trữ (đ)</div>
                    <Input
                      value={editForm.reserve_balance}
                      onChange={(e) =>
                        setEditForm((ef) => ({ ...ef, reserve_balance: e.target.value }))
                      }
                      className="h-8 text-xs"
                      type="number"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit}>
                    Lưu
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                    Huỷ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">
                    {name}{" "}
                    {sub && (
                      <span className="text-[10px] font-normal text-muted-foreground">({sub})</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {b.coins} xu · Dự trữ: {b.reserve_balance.toLocaleString("vi-VN")} đ
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(b)}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {b.reserve_balance > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doReset(b)}
                      className="h-7 text-xs"
                    >
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
      <span className="absolute left-1/2 -translate-x-1/2 animate-float-up text-2xl">{emoji}</span>
    </div>
  );
}
