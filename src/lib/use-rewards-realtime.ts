import { useEffect } from "react";
import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";

export function useRewardsRealtime(params: {
  viewer: UserRecord | null;
  onRedemptionChanged?: () => void;
  onRewardChanged?: () => void;
}) {
  const { viewer, onRedemptionChanged, onRewardChanged } = params;

  useEffect(() => {
    if (!viewer) return;

    const unsubscribers: Array<() => void> = [];

    // Subscribe to reward_redemptions changes
    pb.collection("reward_redemptions")
      .subscribe("*", (event) => {
        const redemption = event.record as any;

        // Dispatch custom event để các component khác có thể listen
        window.dispatchEvent(
          new CustomEvent("jobconnect:reward-redemption-changed", {
            detail: {
              collection: "reward_redemptions",
              action: event.action,
              record: redemption,
              userId: redemption.user,
              status: redemption.status,
            },
          }),
        );

        // Trigger callback
        onRedemptionChanged?.();
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to reward redemptions:", err);
      });

    // Subscribe to rewards changes (admin có thể cập nhật rewards)
    pb.collection("rewards")
      .subscribe("*", (event) => {
        window.dispatchEvent(
          new CustomEvent("jobconnect:reward-changed", {
            detail: {
              collection: "rewards",
              action: event.action,
              record: event.record,
            },
          }),
        );

        // Trigger callback
        onRewardChanged?.();
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to rewards:", err);
      });

    // Subscribe to garden_balances changes (để update coin balance realtime)
    pb.collection("garden_balances")
      .subscribe("*", (event) => {
        const balance = event.record as any;

        // Chỉ dispatch nếu là user hiện tại
        if (balance.user === viewer.id) {
          window.dispatchEvent(
            new CustomEvent("jobconnect:coin-balance-changed", {
              detail: {
                collection: "garden_balances",
                action: event.action,
                record: balance,
                coins: balance.coins,
              },
            }),
          );
        }
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to garden balances:", err);
      });

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [viewer?.id, onRedemptionChanged, onRewardChanged]);
}
