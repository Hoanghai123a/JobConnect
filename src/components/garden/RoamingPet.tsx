import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { getSeen } from "@/lib/seen";
import {
  happiness,
  hunger,
  loadGarden,
  onGardenChange,
  petById,
  petMood,
  pickReaction,
  pickSpeech,
  type GardenState,
  type PetContext,
  type PetSpeech,
} from "@/lib/garden";

const SPEAK_INTERVAL_MS = 10000;
const SPEAK_DURATION_MS = 2000;
const REACT_INTERVAL_MS = 4500;

const NAV_SAFE_PX = 96;
const PET_SIZE = 56;

// Tốc độ đi (px/giây) theo từng tâm trạng.
const SPEED_PX_PER_S: Record<"great" | "ok" | "sad", number> = {
  great: 22,
  ok: 14,
  sad: 7,
};
// Khoảng ngắn nghỉ giữa hai chặng đi.
const PAUSE_MS: Record<"great" | "ok" | "sad", number> = {
  great: 150,
  ok: 400,
  sad: 1500,
};
const MIN_LEG_DISTANCE_PX = 50;

export function RoamingPet() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  const [garden, setGarden] = useState<GardenState | null>(null);
  const [speech, setSpeech] = useState<PetSpeech | null>(null);
  const [reaction, setReaction] = useState<{ emoji: string; key: number } | null>(null);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [glide, setGlide] = useState(false);
  const [moving, setMoving] = useState(false);
  const [mood, setMood] = useState<"great" | "ok" | "sad">("great");
  const [spriteFailed, setSpriteFailed] = useState(false);
  const moveEndTimer = useRef<number | null>(null);
  const ctxRef = useRef<PetContext>({ needsAttendance: false, unreadNews: 0 });
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const seedRef = useRef(1);
  const wanderTimer = useRef<number | null>(null);
  const speakTimer = useRef<number | null>(null);
  const speechHideTimer = useRef<number | null>(null);
  const reactTimer = useRef<number | null>(null);
  const reactHideTimer = useRef<number | null>(null);
  const userId = user?.id ?? "";
  const employeeCode = user?.employee_code?.trim() ?? "";
  const company = user?.company?.trim() ?? "";

  // Tải state + theo dõi thay đổi từ trang vườn.
  useEffect(() => {
    if (!userId) return;
    const sync = () => setGarden(loadGarden(userId));
    sync();
    return onGardenChange(sync);
  }, [userId]);

  // Lấy ngữ cảnh (chấm công hôm nay, tin mới) để thú cưng nhắc đúng việc.
  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const refresh = async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayKey = `${yyyy}-${mm}-${dd}`;

      const hasEmployment = Boolean(employeeCode && company);

      const [attCount, newsCount] = await Promise.all([
        hasEmployment
          ? pb
              .collection("attendance")
              .getList(1, 1, { filter: `user="${userId}" && date="${todayKey}"` })
              .then((r) => r.totalItems)
              .catch(() => 1)
          : Promise.resolve(1),
        (async () => {
          const seen = getSeen("news", userId);
          const seenIso = seen ? new Date(seen).toISOString().replace("T", " ") : "";
          const filter = ["is_active = true", seenIso ? `created > "${seenIso}"` : ""]
            .filter(Boolean)
            .join(" && ");
          return pb
            .collection("recruitments")
            .getList(1, 1, { filter })
            .then((r) => r.totalItems)
            .catch(() => 0);
        })(),
      ]);

      if (!alive) return;
      ctxRef.current = {
        needsAttendance: hasEmployment && attCount === 0,
        unreadNews: newsCount,
      };
    };

    refresh();
    const id = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [company, employeeCode, userId]);

  const isStaff = user?.role === "staff";
  const enabled = Boolean(userId) && !loading && !isStaff && garden?.roamingEnabled !== false;
  const starving = garden ? hunger(garden.pet) <= 0 : false;

  const glideDurationRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let alive = true;

    const bounds = () => {
      const w = Math.min(window.innerWidth, 480);
      const offsetLeft = Math.max(0, (window.innerWidth - w) / 2);
      const maxX = offsetLeft + w - PET_SIZE - 12;
      const y = window.innerHeight - NAV_SAFE_PX - PET_SIZE;
      return { offsetLeft, maxX, y };
    };

    const currentPet = () => petById(loadGarden(userId).pet.id);

    const planLeg = () => {
      if (!alive) return;
      const { offsetLeft, maxX, y } = bounds();
      seedRef.current = (seedRef.current * 9301 + 49297) % 233280;
      const r = seedRef.current / 233280;

      const current = loadGarden(userId);
      const currentMood = petMood(current.pet);
      setMood(currentMood);

      // Tốc độ tỉ lệ thuận với no bụng; 0% = đứng yên
      const hungerLevel = hunger(current.pet);
      if (hungerLevel <= 0) {
        setMoving(false);
        wanderTimer.current = window.setTimeout(planLeg, 2000);
        return;
      }

      const baseSpeed = SPEED_PX_PER_S[currentMood];
      const speed = baseSpeed * hungerLevel;

      const span = (maxX - offsetLeft - 12) * (currentMood === "sad" ? 0.35 : hungerLevel);
      const minX = offsetLeft + 12;
      const maxRight = offsetLeft + 12 + (maxX - offsetLeft - 12);
      const cur = posRef.current.x;
      let targetX = cur + (r - 0.5) * span * 2;
      targetX = Math.max(minX, Math.min(maxRight, targetX));

      const distance = Math.abs(targetX - cur);
      if (distance < MIN_LEG_DISTANCE_PX) {
        const dir = cur < (minX + maxRight) / 2 ? 1 : -1;
        targetX = Math.max(minX, Math.min(maxRight, cur + dir * MIN_LEG_DISTANCE_PX));
      }
      const finalDist = Math.abs(targetX - cur);
      const duration = (finalDist / speed) * 1000;

      const facesRight = currentPet().facesRight ?? false;
      const movingRight = targetX > cur;
      setFacing(movingRight === facesRight ? 1 : -1);

      glideDurationRef.current = duration;
      posRef.current = { x: targetX, y };
      setGlide(true);
      setMoving(true);
      setPos({ x: targetX, y });

      if (moveEndTimer.current) window.clearTimeout(moveEndTimer.current);
      moveEndTimer.current = window.setTimeout(() => {
        if (!alive) return;
        setMoving(false);
        wanderTimer.current = window.setTimeout(planLeg, PAUSE_MS[currentMood]);
      }, duration);
    };

    const { offsetLeft, maxX, y } = bounds();
    const startX = offsetLeft + (maxX - offsetLeft) * 0.5;
    posRef.current = { x: startX, y };
    glideDurationRef.current = 0;
    setGlide(false);
    setPos({ x: startX, y });
    wanderTimer.current = window.setTimeout(planLeg, 800);

    return () => {
      alive = false;
      if (wanderTimer.current) window.clearTimeout(wanderTimer.current);
      if (moveEndTimer.current) window.clearTimeout(moveEndTimer.current);
    };
  }, [enabled, userId]);

  // Vòng lặp nói chuyện.
  useEffect(() => {
    if (!enabled || !garden) return;
    let alive = true;

    const speakOnce = () => {
      if (!alive) return;
      seedRef.current = (seedRef.current * 1103515245 + 12345) & 0x7fffffff;
      const current = loadGarden(userId);

      const starving = hunger(current.pet) <= 0;
      const lonely = happiness(current.pet) <= 0;
      if (starving || lonely) {
        const lines = starving && lonely
          ? [
              "Chủ nhân ơi, mình đói và buồn quá...",
              "Mình kiệt sức rồi, chủ nhân ghé chăm mình với!",
            ]
          : starving
            ? [
                "Chủ nhân ơi, cho mình ăn với, đói lả rồi...",
                "Bụng mình kêu to lắm rồi chủ nhân ơi...",
              ]
            : [
                "Chủ nhân ơi, chơi với mình một chút đi...",
                "Lâu quá rồi chủ nhân không vuốt ve mình...",
              ];
        const text = lines[Math.abs(seedRef.current) % lines.length];
        const tone = starving ? "hungry" : "sad";
        setSpeech({ text, tone });
        if (speechHideTimer.current) window.clearTimeout(speechHideTimer.current);
        speakTimer.current = window.setTimeout(speakOnce, 4000);
        return;
      }

      const line = pickSpeech(current, seedRef.current, ctxRef.current);
      setSpeech(line);
      if (speechHideTimer.current) window.clearTimeout(speechHideTimer.current);
      speechHideTimer.current = window.setTimeout(
        () => alive && setSpeech(null),
        SPEAK_DURATION_MS,
      );

      speakTimer.current = window.setTimeout(speakOnce, SPEAK_INTERVAL_MS);
    };

    speakOnce();
    return () => {
      alive = false;
      if (speakTimer.current) window.clearTimeout(speakTimer.current);
      if (speechHideTimer.current) window.clearTimeout(speechHideTimer.current);
    };
  }, [enabled, garden, userId]);

  useEffect(() => {
    if (!enabled || !garden) return;
    let alive = true;

    const reactOnce = () => {
      if (!alive) return;
      seedRef.current = (seedRef.current * 22695477 + 1) & 0x7fffffff;
      const current = loadGarden(userId);
      const emoji = pickReaction(current, seedRef.current, ctxRef.current);
      setReaction({ emoji, key: seedRef.current });
      if (reactHideTimer.current) window.clearTimeout(reactHideTimer.current);
      reactHideTimer.current = window.setTimeout(() => alive && setReaction(null), 1800);
      reactTimer.current = window.setTimeout(reactOnce, REACT_INTERVAL_MS);
    };

    reactTimer.current = window.setTimeout(reactOnce, 3000);
    return () => {
      alive = false;
      if (reactTimer.current) window.clearTimeout(reactTimer.current);
      if (reactHideTimer.current) window.clearTimeout(reactHideTimer.current);
    };
  }, [enabled, garden, userId]);


  if (!enabled || !garden || !pos) return null;

  const pet = petById(garden.pet.id);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-30"
      style={{
        width: PET_SIZE,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: glide && glideDurationRef.current > 0
          ? `transform ${glideDurationRef.current}ms linear`
          : "none",
      }}
    >
      <div className="pointer-events-auto relative flex flex-col items-center">
        {speech && (
          <div className="absolute bottom-full left-1/2 mb-1 w-max max-w-[170px] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-border/60 bg-card px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-foreground shadow-soft">
            {speech.text}
            <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border/60 bg-card" />
          </div>
        )}
        <button
          type="button"
          onClick={() => nav({ to: "/garden" })}
          aria-label={`Mở vườn của ${garden.pet.name}`}
          className="relative grid h-12 w-12 place-items-center text-3xl transition active:scale-90"
        >
          {reaction && (
            <span
              key={reaction.key}
              className="pet-reaction pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-xl"
            >
              {reaction.emoji}
            </span>
          )}
          <span
            className="pet-face inline-block"
            style={{ transform: `scaleX(${facing})` }}
          >
            {starving && pet.sleepSprite ? (
              <img
                src={pet.sleepSprite}
                alt={pet.name}
                style={{
                  width: pet.frameSize ?? 40,
                  height: Math.round((pet.frameSize ?? 40) * 0.82),
                  imageRendering: "pixelated",
                  objectFit: "contain",
                }}
                className="pet-rest inline-block max-w-full"
              />
            ) : pet.sprite && !spriteFailed ? (
              <div
                className="pet-sprite"
                style={{
                  width: pet.frameSize ?? 40,
                  height: pet.frameSize ?? 40,
                  backgroundImage: `url(${pet.sprite})`,
                  backgroundSize: `${(pet.frameSize ?? 40) * 4}px ${pet.frameSize ?? 40}px`,
                  animationDuration: moving
                    ? mood === "great" ? "0.4s" : mood === "ok" ? "0.6s" : "1s"
                    : "0s",
                }}
                onAnimationIteration={() => {}}
              >
                <img
                  src={pet.sprite}
                  alt=""
                  className="invisible h-0 w-0"
                  onError={() => setSpriteFailed(true)}
                />
              </div>
            ) : (
              <span
                className={
                  moving
                    ? "pet-walk inline-block"
                    : mood === "sad"
                      ? "pet-rest inline-block"
                      : "pet-bob inline-block"
                }
              >
                {pet.emoji}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
