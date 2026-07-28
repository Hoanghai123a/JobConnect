import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Coins,
  Crown,
  Gem,
  RotateCcw,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { fetchBalance, updateBalance, fetchAllBalances, type GardenBalance } from "@/lib/garden-server";

export const Route = createFileRoute("/_authenticated/gems")({
  component: GemsGamePage,
});

// ---- Constants ----

const GEM_TYPES_ALL = ["ruby", "emerald", "sapphire", "amber", "violet", "aqua", "gold", "rose"] as const;
type GemType = (typeof GEM_TYPES_ALL)[number];

const GEM_IMAGE: Record<GemType, string> = {
  ruby: "/gems/ruby.svg",
  emerald: "/gems/emerald.svg",
  sapphire: "/gems/sapphire.svg",
  amber: "/gems/amber.svg",
  violet: "/gems/violet.svg",
  aqua: "/gems/aqua.svg",
  gold: "/gems/gold.svg",
  rose: "/gems/rose.svg",
};

type Level = "easy" | "normal" | "hard";

const LEVEL_CONFIG: Record<Level, { label: string; gemCount: number; boardSize: number; threshold: number | null }> = {
  easy: { label: "Dễ", gemCount: 3, boardSize: 7, threshold: 300 },
  normal: { label: "Thường", gemCount: 6, boardSize: 8, threshold: 800 },
  hard: { label: "Khó", gemCount: 8, boardSize: 8, threshold: null },
};

const LEVEL_ORDER: Level[] = ["easy", "normal", "hard"];

const DAILY_COIN_CAP = 20;
const COIN_STOP_THRESHOLD = 500;
const DAILY_PLAY_LIMIT = 5;
const SWIPE_THRESHOLD = 20;

const SWAP_MS = 220;
const EXPLODE_MS = 320;
const GAP_HOLD_MS = 140;
const DROP_MS = 480;

const TODAY = new Date().toISOString().slice(0, 10);

// ---- Types ----

type CellState = "idle" | "matched";

type Cell = {
  id: string;
  type: GemType;
  coin?: number;
  row: number;
  col: number;
  state: CellState;
  spawn?: boolean;
};

type DailyState = {
  date: string;
  earned: number;
  plays: number;
};

type GameProgress = {
  level: Level;
  score: number;
};

type RankEntry = {
  userId: string;
  name: string;
  score: number;
};

const LEADERBOARD_TOP = 5;
const LEADERBOARD_MAX = 50;

// ---- Persistence helpers ----

function dailyKey(userId: string) {
  return `gems:daily:${userId}`;
}

function progressKey(userId: string) {
  return `gems:progress:${userId}`;
}

function bestKey(userId: string) {
  return `gems:best:${userId}`;
}

function readDaily(userId: string): DailyState {
  if (typeof window === "undefined") return { date: TODAY, earned: 0, plays: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(dailyKey(userId)) || "null") as DailyState | null;
    if (parsed?.date === TODAY) return { ...parsed, plays: parsed.plays ?? 0 };
  } catch {}
  return { date: TODAY, earned: 0, plays: 0 };
}

function writeDaily(userId: string, state: DailyState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(dailyKey(userId), JSON.stringify(state));
}

function readProgress(userId: string): GameProgress {
  if (typeof window === "undefined") return { level: "easy", score: 0 };
  try {
    const parsed = JSON.parse(localStorage.getItem(progressKey(userId)) || "null") as GameProgress | null;
    if (parsed && LEVEL_ORDER.includes(parsed.level)) return parsed;
  } catch {}
  return { level: "easy", score: 0 };
}

function writeProgress(userId: string, progress: GameProgress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(progressKey(userId), JSON.stringify(progress));
}

function readBest(userId: string) {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(bestKey(userId)) || 0);
}

function writeBest(userId: string, score: number) {
  if (typeof window === "undefined") return;
  localStorage.setItem(bestKey(userId), String(score));
}

// ---- Board helpers ----

function getGemTypes(level: Level): GemType[] {
  const count = LEVEL_CONFIG[level].gemCount;
  return GEM_TYPES_ALL.slice(0, count) as GemType[];
}

function makeId(row: number, col: number) {
  return `c-${row}-${col}-${Math.random().toString(36).slice(2, 9)}`;
}

