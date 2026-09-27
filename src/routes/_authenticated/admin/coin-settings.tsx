import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { toast } from "@/lib/toast";
import { Coins, Users, Calendar, Gift, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/coin-settings")({
  component: CoinSettingsPage,
});

type CoinSetting = {
  id: string;
  key: string;
  value: number;
  description: string;
};

const DEFAULT_SETTINGS = [
  {
    key: "referral_signup",
    description: "Xu thưởng cho người giới thiệu khi bạn bè đăng ký",
    defaultValue: 50,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_referee_bonus",
    description: "Xu thưởng cho người được giới thiệu khi đăng ký",
    defaultValue: 30,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_first_advance",
    description: "Xu thưởng khi bạn bè hoàn thành ứng lương đầu tiên",
    defaultValue: 100,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_milestone_5",
    description: "Xu thưởng khi đạt mốc 5 người giới thiệu thành công",
    defaultValue: 250,
    icon: Users,
    category: "referral",
  },
  {
    key: "referral_milestone_10",
    description: "Xu thưởng khi đạt mốc 10 người giới thiệu thành công",
    defaultValue: 750,
    icon: Users,
    category: "referral",
  },
  {
    key: "daily_checkin_base",
    description: "Xu thưởng cho mỗi lần điểm danh hàng ngày",
    defaultValue: 5,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "weekly_checkin_perfect",
    description: "Xu thưởng khi hoàn thành điểm danh đủ 7 ngày trong tuần",
    defaultValue: 50,
    icon: Calendar,
    category: "checkin",
  },
];

function CoinSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, number>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const records = await pb.collection("coin_settings").getFullList<CoinSetting>();

      const settingsMap: Record<string, number> = {};
      for (const setting of DEFAULT_SETTINGS) {
        const record = records.find((r) => r.key === setting.key);
        settingsMap[setting.key] = record?.value ?? setting.defaultValue;
      }

      setSettings(settingsMap);
    } catch (error) {
      console.error("Error loading coin settings:", error);
      toast.error("Không thể tải cài đặt xu");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Lưu từng setting
      for (const setting of DEFAULT_SETTINGS) {
        const value = settings[setting.key];

        try {
          // Thử tìm record hiện tại
          const existing = await pb
            .collection("coin_settings")
            .getFirstListItem(`key = "${setting.key}"`)
            .catch(() => null);

          if (existing) {
            // Update
            await pb.collection("coin_settings").update(existing.id, {
              value,
              description: setting.description,
            });
          } else {
            // Create
            await pb.collection("coin_settings").create({
              key: setting.key,
              value,
              description: setting.description,
            });
          }
        } catch (error) {
          console.error(`Error saving ${setting.key}:`, error);
          throw error;
        }
      }

      toast.success("Đã lưu cài đặt xu thành công");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Không thể lưu cài đặt");
    } finally {
      setSaving(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setSettings((prev) => ({ ...prev, [key]: numValue }));
  };

  if (loading) {
    return (
      <div>
        <AppHeader title="Cài đặt xu" back />
        <DataLoadingState message="Đang tải cài đặt..." />
      </div>
    );
  }

  const referralSettings = DEFAULT_SETTINGS.filter((s) => s.category === "referral");
  const checkinSettings = DEFAULT_SETTINGS.filter((s) => s.category === "checkin");

  return (
    <div className="pb-nav">
      <AppHeader title="Cài đặt xu" back />

      <div className="space-y-6 p-4">
        {/* Giới thiệu */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Hệ thống giới thiệu
            </CardTitle>
            <CardDescription>Cài đặt xu thưởng cho người giới thiệu và người được giới thiệu</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {referralSettings.map((setting) => (
              <div key={setting.key} className="space-y-2">
                <Label htmlFor={setting.key} className="text-sm">
                  {setting.description}
                </Label>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-600" />
                  <Input
                    id={setting.key}
                    type="number"
                    min="0"
                    value={settings[setting.key] ?? setting.defaultValue}
                    onChange={(e) => handleValueChange(setting.key, e.target.value)}
                    className="max-w-[200px]"
                  />
                  <span className="text-sm text-muted-foreground">xu</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Điểm danh */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-600" />
              Hệ thống điểm danh
            </CardTitle>
            <CardDescription>Cài đặt xu thưởng cho điểm danh hàng ngày và tuần</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {checkinSettings.map((setting) => (
              <div key={setting.key} className="space-y-2">
                <Label htmlFor={setting.key} className="text-sm">
                  {setting.description}
                </Label>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-600" />
                  <Input
                    id={setting.key}
                    type="number"
                    min="0"
                    value={settings[setting.key] ?? setting.defaultValue}
                    onChange={(e) => handleValueChange(setting.key, e.target.value)}
                    className="max-w-[200px]"
                  />
                  <span className="text-sm text-muted-foreground">xu</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Lưu */}
        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1"
            size="lg"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu cài đặt"}
          </Button>
          <Button
            onClick={loadSettings}
            disabled={saving}
            variant="outline"
            size="lg"
          >
            Hủy
          </Button>
        </div>
      </div>
    </div>
  );
}
