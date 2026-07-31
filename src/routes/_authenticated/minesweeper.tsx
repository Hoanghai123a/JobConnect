import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bomb, Clock, Coins, Crown, Flag, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  fetchBalance,
  updateBalance,
  fetchAllBalances,
  type GardenBalance,
} from "@/lib/garden-server";

export const Route = createFileRoute("/_authenticated/minesweeper")({
  component: MinesweeperPage,
});

// ---- Constants ----

type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { label: string; rows: number; cols: number; mines: number; coinReward: number }
> = {
  easy: { label: "Dễ", rows: 9, cols: 9, mines: 10, coinReward: 2 },
  medium: { label: "Vừa", rows: 12, cols: 12, mines: 30, coinReward: 4 },
  hard: { label: "Khó", rows: 16, cols: 16, mines: 50, coinReward: 8 },
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const DAILY_COIN_CAP = 20;
const COIN_STOP_THRESHOLD = 500;
const DAILY_PLAY_LIMIT = 5;
const LEADERBOARD_TOP = 5;
const LEADERBOARD_MAX = 50;
const TODAY = new Date().toISOString().slice(0, 10);

const NUMBER_COLORS: Record<number, string> = {
  1: "text-blue-600",
  2: "text-green-600",
  3: "text-red-600",
  4: "text-purple-700",
  5: "text-amber-800",
  6: "text-cyan-600",
  7: "text-gray-900",
  8: "text-gray-500",
};

// ---- Types ----

type CellStatus = "hidden" | "revealed" | "flagged" | "exploded";

type MineCell = {
  row: number;
  col: number;
  isMine: boolean;
  adjacentMines: number;
  status: CellStatus;
};

type GameState = "idle" | "playing" | "won" | "lost";

type DailyState = { date: string; earned: number; plays: number };

type BestTimes = Record<Difficulty, number | null>;

type RankEntry = {
  userId: string;
  name: string;
  time: number;
  difficulty: Difficulty;
};

// ---- Helpers ----

function getNeighbors(row: number, col: number, rows: number, cols: number) {
  const n: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr,
        nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) n.push([nr, nc]);
    }
  }
  return n;
}

function generateBoard(
  rows: number,
  cols: number,
  mines: number,
  safeRow: number,
  safeCol: number,
): MineCell[] {
  const total = rows * cols;
  const safeZone = new Set<number>();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = safeRow + dr,
        nc = safeCol + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        safeZone.add(nr * cols + nc);
      }
    }
  }

  const candidates: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!safeZone.has(i)) candidates.push(i);
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const mineSet = new Set(candidates.slice(0, mines));

  const board: MineCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      board.push({
        row: r,
        col: c,
        isMine: mineSet.has(r * cols + c),
        adjacentMines: 0,
        status: "hidden",
      });
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r * cols + c].isMine) continue;
      let count = 0;
      for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
        if (board[nr * cols + nc].isMine) count++;
      }
      board[r * cols + c].adjacentMines = count;
    }
  }
  return board;
}

function floodFill(
  board: MineCell[],
  row: number,
  col: number,
  rows: number,
  cols: number,
): MineCell[] {
  const next = [...board];
  const stack: [number, number][] = [[row, col]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const idx = r * cols + c;
    if (next[idx].status === "revealed") continue;
    next[idx] = { ...next[idx], status: "revealed" };
    if (next[idx].adjacentMines === 0) {
      for (const [nr, nc] of getNeighbors(r, c, rows, cols)) {
        const ni = nr * cols + nc;
        if (next[ni].status === "hidden" && !next[ni].isMine) {
          stack.push([nr, nc]);
        }
      }
    }
  }
  return next;
}

function checkWin(board: MineCell[]): boolean {
  return board.every((c) => c.isMine || c.status === "revealed");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---- Persistence ----

function dailyKey(userId: string) {
  return `minesweeper:daily:${userId}`;
}
function bestKey(userId: string) {
  return `minesweeper:best:${userId}`;
}

function readDaily(userId: string): DailyState {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(dailyKey(userId)) || "null",
    ) as DailyState | null;
    if (parsed?.date === TODAY) return { ...parsed, plays: parsed.plays ?? 0 };
  } catch {}
  return { date: TODAY, earned: 0, plays: 0 };
}