function randomType(types: GemType[]) {
  return types[Math.floor(Math.random() * types.length)];
}

function typeAvoidingMatch(row: number, col: number, cells: Cell[], boardSize: number, types: GemType[]) {
  const byRC = (r: number, c: number) => cells.find((cell) => cell.row === r && cell.col === c);
  let type = randomType(types);
  let guard = 0;
  while (guard < 20) {
    const left1 = col >= 1 ? byRC(row, col - 1)?.type : null;
    const left2 = col >= 2 ? byRC(row, col - 2)?.type : null;
    const up1 = row >= 1 ? byRC(row - 1, col)?.type : null;
    const up2 = row >= 2 ? byRC(row - 2, col)?.type : null;
    if (!(left1 === type && left2 === type) && !(up1 === type && up2 === type)) return type;
    type = randomType(types);
    guard += 1;
  }
  return type;
}

function coinTileCount(coins: number, dailyEarned: number) {
  if (coins >= COIN_STOP_THRESHOLD || dailyEarned >= DAILY_COIN_CAP) return 0;
  if (coins >= 300) return 1;
  if (coins >= 150) return 2;
  return 4;
}

function createBoard(level: Level, coins: number, dailyEarned: number): Cell[] {
  const { boardSize } = LEVEL_CONFIG[level];
  const types = getGemTypes(level);
  const cells: Cell[] = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      cells.push({
        id: makeId(row, col),
        type: typeAvoidingMatch(row, col, cells, boardSize, types),
        row,
        col,
        state: "idle",
      });
    }
  }

  const coinCount = coinTileCount(coins, dailyEarned);
  const positions = new Set<number>();
  while (positions.size < coinCount) {
    positions.add(Math.floor(Math.random() * cells.length));
  }
  positions.forEach((index) => {
    cells[index] = {
      ...cells[index],
      coin: coins < 150 && Math.random() > 0.65 ? 2 : 1,
    };
  });
  return cells;
}

function findMatchedIds(cells: Cell[], boardSize: number): Set<string> {
  const byRC: (Cell | undefined)[][] = Array.from({ length: boardSize }, () => Array(boardSize).fill(undefined));
  cells.forEach((cell) => {
    if (cell.row >= 0 && cell.row < boardSize && cell.col >= 0 && cell.col < boardSize) {
      byRC[cell.row][cell.col] = cell;
    }
  });

  const matched = new Set<string>();

  for (let row = 0; row < boardSize; row += 1) {
    let runStart = 0;
    for (let col = 1; col <= boardSize; col += 1) {
      const prev = byRC[row][col - 1]?.type;
      const current = col < boardSize ? byRC[row][col]?.type : null;
      if (current !== prev || prev === undefined) {
        if (col - runStart >= 3 && prev !== undefined) {
          for (let c = runStart; c < col; c += 1) {
            const cell = byRC[row][c];
            if (cell) matched.add(cell.id);
          }
        }
        runStart = col;
      }
    }
  }

  for (let col = 0; col < boardSize; col += 1) {
    let runStart = 0;
    for (let row = 1; row <= boardSize; row += 1) {
      const prev = byRC[row - 1]?.[col]?.type;
      const current = row < boardSize ? byRC[row]?.[col]?.type : null;
      if (current !== prev || prev === undefined) {
        if (row - runStart >= 3 && prev !== undefined) {
          for (let r = runStart; r < row; r += 1) {
            const cell = byRC[r][col];
            if (cell) matched.add(cell.id);
          }
        }
        runStart = row;
      }
    }
  }

  return matched;
}

function getCellByRC(cells: Cell[], row: number, col: number): Cell | undefined {
  return cells.find((c) => c.row === row && c.col === col);
}

function isAdjacent(a: Cell, b: Cell) {
  return (a.row === b.row && Math.abs(a.col - b.col) === 1) || (a.col === b.col && Math.abs(a.row - b.row) === 1);
}

