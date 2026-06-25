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

const WANDER_MIN_MS = 6000;
const WANDER_MAX_MS = 11000;
const GLIDE_DURATION_MS = 2600;
const SPEAK_INTERVAL_MS = 10000;
const SPEAK_DURATION_MS = 1000;
const REACT_INTERVAL_MS = 4500;

const NAV_SAFE_PX = 96;
const PET_SIZE = 56;

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
  const moveEndTimer = useRef<number | null>(null);
  const ctxRef = useRef<PetContext>({ needsAttendance: false, unreadNews: 0 });
  const posRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const seedRef = useRef(1);
  const wanderTimer = useRef<number | null>(null);
  const speakTimer = useRef<number | null>(null);
  const speechHideTimer = useRef<number | null>(null);
  const reactTimer = useRef<number | null>(null);
  const reactHideTimer = useRef<number | null>(null);

  // Tải state + theo dõi thay đổi từ trang vườn.
  useEffect(() => {
    if (!user?.id) return;
    const sync = () => setGarden(loadGarden(user.id));
    sync();
    return onGardenChange(sync);
  }, [user?.id]);

  // Lấy ngữ cảnh (chấm công hôm nay, tin mới) để thú cưng nhắc đúng việc.
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const refresh = async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const todayKey = `${yyyy}-${mm}-${dd}`;

      const hasEmployment = Boolean(
        (user as any)?.employee_code?.trim() && (user as any)?.company?.trim(),
      );

      const [attCount, newsCount] = await Promise.all([
        hasEmployment
          ? pb
              .collection("attendance")
              .getList(1, 1, { filter: `user="${user.id}" && date="${todayKey}"` })
              .then((r) => r.totalItems)
              .catch(() => 1)
          : Promise.resolve(1),
        (async () => {
          const seen = getSeen("news", user.id);
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
  }, [user?.id]);

  const enabled = Boolean(user?.id) && !loading && garden?.roamingEnabled !== false;

  // Vòng lặp đi lang thang (dùng CSS transition, không cần framer-motion).
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

    const step = () => {
      if (!alive) return;
      const { offsetLeft, maxX, y } = bounds();
      seedRef.current = (seedRef.current * 9301 + 49297) % 233280;
      const r = seedRef.current / 233280;
      const r2 = ((seedRef.current >> 3) % 1000) / 1000;

      const current = loadGarden(user!.id);
      const currentMood = petMood(current.pet);
      setMood(currentMood);
      const moodFactor = currentMood === "great" ? 1 : currentMood === "ok" ? 1.8 : 3;
      const skipMove = currentMood === "sad" && r > 0.4;

      let nextDelay = WANDER_MIN_MS + Math.floor(r2 * (WANDER_MAX_MS - WANDER_MIN_MS));
      nextDelay = Math.floor(nextDelay * moodFactor);

      if (!skipMove) {
        const range = mood === "sad" ? 0.3 : 1;
        const span = (maxX - offsetLeft - 12) * range;
        const center = posRef.current.x;
        const targetX = Math.max(
          offsetLeft + 12,
          Math.min(offsetLeft + 12 + (maxX - offsetLeft - 12), center + (r - 0.5) * span * 2),
        );

        setFacing(targetX >= posRef.current.x ? -1 : 1);
        posRef.current = { x: targetX, y };
        setGlide(true);
        setMoving(true);
        setPos({ x: targetX, y });

        if (moveEndTimer.current) window.clearTimeout(moveEndTimer.current);
        moveEndTimer.current = window.setTimeout(() => setMoving(false), GLIDE_DURATION_MS);
      }

      wanderTimer.current = window.setTimeout(step, nextDelay);
    };

    const { offsetLeft, maxX, y } = bounds();
    const startX = offsetLeft + (maxX - offsetLeft) * 0.5;
    posRef.current = { x: startX, y };
    setGlide(false);
    setPos({ x: startX, y });
    wanderTimer.current = window.setTimeout(step, 1500);

    return () => {
      alive = false;
      if (wanderTimer.current) window.clearTimeout(wanderTimer.current);
    };
  }, [enabled]);

  // Vòng lặp nói chuyện.
  useEffect(() => {
    if (!enabled || !garden) return;
    let alive = true;

    const speakOnce = () => {
      if (!alive) return;
      seedRef.current = (seedRef.current * 1103515245 + 12345) & 0x7fffffff;
      const current = loadGarden(user!.id);

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
  }, [enabled, garden, user]);

  useEffect(() => {
    if (!enabled || !garden) return;
    let alive = true;

    const reactOnce = () => {
      if (!alive) return;
      seedRef.current = (seedRef.current * 22695477 + 1) & 0x7fffffff;
      const current = loadGarden(user!.id);
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
  }, [enabled, garden, user]);

  if (!enabled || !garden || !pos) return null;

  const pet = petById(garden.pet.id);

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-30"
      style={{
        width: PET_SIZE,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: glide ? "transform 2.6s ease-in-out" : "none",
      }}
    >
      <div className="pointer-events-auto flex flex-col items-center">
        {speech && (
          <div className="relative mb-1 max-w-[170px] animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-border/60 bg-card px-3 py-1.5 text-center text-[11px] font-medium leading-snug text-foreground shadow-soft">
            {speech.text}
            <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-border/60 bg-card" />
          </div>
        )}
        <button
          type="button"
          onClick={() => nav({ to: "/garden" })}
          aria-label={`Mở vườn của ${garden.pet.name}`}
          className="relative grid h-12 w-12 place-items-center rounded-full bg-card/80 text-3xl shadow-soft backdrop-blur transition active:scale-90"
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
          </span>
        </button>
      </div>
    </div>
  );
}