function writeDaily(userId: string, state: DailyState) {
  localStorage.setItem(dailyKey(userId), JSON.stringify(state));
}

function readBest(userId: string): BestTimes {
  try {
    const parsed = JSON.parse(localStorage.getItem(bestKey(userId)) || "null");
    if (parsed) return parsed;
  } catch {}
  return { easy: null, medium: null, hard: null };
}

function writeBest(userId: string, best: BestTimes) {
  localStorage.setItem(bestKey(userId), JSON.stringify(best));
}

// ---- Component ----

function MinesweeperPage() {
  const { user } = useAuth();
  const isStaff = (user as any)?.role === "staff";

  const [board, setBoard] = useState<MineCell[]>([]);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [flagMode, setFlagMode] = useState(false);
  const [timer, setTimer] = useState(0);
  const [minesLeft, setMinesLeft] = useState(DIFFICULTY_CONFIG.easy.mines);
  const [balance, setBalance] = useState<GardenBalance | null>(null);
  const [dailyEarned, setDailyEarned] = useState(0);
  const [dailyPlays, setDailyPlays] = useState(0);
  const [bestTimes, setBestTimes] = useState<BestTimes>({ easy: null, medium: null, hard: null });
  const [rankAll, setRankAll] = useState<RankEntry[]>([]);
  const [showFullRank, setShowFullRank] = useState(false);
  const [rankDifficulty, setRankDifficulty] = useState<Difficulty>("easy");
  const [cellSize, setCellSize] = useState(36);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointerStartPos = useRef<{ x: number; y: number } | null>(null);
  const boardContainerRef = useRef<HTMLDivElement | null>(null);
  const balanceRef = useRef<GardenBalance | null>(null);
  const dailyEarnedRef = useRef(0);

  const config = DIFFICULTY_CONFIG[difficulty];
  const coins = balance?.coins ?? 0;

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);
  useEffect(() => {
    dailyEarnedRef.current = dailyEarned;
  }, [dailyEarned]);

  useEffect(() => {
    if (!user?.id) return;
    const daily = readDaily(user.id);
    setDailyEarned(daily.earned);
    setDailyPlays(daily.plays);
    setBestTimes(readBest(user.id));
    let alive = true;
    fetchBalance(user.id)
      .then((b) => {
        if (!alive) return;
        setBalance(b);
        const localBest = readBest(user.id);
        const serverTimes = b.minesweeperBestTimes ?? {};
        // Migrate old single-field data if new field is empty
        if (
          !serverTimes.easy &&
          !serverTimes.medium &&
          !serverTimes.hard &&
          b.minesweeperBestTime &&
          b.minesweeperBestDifficulty
        ) {
          const diff = b.minesweeperBestDifficulty as Difficulty;
          serverTimes[diff] = b.minesweeperBestTime;
        }
        // Bidirectional sync per-difficulty
        let changed = false;
        for (const d of DIFFICULTIES) {
          const sv = serverTimes[d] ?? 0;
          const lv = localBest[d];
          if (sv > 0 && (lv === null || sv < lv)) {
            localBest[d] = sv;
            changed = true;
          } else if (lv !== null && lv > 0 && (sv === 0 || lv < sv)) {
            serverTimes[d] = lv;
            changed = true;
          }
        }
        if (changed) {
          setBestTimes({ ...localBest });
          writeBest(user.id, localBest);
          updateBalance(b.id, { minesweeperBestTimes: serverTimes }).catch(() => {});
        }
      })
      .catch(() => {});
    fetchAllBalances()
      .then((balances) => {
        if (!alive) return;
        const entries: RankEntry[] = [];
        for (const b of balances) {
          const times = b.minesweeperBestTimes ?? {};
          // Migrate old single-field data
          if (
            !times.easy &&
            !times.medium &&
            !times.hard &&
            b.minesweeperBestTime &&
            b.minesweeperBestDifficulty
          ) {
            const d = b.minesweeperBestDifficulty as Difficulty;
            times[d] = b.minesweeperBestTime;
          }
          for (const d of DIFFICULTIES) {
            const t = times[d];
            if (t && t > 0) {
              entries.push({
                userId: b.user,
                name:
                  (b as any).expand?.user?.full_name || (b as any).expand?.user?.username || "---",
                time: t,
                difficulty: d,
              });
            }
          }
        }
        setRankAll(entries);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  useEffect(() => {
    const measure = () => {
      const w = boardContainerRef.current?.clientWidth ?? 0;
      if (w > 0) {
        const gap = 1;
        const size = Math.floor((w - gap * (config.cols - 1)) / config.cols);
        setCellSize(Math.min(44, Math.max(24, size)));
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [config.cols]);

  const playsLeft = DAILY_PLAY_LIMIT - dailyPlays;

  const startNewGame = useCallback(
    (diff?: Difficulty) => {
      const d = diff ?? difficulty;
      setDifficulty(d);
      const c = DIFFICULTY_CONFIG[d];
      setBoard([]);
      setGameState("idle");
      setTimer(0);
      setMinesLeft(c.mines);
      setFlagMode(false);
    },
    [difficulty],
  );

  const awardCoins = useCallback(
    async (reward: number) => {
      const uid = user?.id;
      const bal = balanceRef.current;
      if (!uid || !bal?.id || reward <= 0) return;
      if (bal.coins >= COIN_STOP_THRESHOLD) return;
      const dailyRemaining = Math.max(0, DAILY_COIN_CAP - dailyEarnedRef.current);
      const actual = Math.min(reward, dailyRemaining);
      if (actual <= 0) {
        toast.info("Hôm nay đã đạt giới hạn xu");
        return;
      }
      const nextCoins = (bal.coins ?? 0) + actual;
      const nextDaily = {
        date: TODAY,
        earned: dailyEarnedRef.current + actual,
        plays: readDaily(uid).plays,
      };
      const updated = await updateBalance(bal.id, { coins: nextCoins });
      setBalance(updated);
      setDailyEarned(nextDaily.earned);
      writeDaily(uid, nextDaily);
      toast.success("Thắng! Nhận +" + actual + " xu");
    },
    [user?.id],
  );

  const handleWin = useCallback(
    (currentBoard: MineCell[], elapsed: number) => {
      if (!user?.id) return;
      setGameState("won");
      const best = readBest(user.id);
      if (best[difficulty] === null || elapsed < best[difficulty]!) {
        best[difficulty] = elapsed;
        setBestTimes({ ...best });
        writeBest(user.id, best);
        const bal = balanceRef.current;
        if (bal?.id) {
          const serverTimes = bal.minesweeperBestTimes ?? {};
          const currentBest = serverTimes[difficulty] ?? 0;
          if (currentBest === 0 || elapsed < currentBest) {
            const updated = { ...serverTimes, [difficulty]: elapsed };
            updateBalance(bal.id, { minesweeperBestTimes: updated }).catch(() => {});
          }
        }
        toast.success("Kỷ lục mới: " + formatTime(elapsed) + "!");
      } else {
        toast.success("Chúc mừng, bạn thắng!");
      }
      awardCoins(config.coinReward);
    },
    [user?.id, difficulty, config.coinReward, awardCoins],
  );

  const handleLose = useCallback((currentBoard: MineCell[]) => {
    setGameState("lost");
    const revealed = currentBoard.map((c) =>
      c.isMine && c.status !== "exploded" ? { ...c, status: "revealed" as CellStatus } : c,
    );
    setBoard(revealed);
    toast.error("Bùm! Bạn đã dẫm phải mìn");
  }, []);

  const handleCellAction = useCallback(
    (row: number, col: number, isFlag: boolean) => {
      const { rows, cols, mines } = config;
      let currentBoard = [...board];

      if (gameState === "idle") {
        if (isFlag) return;
        if (!user?.id) return;
        if (playsLeft <= 0) {
          toast.warning("Hôm nay đã hết lượt chơi!");
          return;
        }
        const nextPlays = dailyPlays + 1;
        setDailyPlays(nextPlays);
        writeDaily(user.id, { date: TODAY, earned: dailyEarnedRef.current, plays: nextPlays });
        currentBoard = generateBoard(rows, cols, mines, row, col);
        currentBoard = floodFill(currentBoard, row, col, rows, cols);
        setBoard(currentBoard);
        setGameState("playing");
        if (checkWin(currentBoard)) handleWin(currentBoard, 0);
        return;
      }

      if (gameState !== "playing") return;
      const idx = row * cols + col;
      const cell = currentBoard[idx];

      if (cell.status === "revealed" && cell.adjacentMines > 0 && !isFlag) {
        const neighbors = getNeighbors(row, col, rows, cols);
        const flagCount = neighbors.filter(
          ([nr, nc]) => currentBoard[nr * cols + nc].status === "flagged",
        ).length;
        if (flagCount === cell.adjacentMines) {
          let lost = false;
          for (const [nr, nc] of neighbors) {
            const ni = nr * cols + nc;
            if (currentBoard[ni].status === "hidden") {
              if (currentBoard[ni].isMine) {
                currentBoard[ni] = { ...currentBoard[ni], status: "exploded" };
                lost = true;
              } else if (currentBoard[ni].adjacentMines === 0) {
                currentBoard = floodFill(currentBoard, nr, nc, rows, cols);
              } else {
                currentBoard[ni] = { ...currentBoard[ni], status: "revealed" };
              }
            }
          }
          setBoard(currentBoard);
          if (lost) {
            handleLose(currentBoard);
            return;
          }
          if (checkWin(currentBoard)) handleWin(currentBoard, timer);
        }
        return;
      }

      if (cell.status === "flagged" && isFlag) {
        currentBoard[idx] = { ...currentBoard[idx], status: "hidden" };
        setBoard(currentBoard);
        setMinesLeft((m) => m + 1);
        return;
      }

      if (cell.status !== "hidden") return;

      if (isFlag) {
        currentBoard[idx] = { ...currentBoard[idx], status: "flagged" };
        setBoard(currentBoard);
        setMinesLeft((m) => m - 1);
        return;
      }

      if (cell.isMine) {
        currentBoard[idx] = { ...currentBoard[idx], status: "exploded" };
        setBoard(currentBoard);
        handleLose(currentBoard);
        return;
      }

      if (cell.adjacentMines === 0) {
        currentBoard = floodFill(currentBoard, row, col, rows, cols);
      } else {
        currentBoard[idx] = { ...currentBoard[idx], status: "revealed" };
      }
      setBoard(currentBoard);
      if (checkWin(currentBoard)) handleWin(currentBoard, timer);
    },
    [board, gameState, config, timer, user?.id, dailyPlays, playsLeft, handleWin, handleLose],
  );

  const handlePointerDown = useCallback((_row: number, _col: number, e: React.PointerEvent) => {
    pointerStartPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (row: number, col: number, e: React.PointerEvent) => {
      if (pointerStartPos.current) {
        const dx = Math.abs(e.clientX - pointerStartPos.current.x);
        const dy = Math.abs(e.clientY - pointerStartPos.current.y);
        if (dx > 8 || dy > 8) return;
      }
      handleCellAction(row, col, flagMode);
    },
    [handleCellAction, flagMode],
  );

  const handlePointerLeave = useCallback(() => {}, []);

  const rankFiltered = useMemo(() => {
    return rankAll
      .filter((e) => e.difficulty === rankDifficulty)
      .sort((a, b) => a.time - b.time)
      .slice(0, LEADERBOARD_MAX);
  }, [rankAll, rankDifficulty]);

  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const idx = rankFiltered.findIndex((e) => e.userId === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rankFiltered, user?.id]);

  const rankTop = showFullRank ? rankFiltered : rankFiltered.slice(0, LEADERBOARD_TOP);

  const gap = 1;
  const boardPixelW = cellSize * config.cols + gap * (config.cols - 1);
  const boardPixelH = cellSize * config.rows + gap * (config.rows - 1);

  if (isStaff) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Tính năng này không khả dụng cho tài khoản staff.
      </div>
    );
  }

  return (
    <PageContainer
      title="Dò mìn"
      subtitle="Tìm và đánh dấu tất cả bom"
      right={
        <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-700">
          <Coins className="h-4 w-4" />
          {coins}
        </div>
      }
    >
      <Tabs defaultValue="play" className="flex flex-col gap-3">
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="play" className="rounded-lg text-xs">
            Chơi
          </TabsTrigger>
          <TabsTrigger value="rank" className="rounded-lg text-xs">
            Xếp hạng
          </TabsTrigger>
        </TabsList>

        <TabsContent value="play" className="mt-0 flex flex-col gap-3">
          <div className="worker-game-layout">
            <aside className="worker-game-desktop-rail" aria-label="Chỉ số dò mìn">
              <div className="worker-game-rail-title">Chỉ số</div>
              <Card className="worker-game-stat">
                <div className="worker-game-stat-label">Thời gian</div>
                <div className="worker-game-stat-value">{formatTime(timer)}</div>
              </Card>
              <Card className="worker-game-stat">
                <div className="worker-game-stat-label">Số mìn</div>
                <div className="worker-game-stat-value">{minesLeft}</div>
              </Card>
              <Card className="worker-game-stat">
                <div className="worker-game-stat-label">Lượt còn lại</div>
                <div className="worker-game-stat-value">{playsLeft}</div>
              </Card>
              <Card className="worker-game-stat">
                <div className="worker-game-stat-label">Xu hôm nay</div>
                <div className="worker-game-stat-value">{dailyEarned}</div>
              </Card>
            </aside>
            <div className="worker-game-main flex flex-col gap-3">
              <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 -mx-4 space-y-2 bg-background px-4 pb-2 pt-1">
                <div className="flex gap-2">
                  {DIFFICULTIES.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={difficulty === d ? "default" : "outline"}
                      className="flex-1 text-xs"
                      onClick={() => startNewGame(d)}
                    >
                      {DIFFICULTY_CONFIG[d].label}
                    </Button>
                  ))}
                </div>

                <div className="worker-game-mobile-stats grid grid-cols-4 gap-2">
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">
                      <Clock className="mx-auto h-3 w-3" />
                    </div>
                    <div className="text-sm font-semibold">{formatTime(timer)}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">
                      <Bomb className="mx-auto h-3 w-3" />
                    </div>
                    <div className="text-sm font-semibold">{minesLeft}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">Lượt</div>
                    <div className="text-sm font-semibold">{playsLeft}</div>
                  </Card>
                  <Card className="p-2 text-center">
                    <div className="text-[10px] text-muted-foreground">Xu</div>
                    <div className="text-sm font-semibold">{dailyEarned}</div>
                  </Card>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={flagMode ? "default" : "outline"}
                    className={cn("gap-1 text-xs", flagMode && "bg-red-500 hover:bg-red-600")}
                    onClick={() => setFlagMode(!flagMode)}
                  >
                    <Flag className="h-3.5 w-3.5" /> {flagMode ? "Đang cắm cờ" : "Cắm cờ"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs"
                    onClick={() => startNewGame()}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Chơi lại
                  </Button>
                  {bestTimes[difficulty] !== null && (
                    <div className="ml-auto text-xs text-muted-foreground">
                      Kỷ lục: {formatTime(bestTimes[difficulty]!)}
                    </div>
                  )}
                </div>
              </div>
              <Card className="worker-game-board-card flex flex-col items-center gap-2 overflow-hidden p-3">
                <div
                  ref={boardContainerRef}
                  className="worker-game-board w-full select-none overflow-auto"
                  style={{ touchAction: "pan-x pan-y" }}
                >
                  <div
                    className="relative"
                    style={{ width: boardPixelW, height: boardPixelH, minWidth: boardPixelW }}
                  >
                    {(board.length > 0
                      ? board
                      : Array.from({ length: config.rows * config.cols }, (_, i) => ({
                          row: Math.floor(i / config.cols),
                          col: i % config.cols,
                          isMine: false,
                          adjacentMines: 0,
                          status: "hidden" as CellStatus,
                        }))
                    ).map((cell, i) => {
                      const left = cell.col * (cellSize + gap);
                      const top = cell.row * (cellSize + gap);
                      const isRevealed = cell.status === "revealed";
                      const isFlagged = cell.status === "flagged";
                      const isExploded = cell.status === "exploded";
                      const isMineRevealed = isRevealed && cell.isMine;

                      return (
                        <motion.button
                          key={i}
                          type="button"
                          className={cn(
                            "absolute grid place-items-center rounded-sm border text-xs font-bold",
                            !isRevealed &&
                              !isFlagged &&
                              !isExploded &&
                              "border-slate-400/50 bg-slate-300/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] active:bg-slate-400/80",
                            isRevealed && !isMineRevealed && "border-slate-200 bg-white/90",
                            isFlagged && "border-red-300 bg-slate-300/80",
                            isExploded && "border-red-500 bg-red-500",
                            isMineRevealed && "border-red-200 bg-red-100",
                          )}
                          style={{
                            width: cellSize,
                            height: cellSize,
                            left,
                            top,
                            fontSize: Math.max(10, cellSize * 0.4),
                          }}
                          onPointerDown={(e) => handlePointerDown(cell.row, cell.col, e)}
                          onPointerUp={(e) => handlePointerUp(cell.row, cell.col, e)}
                          onPointerLeave={handlePointerLeave}
                          initial={false}
                          animate={{
                            scale: isRevealed || isExploded ? [0.85, 1] : 1,
                            opacity: 1,
                          }}
                          transition={{ duration: 0.15 }}
                        >
                          {isFlagged && <Flag className="h-3.5 w-3.5 text-red-500" />}
                          {isExploded && <Bomb className="h-4 w-4 text-white" />}
                          {isMineRevealed && <Bomb className="h-3.5 w-3.5 text-red-600" />}
                          {isRevealed && !cell.isMine && cell.adjacentMines > 0 && (
                            <span className={NUMBER_COLORS[cell.adjacentMines] || ""}>
                              {cell.adjacentMines}
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {gameState === "won" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-green-50 px-4 py-2 text-center text-sm font-semibold text-green-700"
                  >
                    Chúc mừng! Bạn đã phá hết mìn trong {formatTime(timer)}
                  </motion.div>
                )}
                {gameState === "lost" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-700"
                  >
                    Thua rồi! Bấm "Chơi lại" để thử lần nữa.
                  </motion.div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="rank" className="mt-0 flex flex-col gap-3">
          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">Thời gian nhanh nhất</div>
              </div>
              {rankFiltered.length > LEADERBOARD_TOP && (
                <Button size="sm" variant="ghost" onClick={() => setShowFullRank(!showFullRank)}>
                  {showFullRank ? "Thu gọn" : "Xem top " + LEADERBOARD_MAX}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={rankDifficulty === d ? "default" : "outline"}
                  className="flex-1 text-xs"
                  onClick={() => {
                    setRankDifficulty(d);
                    setShowFullRank(false);
                  }}
                >
                  {DIFFICULTY_CONFIG[d].label}
                </Button>
              ))}
            </div>
            {rankTop.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Chưa có ai hoàn thành mức này
              </div>
            ) : (
              rankTop.map((item, index) => (
                <div
                  key={item.userId}
                  className={cn(
                    "flex items-center justify-between rounded-2xl border p-3",
                    item.userId === user?.id && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                      {index === 0 ? (
                        <Crown className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{item.name}</div>
                    </div>
                  </div>
                  <StatusChip tone="success">{formatTime(item.time)}</StatusChip>
                </div>
              ))
            )}
            <div className="rounded-2xl border border-dashed p-3 text-center">
              <div className="text-[11px] text-muted-foreground">Thứ hạng của bạn</div>
              <div className="mt-1 text-sm font-semibold">
                {myRank
                  ? "#" + myRank + " - " + formatTime(bestTimes[rankDifficulty] ?? 0)
                  : "Chưa có hạng"}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
