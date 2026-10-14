import { useState, useEffect } from "react";
import { Settings, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getLeaderboardSettings,
  saveLeaderboardSettings,
  invalidateLeaderboardCache,
  type LeaderboardSettings,
} from "@/lib/leaderboard";
import type { StaffHoursDataSource } from "@/lib/pocketbase";
import { toast } from "sonner";
import { getUserErrorMessage } from "@/lib/toast";

export function AdminSettingsTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<LeaderboardSettings>({
    maxRankDisplay: 10,
    defaultDataSource: "admin_upload",
  });
  const [originalSettings, setOriginalSettings] = useState<LeaderboardSettings>({
    maxRankDisplay: 10,
    defaultDataSource: "admin_upload",
  });
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const dirty =
      settings.maxRankDisplay !== originalSettings.maxRankDisplay ||
      settings.defaultDataSource !== originalSettings.defaultDataSource;
    setIsDirty(dirty);
  }, [settings, originalSettings]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getLeaderboardSettings();
      setSettings(data);
      setOriginalSettings(data);
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không tải được cài đặt"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (settings.maxRankDisplay < 3) {
      toast.error("Số lượng hiển thị tối thiểu là 3 (cho podium)");
      return;
    }

    setSaving(true);
    try {
      await saveLeaderboardSettings(settings);
      setOriginalSettings(settings);
      invalidateLeaderboardCache();
      toast.success("Đã lưu cài đặt thành công");
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không lưu được cài đặt"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSettings(originalSettings);
  };

  if (loading) {
    return (
      <Card className="p-12">
        <div className="text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <div>Đang tải cài đặt...</div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Cài đặt bảng xếp hạng</h3>
        </div>
      </Card>

      {/* Settings Form */}
      <Card className="p-6 space-y-6">
        {/* Max Rank Display */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="maxRankDisplay" className="text-base font-medium">
              Số lượng hiển thị trong bảng xếp hạng
            </Label>
            <div className="text-sm text-muted-foreground mt-1">
              Số vị trí hiển thị tối đa (bao gồm top 3). Người ngoài top sẽ hiển thị "Vô hạng".
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Input
              id="maxRankDisplay"
              type="number"
              min={3}
              max={100}
              value={settings.maxRankDisplay}
              onChange={(e) => setSettings({ ...settings, maxRankDisplay: Number(e.target.value) })}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">(tối thiểu 3 để đủ podium)</span>
          </div>
        </div>

        {/* Default Data Source */}
        <div className="space-y-3">
          <div>
            <Label className="text-base font-medium">Nguồn dữ liệu mặc định</Label>
            <div className="text-sm text-muted-foreground mt-1">
              Nguồn dữ liệu được chọn mặc định khi mở trang xếp hạng.
            </div>
          </div>
          <RadioGroup
            value={settings.defaultDataSource}
            onValueChange={(value) =>
              setSettings({ ...settings, defaultDataSource: value as StaffHoursDataSource })
            }
          >
            <div className="space-y-3">
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="admin_upload" id="default_admin" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="default_admin" className="font-medium cursor-pointer">
                    Admin upload
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Dữ liệu được admin import từ Excel
                  </div>
                </div>
              </div>
              <div className="flex items-start space-x-3 rounded-lg border p-4">
                <RadioGroupItem value="self_checkin" id="default_self" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="default_self" className="font-medium cursor-pointer">
                    Tự chấm công
                  </Label>
                  <div className="text-sm text-muted-foreground">
                    Dữ liệu tự động tổng hợp từ LocalStorage của nhân viên
                  </div>
                </div>
              </div>
            </div>
          </RadioGroup>
        </div>
      </Card>

      {/* Info Alert */}
      <Alert>
        <AlertDescription>
          <div className="space-y-1 text-sm">
            <div>
              <strong>Lưu ý:</strong>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Thay đổi cài đặt sẽ ảnh hưởng đến tất cả người dùng xem bảng xếp hạng</li>
              <li>Số lượng hiển thị tối thiểu là 3 để đủ cho podium (top 3)</li>
              <li>Hai nguồn dữ liệu hoàn toàn độc lập và không mix với nhau</li>
            </ul>
          </div>
        </AlertDescription>
      </Alert>

      {/* Actions */}
      {isDirty && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Có thay đổi chưa lưu. Nhấn <strong>Lưu</strong> để áp dụng.
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Lưu
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={saving}>
                Hủy
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
