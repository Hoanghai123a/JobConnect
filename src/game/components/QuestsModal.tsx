import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListTodo, CheckCircle2, Gift } from "lucide-react";
import { useGameStore } from "../stores/gameStore";
import { QuestService } from "../services/questService";
import { AudioService } from "../services/audioService";
import { toast } from "sonner";

interface QuestsModalProps {
  open: boolean;
  onClose: () => void;
}

export const QuestsModal = ({ open, onClose }: QuestsModalProps) => {
  const { quests } = useGameStore();

  const handleClaim = (questId: string) => {
    const result = QuestService.claimQuest(questId);

    if (result.success && result.rewards) {
      toast.success(`Đã nhận thưởng! +${result.rewards.coins} xu, +${result.rewards.exp} XP`);
      AudioService.play("questComplete");
    } else {
      toast.error(result.error || "Không thể nhận thưởng");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <ListTodo className="w-6 h-6" />
            Nhiệm vụ hàng ngày
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {quests.map((quest) => {
            const completed = quest.progress >= quest.target;
            const progressPercent = Math.min((quest.progress / quest.target) * 100, 100);

            return (
              <div
                key={quest.id}
                className={`border rounded-lg p-4 transition-colors ${
                  quest.claimed
                    ? "bg-gray-100 opacity-60"
                    : completed
                      ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300"
                      : "bg-gradient-to-br from-white to-gray-50"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                      {quest.title}
                      {quest.claimed && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                          Đã nhận
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{quest.description}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Tiến độ: {quest.progress} / {quest.target}
                    </p>
                  </div>
                  {completed && !quest.claimed && (
                    <CheckCircle2 className="w-5 h-5 text-green-600 animate-pulse" />
                  )}
                </div>

                <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all ${
                      completed
                        ? "bg-gradient-to-r from-green-500 to-emerald-500"
                        : "bg-gradient-to-r from-blue-500 to-cyan-500"
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600">Phần thưởng:</span>
                    <span className="font-semibold text-yellow-700">🪙 {quest.reward.coins}</span>
                    <span className="font-semibold text-blue-700">⭐ {quest.reward.exp} XP</span>
                  </div>

                  {completed && !quest.claimed && (
                    <Button size="sm" onClick={() => handleClaim(quest.id)} className="gap-1">
                      <Gift className="w-4 h-4" />
                      Nhận thưởng
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {quests.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <ListTodo className="w-16 h-16 mx-auto mb-3 text-gray-300" />
            <p>Không có nhiệm vụ</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
