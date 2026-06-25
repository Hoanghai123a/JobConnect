import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/layout/BottomNav";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
  type GardenState,
  type Flower,
} from "@/lib/garden";
import { Coins, Sparkles, Drumstick, Hand, Store, Leaf } from "lucide-react";

export const Route = createFileRoute("/_authenticated/garden")({
  component: GardenPage,
});

function GardenPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<GardenState | null>(null);
  const [tick, setTick] = useState(0);
  const [seedPickerFor, setSeedPickerFor] = useState<number | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    if (user?.id) setState(loadGarden(user.id));
  }, [user?.id]);

  // Cập nhật tiến độ cây mỗi 30s.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const commit = useCallback(
    (next: GardenState) => {
      setState(next);
      saveGarden(user?.id, next);
    },
    [user?.id],
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
    if (state.coins < flower.seedCost) {
      toast.error("Không đủ xu để mua hạt giống");
      return;
    }
    const plots = state.plots.slice();
    plots[plotIndex] = { flowerId: flower.id, plantedAt: Date.now() };
    commit({ ...state, coins: state.coins - flower.seedCost, plots });
    setSeedPickerFor(null);
    toast.success(`Đã trồng ${flower.name}`);
  };

  const harvest = (plotIndex: number) => {
    const plot = state.plots[plotIndex];
    const flower = flowerById(plot.flowerId);
    if (!flower || !isReady(plot, now)) return;
    const plots = state.plots.slice();
    plots[plotIndex] = { flowerId: null, plantedAt: null };
    commit({
      ...state,
      coins: state.coins + flower.reward,
      plots,
      totalHarvested: state.totalHarvested + 1,
    });
    toast.success(`Thu hoạch ${flower.name} +${flower.reward} xu`);
  };

  const feedPet = () => {
    commit({ ...state, pet: { ...state.pet, lastFedAt: Date.now() } });
    toast.success(`${state.pet.name} đã được ăn no!`);
  };

  const playPet = () => {
    commit({ ...state, pet: { ...state.pet, lastPlayedAt: Date.now() } });
    toast.success(`${state.pet.name} vui lắm!`);
  };

  const buyPet = (petId: string, cost: number) => {
    if (state.ownedPets.includes(petId)) {
      commit({ ...state, pet: { ...state.pet, id: petId } });
      toast.success("Đã chọn thú cưng");
      return;
    }
    if (state.coins < cost) {
      toast.error("Không đủ xu");
      return;
    }
    commit({
      ...state,
      coins: state.coins - cost,
      ownedPets: [...state.ownedPets, petId],
      pet: { ...state.pet, id: petId },
    });
    toast.success("Mở khóa thú cưng mới!");
  };

  return (
    <div className="pb-nav">
      <AppHeader
        title="Vườn của tôi"
        subtitle="Trồng hoa, nuôi thú, thư giãn chút nha"
        right={
          <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700">
            <Coins className="h-4 w-4" />
            {state.coins}
          </div>
        }
      />

      <div className="space-y-4 px-4 pt-4">
        {/* Khu thú cưng */}
        <section className="gradient-hero relative overflow-hidden rounded-3xl p-4 text-white shadow-soft">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-white/20 text-5xl backdrop-blur">
              <span
                className={cn(
                  "inline-block",
                  mood === "great" && "animate-bounce",
                  mood === "sad" && "opacity-70",
                )}
              >
                {pet.emoji}
              </span>
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
              onClick={feedPet}
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
                      <span className={cn("text-3xl", ready && "animate-bounce")}>
                        {ready ? flower.emoji : flower.sproutEmoji}
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
                            {readyInMinutes(plot, now)}p nữa
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
              const affordable = state.coins >= f.seedCost;
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
                  <span className="text-4xl">{p.emoji}</span>
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
