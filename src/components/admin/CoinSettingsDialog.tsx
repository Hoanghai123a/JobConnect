import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { toast } from "@/lib/toast";
import { Coins, Users, Calendar, Save } from "lucide-react";

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
    key: "daily_checkin_mode",
    description: "Chế độ tính xu điểm danh hàng ngày",
    defaultValue: 0, // 0 = cố định, 1 = ngẫu nhiên
    icon: Calendar,
    category: "checkin",
    isMode: true,
  },
  {
    key: "daily_checkin_base",
    description: "Xu cố định cho mỗi lần điểm danh hàng ngày",
    defaultValue: 5,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "daily_checkin_min",
    description: "Xu tối thiểu khi điểm danh ngẫu nhiên",
    defaultValue: 3,
    icon: Calendar,
    category: "checkin",
  },
  {
    key: "daily_checkin_max",
    description: "Xu tối đa khi điểm danh ngẫu nhiên",
    defaultValue: 10,
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

type CoinSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CoinSettingsDialog({ open, onOpenChange }: CoinSettingsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, number>>({});
  const [checkinMode, setCheckinMode] = useState<"fixed" | "random">("fixed");

  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const records = await pb.collection("coin_settings").getFullList<any>();

      const settingsMap: Record<string, number> = {};
      for (const setting of DEFAULT_SETTINGS) {
        const record = records.find((r) => r.setting_key === setting.key);
        settingsMap[setting.key] = record?.coin_amount ?? setting.defaultValue;
      }

      setSettings(settingsMap);

      // Set checkin mode based on daily_checkin_mode value
      const mode = settingsMap["daily_checkin_mode"] ?? 0;
      setCheckinMode(mode === 1 ? "random" : "fixed");
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
      // Update daily_checkin_mode based on selected mode
      const updatedSettings = {
        ...settings,
        daily_checkin_mode: checkinMode === "random" ? 1 : 0,
      };

      for (const setting of DEFAULT_SETTINGS) {
        const value = updatedSettings[setting.key];

        try {
          const existing = await pb
            .collection("coin_settings")
            .getFirstListItem(`setting_key = "${setting.key}"`)
            .catch(() => null);

          if (existing) {
            await pb.collection("coin_settings").update(existing.id, {
              coin_amount: value,
              description: setting.description,
            });
          } else {
            await pb.collection("coin_settings").create({
              setting_key: setting.key,
              coin_amount: value,
              description: setting.description,
              category: setting.category,
              active: true,
            });
          }
        } catch (error) {
          console.error(`Error saving ${setting.key}:`, error);
          throw error;
        }
      }

      toast.success("Đã lưu cài đặt xu thành công");
      onOpenChange(false);
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

  const referralSettings = DEFAULT_SETTINGS.filter((s) => s.category === "referral");
  const checkinSettings = DEFAULT_SETTINGS.filter((s) => s.category === "checkin");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col p-0 gap-0">
        <div className="px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle>Cài đặt xu</DialogTitle>
            <DialogDescription>
              Cài đặt mức xu thưởng cho hệ thống giới thiệu và điểm danh
            </DialogDescription>
          </DialogHeader>
        </div>

        {loading ? (
          <div className="px-6 py-4">
            <DataLoadingState message="Đang tải cài đặt..." />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 min-h-0">
            <div className="space-y-6 pb-4">
              {/* Giới thiệu */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold text-sm">
                  <Users className="h-4 w-4 text-blue-600" />
                  Hệ thống giới thiệu
                </h3>
                <div className="space-y-3">
                  {referralSettings.map((setting) => (
                    <div key={setting.key} className="space-y-1.5">
                      <Label htmlFor={setting.key} className="text-xs text-muted-foreground">
                        {setting.description}
                      </Label>
                      <div className="flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <Input
                          id={setting.key}
                          type="number"
                          min="0"
                          value={settings[setting.key] ?? setting.defaultValue}
                          onChange={(e) => handleValueChange(setting.key, e.target.value)}
                          className="h-9"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">xu</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Điểm danh */}
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 font-semibold text-sm">
                  <Calendar className="h-4 w-4 text-green-600" />
                  Hệ thống điểm danh
                </h3>
                <div className="space-y-4">
                  {/* Chế độ điểm danh */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Chế độ tính xu điểm danh hàng ngày
                    </Label>
                    <RadioGroup
                      value={checkinMode}
                      onValueChange={(value) => setCheckinMode(value as "fixed" | "random")}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="fixed" id="fixed" />
                        <Label htmlFor="fixed" className="font-normal cursor-pointer">
                          Cố định
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="random" id="random" />
                        <Label htmlFor="random" className="font-normal cursor-pointer">
                          Ngẫu nhiên
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Trường nhập xu theo chế độ */}
                  {checkinMode === "fixed" ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="daily_checkin_base" className="text-xs text-muted-foreground">
                        Xu cố định cho mỗi lần điểm danh hàng ngày
                      </Label>
                      <div className="flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <Input
                          id="daily_checkin_base"
                          type="number"
                          min="0"
                          value={settings["daily_checkin_base"] ?? 5}
                          onChange={(e) => handleValueChange("daily_checkin_base", e.target.value)}
                          className="h-9"
                        />
                        <span className="text-xs text-muted-foreground shrink-0">xu</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="daily_checkin_min" className="text-xs text-muted-foreground">
                          Xu tối thiểu khi điểm danh ngẫu nhiên
                        </Label>
                        <div className="flex items-center gap-2">
                          <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <Input
                            id="daily_checkin_min"
                            type="number"
                            min="0"
                            value={settings["daily_checkin_min"] ?? 3}
                            onChange={(e) => handleValueChange("daily_checkin_min", e.target.value)}
                            className="h-9"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">xu</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="daily_checkin_max" className="text-xs text-muted-foreground">
                          Xu tối đa khi điểm danh ngẫu nhiên
                        </Label>
                        <div className="flex items-center gap-2">
                          <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <Input
                            id="daily_checkin_max"
                            type="number"
                            min="0"
                            value={settings["daily_checkin_max"] ?? 10}
                            onChange={(e) => handleValueChange("daily_checkin_max", e.target.value)}
                            className="h-9"
                          />
                          <span className="text-xs text-muted-foreground shrink-0">xu</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Thưởng hoàn thành tuần */}
                  <div className="space-y-1.5">
                    <Label htmlFor="weekly_checkin_perfect" className="text-xs text-muted-foreground">
                      Xu thưởng khi hoàn thành điểm danh đủ 7 ngày trong tuần
                    </Label>
                    <div className="flex items-center gap-2">
                      <Coins className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <Input
                        id="weekly_checkin_perfect"
                        type="number"
                        min="0"
                        value={settings["weekly_checkin_perfect"] ?? 50}
                        onChange={(e) => handleValueChange("weekly_checkin_perfect", e.target.value)}
                        className="h-9"
                      />
                      <span className="text-xs text-muted-foreground shrink-0">xu</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 px-6 py-4 border-t shrink-0 bg-background">
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu cài đặt"}
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            disabled={saving}
            variant="outline"
          >
            Hủy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
