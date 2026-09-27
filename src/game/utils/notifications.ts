import { toast } from "sonner";

export const showLevelUpNotification = (
  newLevel: number,
  unlockedFeatures: { crops: string[]; plots: number },
) => {
  const message = `Level ${newLevel}!`;
  const description = [];

  if (unlockedFeatures.plots > 0) {
    description.push(`+${unlockedFeatures.plots} plots`);
  }

  if (unlockedFeatures.crops.length > 0) {
    description.push(`Unlocked: ${unlockedFeatures.crops.map((c) => c).join(", ")}`);
  }

  toast.success(message, {
    description: description.join(" • "),
    duration: 4000,
  });
};
