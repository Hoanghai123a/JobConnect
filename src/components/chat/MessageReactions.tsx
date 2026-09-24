import { useMessageReactions, REACTION_EMOJIS, type ReactionSummary } from "@/lib/use-message-reactions";
import type { UserRecord } from "@/lib/pocketbase";
import { cn } from "@/lib/utils";

export function MessageReactions({
  messageId,
  viewer,
  isGuest,
  mine,
}: {
  messageId: string;
  viewer: UserRecord | null;
  isGuest: boolean;
  mine: boolean;
}) {
  const { addReaction, getReactionSummary } = useMessageReactions({
    viewer,
    messageId,
    isGuest,
  });

  const summary = getReactionSummary();

  if (summary.length === 0 && isGuest) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {summary.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => void addReaction(reaction.emoji)}
          disabled={isGuest}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
            reaction.hasMyReaction
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-foreground hover:bg-muted",
            isGuest && "opacity-50 cursor-not-allowed",
          )}
          title={
            reaction.hasMyReaction
              ? "Bỏ reaction"
              : isGuest
                ? "Đăng nhập để react"
                : "Thêm reaction"
          }
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}

export function ReactionPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-2 shadow-lg">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-xl transition hover:bg-muted"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