function getSwipeTargetRC(row: number, col: number, dx: number, dy: number, boardSize: number) {
  if (Math.abs(dx) > Math.abs(dy)) {
    const nextCol = col + (dx > 0 ? 1 : -1);
    if (nextCol < 0 || nextCol >= boardSize) return null;
    return { row, col: nextCol };
  }
  const nextRow = row + (dy > 0 ? 1 : -1);
  if (nextRow < 0 || nextRow >= boardSize) return null;
  return { row: nextRow, col };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ---- Components ----

function GemPiece({ type }: { type: GemType }) {
  return (
    <img
      src={GEM_IMAGE[type]}
      alt={type}
      className="pointer-events-none h-7 w-7 object-contain drop-shadow-sm sm:h-8 sm:w-8"
      draggable={false}
    />
  );
}

function SparkleBurst() {
  const particles = [0, 60, 120, 180, 240, 300];
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,240,180,0.6) 40%, transparent 70%)",
        }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1.4, opacity: [0, 1, 0] }}
        transition={{ duration: EXPLODE_MS / 1000, ease: "easeOut" }}
      />
      {particles.map((angle) => (
        <motion.span
          key={angle}
          aria-hidden
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-200 shadow-[0_0_6px_rgba(255,200,80,0.9)]"
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
          animate={{
            x: Math.cos((angle * Math.PI) / 180) * 22,
            y: Math.sin((angle * Math.PI) / 180) * 22,
            opacity: 0,
            scale: 1.1,
          }}
          transition={{ duration: EXPLODE_MS / 1000, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

function GemsGamePage() {
  const { user } = useAuth();
  const isStaff = (user as any)?.role === "staff";
  const [balance, setBalance] = useState<GardenBalance | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState<Level>("easy");
  const [dailyEarned, setDailyEarned] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dailyPlays, setDailyPlays] = useState(0);
  const [rankAll, setRankAll] = useState<RankEntry[]>([]);
  const [showFullRank, setShowFullRank] = useState(false);
  const [soloUser, setSoloUser] = useState("");
  const [soloStake, setSoloStake] = useState("20");

  const pointerStart = useRef<{ row: number; col: number; x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [cellSize, setCellSize] = useState(48);

  // Latest snapshots for async pipeline
  const coinsRef = useRef(0);
  const dailyEarnedRef = useRef(0);
  const balanceRef = useRef<GardenBalance | null>(null);

  const coins = balance?.coins ?? 0;
  const config = LEVEL_CONFIG[level];
  const boardSize = config.boardSize;
  const hiddenByThreshold = coins >= COIN_STOP_THRESHOLD;
  const visibleCoinTiles = coinTileCount(coins, dailyEarned);

  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);
  useEffect(() => {
    dailyEarnedRef.current = dailyEarned;
  }, [dailyEarned]);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  // Fetch leaderboard
  useEffect(() => {
    let alive = true;
    fetchAllBalances().then((balances) => {
      if (!alive) return;
      const entries: RankEntry[] = balances
        .filter((b) => (b.gemsBestScore ?? 0) > 0)
        .sort((a, b) => (b.gemsBestScore ?? 0) - (a.gemsBestScore ?? 0))
        .slice(0, LEADERBOARD_MAX)
        .map((b) => ({
          userId: b.user,
          name: b.expand?.user?.full_name || b.expand?.user?.username || "---",
          score: b.gemsBestScore ?? 0,
        }));
      setRankAll(entries);
    }).catch(() => {});
    return () => { alive = false; };
  }, [bestScore]);

  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const idx = rankAll.findIndex((e) => e.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rankAll, user?.id]);

  const rankTop = showFullRank ? rankAll : rankAll.slice(0, LEADERBOARD_TOP);

  useEffect(() => {
    if (!user?.id) return;
    const daily = readDaily(user.id);
    const progress = readProgress(user.id);
    setDailyEarned(daily.earned);
    setDailyPlays(daily.plays);
    setBestScore(readBest(user.id));
    setLevel(progress.level);
    setScore(progress.score);

    let alive = true;
    fetchBalance(user.id)
      .then((nextBalance) => {
        if (!alive) return;
        setBalance(nextBalance);
        const serverBest = nextBalance.gemsBestScore ?? 0;
        const localBest = readBest(user.id);
        const trueBest = Math.max(serverBest, localBest);
        setBestScore(trueBest);
        if (trueBest > serverBest) updateBalance(nextBalance.id, { gemsBestScore: trueBest }).catch(() => {});
        if (trueBest > localBest) writeBest(user.id, trueBest);
        setCells(createBoard(progress.level, nextBalance.coins, daily.earned));
      })
      .catch(() => {
        if (alive) toast.error("Không tải được ví xu vườn cây");
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || score <= bestScore) return;
    setBestScore(score);
    writeBest(user.id, score);
    const bal = balanceRef.current;
    if (bal?.id) updateBalance(bal.id, { gemsBestScore: score }).catch(() => {});
  }, [bestScore, score, user?.id]);

  // Level up
  useEffect(() => {
    if (!user?.id) return;
    const threshold = config.threshold;
    if (threshold === null) return;
    if (score < threshold) return;

    const currentIdx = LEVEL_ORDER.indexOf(level);
    if (currentIdx >= LEVEL_ORDER.length - 1) return;

    const nextLevel = LEVEL_ORDER[currentIdx + 1];
    toast.success(`Chúc mừng! Qua màn "${LEVEL_CONFIG[nextLevel].label}"`, { icon: <Star className="h-4 w-4" /> });
    setLevel(nextLevel);
    writeProgress(user.id, { level: nextLevel, score });
    setCells(createBoard(nextLevel, coinsRef.current, dailyEarnedRef.current));
  }, [score, level, config.threshold, user?.id]);

  // Measure cell size responsively
  useEffect(() => {
    const measure = () => {
      const width = boardRef.current?.clientWidth ?? 0;
      if (width > 0) {
        const gap = 3;
        const size = (width - gap * (boardSize - 1)) / boardSize;
        setCellSize(size);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [boardSize]);

  const playsLeft = DAILY_PLAY_LIMIT - dailyPlays;

  const startRound = () => {
    if (!user?.id) return;
    if (playsLeft <= 0) {
      toast.warning("Hôm nay đã hết lượt chơi, quay lại vào ngày mai nhé!");
      return;
    }
    const nextPlays = dailyPlays + 1;
    setDailyPlays(nextPlays);
    const nextDaily = { date: TODAY, earned: dailyEarnedRef.current, plays: nextPlays };
    writeDaily(user.id, nextDaily);
    setScore(0);
    setLevel("easy");
    writeProgress(user.id, { level: "easy", score: 0 });
    setCells(createBoard("easy", coinsRef.current, dailyEarnedRef.current));
  };

  const awardCoins = async (rawReward: number) => {
    const uid = user?.id;
    const bal = balanceRef.current;
    if (!uid || !bal?.id || rawReward <= 0) return 0;
    const dailyRemaining = Math.max(0, DAILY_COIN_CAP - dailyEarnedRef.current);
    const reward = Math.min(rawReward, dailyRemaining);
    if (reward <= 0) {
      toast.info("Hôm nay đã đạt giới hạn xu từ kim cương");
      return 0;
    }

    const nextCoins = coinsRef.current + reward;
    const currentDaily = readDaily(uid);
    const nextDaily = { date: TODAY, earned: dailyEarnedRef.current + reward, plays: currentDaily.plays };
    const updated = await updateBalance(bal.id, { coins: nextCoins });
    setBalance(updated);
    setDailyEarned(nextDaily.earned);
    writeDaily(uid, nextDaily);
    toast.success(`Ăn đúng kim cương thưởng, nhận +${reward} xu`);
    return reward;
  };

  // ---- Animation pipeline ----

  const resolveChain = useCallback(
    async (input: Cell[]) => {
      let current = input;
      let totalMatched = 0;
      let coinReward = 0;

      const types = getGemTypes(level);

      for (let chain = 0; chain < 8; chain += 1) {
        const matchedIds = findMatchedIds(current, boardSize);
        if (matchedIds.size === 0) break;

        totalMatched += matchedIds.size;
        current.forEach((cell) => {
          if (matchedIds.has(cell.id)) coinReward += cell.coin || 0;
        });

        // Phase A: mark matched (triggers explode animation via state="matched")
        current = current.map((cell) =>
          matchedIds.has(cell.id) ? { ...cell, state: "matched" as CellState } : cell,
        );
        setCells(current);
        await delay(EXPLODE_MS);

        // Phase A.5: remove matched cells fully first, leaving visible empty slots
        const surviving = current.filter((cell) => !matchedIds.has(cell.id));
        setCells(surviving);
        await delay(GAP_HOLD_MS);

        // Phase B: gravity-shift surviving cells, spawn new ones
        const nextCells: Cell[] = [];

        for (let col = 0; col < boardSize; col += 1) {
          const columnCells = surviving.filter((cell) => cell.col === col).sort((a, b) => b.row - a.row);
          // Bottom-most surviving cells fall to bottom of the board first
          columnCells.forEach((cell, i) => {
            nextCells.push({ ...cell, row: boardSize - 1 - i });
          });
          // Fill remaining top slots with newly spawned gems
          const missing = boardSize - columnCells.length;
          for (let i = 0; i < missing; i += 1) {
            const targetRow = missing - 1 - i;
            nextCells.push({
              id: makeId(targetRow, col),
              type: typeAvoidingMatch(targetRow, col, nextCells, boardSize, types),
              row: targetRow,
              col,
              state: "idle",
              spawn: true,
            });
          }
        }

        // New cells mount with `initial` above the board (see motion.button below)
        // and animate down to their real row via framer-motion.
        setCells(nextCells);
        current = nextCells;
        await delay(DROP_MS);
      }

      return { board: current, matchedCount: totalMatched, coinReward };
    },
    [boardSize, level],
  );

  const doMove = useCallback(
    async (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
      if (busy) return;
      const a = getCellByRC(cells, fromRow, fromCol);
      const b = getCellByRC(cells, toRow, toCol);
      if (!a || !b) return;
      if (!isAdjacent(a, b)) return;

      setBusy(true);
      try {
        // Phase 1: animate swap
        const swapped = cells.map((cell) => {
          if (cell.id === a.id) return { ...cell, row: b.row, col: b.col };
          if (cell.id === b.id) return { ...cell, row: a.row, col: a.col };
          return cell;
        });
        setCells(swapped);
        await delay(SWAP_MS);

        // Check match
        const matched = findMatchedIds(swapped, boardSize);
        if (matched.size === 0) {
          // Revert (no toast)
          const reverted = swapped.map((cell) => {
            if (cell.id === a.id) return { ...cell, row: a.row, col: a.col };
            if (cell.id === b.id) return { ...cell, row: b.row, col: b.col };
            return cell;
          });
          setCells(reverted);
          await delay(SWAP_MS);
          return;
        }

        // Resolve chain (explode + refill loop)
        const result = await resolveChain(swapped);
        const awarded = await awardCoins(result.coinReward);
        const gained = result.matchedCount * 10 + awarded * 50;
        const newScore = score + gained;
        setScore(newScore);
        if (user?.id) writeProgress(user.id, { level, score: newScore });
      } catch {
        toast.error("Có lỗi, vui lòng thử lại");
      } finally {
        setBusy(false);
      }
    },
    [busy, cells, boardSize, level, resolveChain, score, user?.id],
  );

  const handlePointerDown = (row: number, col: number, e: React.PointerEvent) => {
    if (busy) return;
    pointerStart.current = { row, col, x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const { row, col, x, y } = pointerStart.current;
    pointerStart.current = null;

    const dx = e.clientX - x;
    const dy = e.clientY - y;

    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;

    const target = getSwipeTargetRC(row, col, dx, dy, boardSize);
    if (!target) return;
    doMove(row, col, target.row, target.col);
  };

  const submitSolo = () => {
    const stake = Math.max(0, Number(soloStake) || 0);
    if (!soloUser.trim()) {
      toast.warning("Nhập tài khoản muốn khiêu chiến");
      return;
    }
    if (stake < 10) {
      toast.warning("Mức cược tối thiểu nên từ 10 xu");
      return;
    }
    toast.info("Chế độ solo cần bật collection và transaction PocketBase trước khi mở cược thật");
  };

  const gap = 3;
  const boardPixelSize = cellSize * boardSize + gap * (boardSize - 1);

  if (isStaff) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Tính năng này không khả dụng cho tài khoản staff.
      </div>
    );
  }

  return (
    <PageContainer
      title="Xếp kim cương"
      subtitle="Vuốt để đổi vị trí, xếp 3 viên cùng loại"
      right={
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700">
          <Coins className="h-4 w-4" />
          {coins}
        </div>
      }
    >
      <Tabs defaultValue="play" className="flex flex-col gap-3">
        <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="play" className="rounded-lg text-xs">Chơi</TabsTrigger>
          <TabsTrigger value="rank" className="rounded-lg text-xs">Xếp hạng</TabsTrigger>
          <TabsTrigger value="solo" className="rounded-lg text-xs">Solo</TabsTrigger>
        </TabsList>

        <TabsContent value="play" className="mt-0 flex flex-col gap-3">
          <div className="worker-game-layout">
          <aside className="worker-game-desktop-rail" aria-label="Chỉ số xếp kim cương">
            <div className="worker-game-rail-title">Chỉ số</div>
            <Card className="worker-game-stat">
              <div className="worker-game-stat-label">Điểm</div>
              <div className="worker-game-stat-value">{score}</div>
            </Card>
            <Card className="worker-game-stat">
              <div className="worker-game-stat-label">Kỷ lục</div>
              <div className={cn("worker-game-stat-value", score >= bestScore && bestScore > 0 && "text-amber-600")}>{bestScore}</div>
            </Card>
            <Card className="worker-game-stat">
              <div className="worker-game-stat-label">Mục tiêu</div>
              <div className="worker-game-stat-value">{config.threshold ? config.threshold : "∞"}</div>
            </Card>
            <Card className="worker-game-stat">
              <div className="worker-game-stat-label">Xu hôm nay</div>
              <div className="worker-game-stat-value">{dailyEarned}</div>
            </Card>
          </aside>
          <div className="worker-game-main flex flex-col gap-3">
          <section className="gradient-hero overflow-hidden rounded-3xl p-4 text-white shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-white/70">
                  Màn chơi: {config.label}
                </div>
                <div className="mt-1 text-xl font-semibold leading-tight">Săn kim cương thưởng xu</div>
                <div className="mt-1 text-sm text-white/80">
                  {config.threshold
                    ? `Đạt ${config.threshold} điểm để qua ải tiếp theo`
                    : "Chế độ khó — điểm tích lũy không giới hạn"}
                </div>
              </div>
              <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
                <Gem className="h-6 w-6" />
              </div>
            </div>
          </section>

          <div className="worker-game-mobile-stats grid grid-cols-4 gap-2">
            <Card className="p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Điểm</div>
              <div className="text-lg font-semibold">{score}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Kỷ lục</div>
              <div className={cn("text-lg font-semibold", score >= bestScore && bestScore > 0 && "text-amber-600")}>{bestScore}</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Mục tiêu</div>
              <div className="text-lg font-semibold">
                {config.threshold ? `${config.threshold}` : "∞"}
              </div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Xu hôm nay</div>
              <div className="text-lg font-semibold">{dailyEarned}</div>
            </Card>
          </div>

          {config.threshold && (
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500"
                style={{ width: `${Math.min(100, (score / config.threshold) * 100)}%` }}
              />
            </div>
          )}

          <Card className="worker-game-board-card flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Bàn kim cương</div>
                <div className="text-[11px] text-muted-foreground">
                  {hiddenByThreshold
                    ? "Bạn đã đạt ngưỡng, bàn này không còn kim cương chứa xu."
                    : visibleCoinTiles > 0
                      ? `Có khoảng ${visibleCoinTiles} viên chứa xu.`
                      : "Hôm nay đã hết lượt nhận xu, vẫn có thể chơi lấy điểm."}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={startRound} disabled={busy || playsLeft <= 0}>
                <RotateCcw className="h-3.5 w-3.5" /> Chơi lại ({playsLeft})
              </Button>
            </div>

            <div className="worker-game-board mx-auto w-full max-w-[420px] touch-none select-none">
              <div
                ref={boardRef}
                className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 p-0"
                style={{ height: boardPixelSize, aspectRatio: "1 / 1" }}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {cells.map((cell) => {
                  const left = cell.col * (cellSize + gap);
                  const top = cell.row * (cellSize + gap);
                  const spawnTop = -(cellSize + gap) * (cell.row + 2);
                  const isMatched = cell.state === "matched";
                  const initial = cell.spawn
                    ? { left, top: spawnTop, opacity: 0, scale: 0.85 }
                    : false;
                  return (
                    <motion.button
                      key={cell.id}
                      type="button"
                      disabled={busy}
                      onPointerDown={(e) => handlePointerDown(cell.row, cell.col, e)}
                      className={cn(
                        "absolute grid place-items-center rounded-xl border border-white/60 bg-white/95 shadow-sm",
                      )}
                      style={{ width: cellSize, height: cellSize, left, top }}
                      initial={initial}
                      animate={{
                        left,
                        top,
                        scale: isMatched ? [1, 1.25, 0] : 1,
                        opacity: isMatched ? [1, 1, 0] : 1,
                      }}
                      transition={{
                        left: { type: "spring", stiffness: 420, damping: 34 },
                        top: isMatched
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 260, damping: 20, mass: 1.1 },
                        scale: isMatched
                          ? { duration: EXPLODE_MS / 1000, ease: "easeOut" }
                          : { type: "spring", stiffness: 400, damping: 20 },
                        opacity: { duration: EXPLODE_MS / 1000, ease: "easeOut" },
                      }}
                      aria-label={cell.coin ? `Kim cương có ${cell.coin} xu` : `Kim cương ${cell.type}`}
                    >
                      <GemPiece type={cell.type} />
                      {cell.coin ? (
                        <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-100 px-1 text-[9px] font-bold text-amber-700 shadow">
                          +{cell.coin}
                        </span>
                      ) : null}
                      {isMatched ? <SparkleBurst /> : null}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </Card>
          </div>
          </div>
        </TabsContent>

        <TabsContent value="rank" className="mt-0 flex flex-col gap-3">
          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">Bảng xếp hạng tổng</div>
              </div>
              {rankAll.length > LEADERBOARD_TOP && (
                <Button size="sm" variant="ghost" onClick={() => setShowFullRank(!showFullRank)}>
                  {showFullRank ? "Thu gọn" : `Xem top ${LEADERBOARD_MAX}`}
                </Button>
              )}
            </div>
            {rankTop.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Chưa có ai ghi điểm</div>
            ) : (
              rankTop.map((item, index) => (
                <div key={item.userId} className={cn("flex items-center justify-between rounded-2xl border p-3", item.userId === user?.id && "border-primary/40 bg-primary/5")}>
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      {index === 0 ? <Crown className="h-4 w-4" /> : <span className="text-xs font-bold">{index + 1}</span>}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{item.name}</div>
                    </div>
                  </div>
                  <StatusChip tone="success">{item.score} điểm</StatusChip>
                </div>
              ))
            )}
            <div className="rounded-2xl border border-dashed p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Thứ hạng của bạn</div>
              <div className="mt-1 text-sm font-semibold">
                {myRank ? `#${myRank} — ${bestScore} điểm` : "Chưa có hạng"}
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Bảng bạn bè</div>
            </div>
            <EmptyState
              icon={Users}
              title="Chưa có dữ liệu"
              description="Sau khi bật collection solo, những người từng đấu với nhau sẽ xuất hiện trong bảng bạn bè."
            />
          </Card>
        </TabsContent>

        <TabsContent value="solo" className="mt-0 flex flex-col gap-3">
          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" />
              <div className="text-sm font-semibold">Khiêu chiến solo</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Cược xu cần escrow và transaction ở PocketBase. Màn này đã sẵn form, nhưng chưa mở cược thật để tránh mất xu sai.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="solo-user">Tài khoản đối thủ</Label>
                <Input
                  id="solo-user"
                  value={soloUser}
                  onChange={(event) => setSoloUser(event.target.value)}
                  placeholder="Nhập username"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="solo-stake">Xu cược</Label>
                <Input
                  id="solo-stake"
                  value={soloStake}
                  onChange={(event) => setSoloStake(event.target.value)}
                  type="number"
                  min={10}
                  step={1}
                />
              </div>
            </div>
            <Button onClick={submitSolo}>
              <Sparkles className="h-4 w-4" /> Gửi khiêu chiến
            </Button>
            <div className="text-[11px] leading-5 text-muted-foreground">
              Luật dự kiến: người thua mất toàn bộ xu cược; người thắng nhận phần cược của người thua sau khi trừ 10% phí.
              Ví dụ cược 20 xu thì người thắng nhận thêm 18 xu.
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

