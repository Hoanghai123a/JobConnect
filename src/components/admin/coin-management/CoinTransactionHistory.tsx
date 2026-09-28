import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getCoinTransactionHistory, type CoinTransaction } from "@/lib/coin-management";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ArrowUp, ArrowDown, History } from "lucide-react";

interface CoinTransactionHistoryProps {
  userId: string;
  days?: number;
  refreshTrigger?: number;
}

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  admin_add: "Admin cộng xu",
  admin_subtract: "Admin trừ xu",
  referral: "Giới thiệu",
  checkin: "Điểm danh",
  reward: "Đổi quà",
  exchange: "Trao đổi",
  game: "Game",
};

export function CoinTransactionHistory({
  userId,
  days = 7,
  refreshTrigger,
}: CoinTransactionHistoryProps) {
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [userId, days, refreshTrigger]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getCoinTransactionHistory(userId, days);
      setTransactions(data);
    } catch (error) {
      console.error("Error loading transaction history:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DataLoadingState message="Đang tải lịch sử giao dịch..." />;
  }

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-blue-600" />
          Lịch sử {days} ngày gần đây
        </h3>

        {transactions.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Chưa có giao dịch nào trong {days} ngày qua
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Số xu</TableHead>
                  <TableHead className="text-right">Số dư sau</TableHead>
                  <TableHead>Lý do</TableHead>
                  <TableHead>Admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {formatDistanceToNow(new Date(tx.created), {
                        addSuffix: true,
                        locale: vi,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {TRANSACTION_TYPE_LABELS[tx.transaction_type] ||
                          tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className={`flex items-center justify-end gap-1 font-semibold ${
                          tx.amount > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {tx.amount > 0 ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )}
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount.toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {tx.balance_after.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {tx.reason || "-"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {tx.expand?.admin_id?.full_name || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  );
}
