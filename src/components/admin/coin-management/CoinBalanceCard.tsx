import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Coins, TrendingUp, Calendar } from "lucide-react";
import { getUserCoinBalance, type GardenBalance } from "@/lib/coin-management";

interface CoinBalanceCardProps {
  userId: string;
  onEdit: () => void;
  refreshTrigger?: number;
}

export function CoinBalanceCard({ userId, onEdit, refreshTrigger }: CoinBalanceCardProps) {
  const [balance, setBalance] = useState<GardenBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBalance();
  }, [userId, refreshTrigger]);

  const loadBalance = async () => {
    setLoading(true);
    try {
      const data = await getUserCoinBalance(userId);
      setBalance(data);
    } catch (error) {
      console.error("Error loading balance:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DataLoadingState message="Đang tải thông tin xu..." />;
  }

  if (!balance) {
    return (
      <Card className="p-4">
        <div className="text-center text-muted-foreground">
          User chưa có thông tin xu
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-600" />
            Số xu hiện tại
          </h3>
          <Button onClick={onEdit} size="sm">
            Chỉnh sửa xu
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Coins className="h-3.5 w-3.5" />
              Tổng xu
            </div>
            <div className="text-2xl font-bold text-amber-600">
              {balance.coins.toLocaleString()}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Từ giới thiệu
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {(balance.referral_coins_total || 0).toLocaleString()}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Từ điểm danh
            </div>
            <div className="text-2xl font-bold text-green-600">
              {(balance.checkin_coins_total || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
