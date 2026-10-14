import { useEffect, useMemo, useState } from "react";
import { Search, UserCheck, UserX, Save, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { pb, type InternalStaffHoursRecord, type UserRecord, fileUrl } from "@/lib/pocketbase";
import { normalizeEmployeeCode } from "@/lib/leaderboard";
import { toast } from "sonner";
import { getUserErrorMessage } from "@/lib/toast";

interface StaffEditState {
  userId: string;
  isInternal: boolean;
  employeeCode: string;
  isDirty: boolean;
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

export function AdminStaffManagementTab() {
  const [staffCodeQuery, setStaffCodeQuery] = useState("");
  const [staffFactory, setStaffFactory] = useState("");
  const [staffRows, setStaffRows] = useState<InternalStaffHoursRecord[]>([]);
  const [staffSearched, setStaffSearched] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [factories, setFactories] = useState<string[]>([]);

  const [userQuery, setUserQuery] = useState("");
  const [candidateUsers, setCandidateUsers] = useState<UserRecord[]>([]);
  const [candidateSearched, setCandidateSearched] = useState(false);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [editStates, setEditStates] = useState<Map<string, StaffEditState>>(new Map());

  useEffect(() => {
    void loadFactories();
  }, []);

  const loadFactories = async () => {
    try {
      const records = await pb
        .collection("internal_staff_hours")
        .getFullList<InternalStaffHoursRecord>({
          fields: "factory_name",
        });
      setFactories(
        [
          ...new Set(
            records.map((record) => record.factory_name?.trim()).filter(Boolean) as string[],
          ),
        ].sort((a, b) => a.localeCompare(b, "vi")),
      );
    } catch (error) {
      console.error("Failed to load factories from staff hours:", error);
    }
  };

  const loadStaffHours = async () => {
    const normalizedCode = normalizeEmployeeCode(staffCodeQuery);
    if (!normalizedCode) {
      setStaffRows([]);
      setStaffSearched(false);
      return;
    }

    setStaffLoading(true);
    try {
      const records = await pb
        .collection("internal_staff_hours")
        .getFullList<InternalStaffHoursRecord>({
          expand: "user",
          sort: "-month,-total_hours",
        });
      setStaffRows(
        records.filter(
          (record) =>
            normalizeEmployeeCode(record.employee_code || "") === normalizedCode &&
            (!staffFactory || record.factory_name === staffFactory),
        ),
      );
      setStaffSearched(true);
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không tải được dữ liệu giờ làm"));
    } finally {
      setStaffLoading(false);
    }
  };

  const loadCandidateUsers = async () => {
    const normalizedQuery = normalizeSearch(userQuery);
    if (!normalizedQuery) {
      setCandidateUsers([]);
      setCandidateSearched(false);
      return;
    }

    setCandidateLoading(true);
    try {
      const records = await pb.collection("users").getFullList<UserRecord>({
        sort: "full_name",
        filter: "role='user' || role='staff'",
      });
      const matched = records.filter((user) =>
        [user.full_name, user.username, user.employee_code, user.phone]
          .filter(Boolean)
          .map((value) => normalizeSearch(value || ""))
          .some((value) => value.includes(normalizedQuery)),
      );
      setCandidateUsers(matched);
      setEditStates(
        new Map(
          matched.map((user) => [
            user.id,
            {
              userId: user.id,
              isInternal: user.is_internal || false,
              employeeCode: user.employee_code || "",
              isDirty: false,
            },
          ]),
        ),
      );
      setCandidateSearched(true);
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không tải được tài khoản user"));
    } finally {
      setCandidateLoading(false);
    }
  };

  const handleToggleInternal = (userId: string, value: boolean) => {
    const state = editStates.get(userId);
    if (!state) return;
    const next = new Map(editStates);
    next.set(userId, { ...state, isInternal: value, isDirty: true });
    setEditStates(next);
  };

  const handleEmployeeCodeChange = (userId: string, value: string) => {
    const state = editStates.get(userId);
    if (!state) return;
    const next = new Map(editStates);
    next.set(userId, { ...state, employeeCode: value, isDirty: true });
    setEditStates(next);
  };

  const handleSave = async (userId: string) => {
    const state = editStates.get(userId);
    if (!state || !state.isDirty) return;

    try {
      await pb.collection("users").update(userId, {
        is_internal: state.isInternal,
        employee_code: state.employeeCode.trim() || null,
      });
      setCandidateUsers((current) =>
        current.map((user) =>
          user.id === userId
            ? {
                ...user,
                is_internal: state.isInternal,
                employee_code: state.employeeCode.trim() || undefined,
              }
            : user,
        ),
      );
      const next = new Map(editStates);
      next.set(userId, { ...state, employeeCode: state.employeeCode.trim(), isDirty: false });
      setEditStates(next);
      toast.success("Đã cập nhật tài khoản nội bộ");
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không cập nhật được tài khoản"));
    }
  };

  const groupedStaffRows = useMemo(() => {
    return staffRows.map((record) => {
      const user = record.expand?.user;
      return {
        record,
        fullName: record.full_name || user?.full_name || user?.username || "Chưa xác định",
        employeeCode: record.employee_code || user?.employee_code || staffCodeQuery,
      };
    });
  }, [staffRows, staffCodeQuery]);

  const dirtyCount = Array.from(editStates.values()).filter((state) => state.isDirty).length;

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="font-semibold">Quản lý nhân viên nội bộ</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Mã NV có thể trùng giữa các nhà máy. Hãy tra cứu theo mã để xem đúng từng người và lịch sử
          giờ làm.
        </p>
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <h4 className="font-semibold">Tra cứu nhân viên nội bộ</h4>
          <p className="text-sm text-muted-foreground">
            Nhập mã NV để hiển thị tất cả người trùng mã và giờ theo tháng.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={staffCodeQuery}
              onChange={(event) => setStaffCodeQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void loadStaffHours()}
              placeholder="Nhập mã NV, ví dụ NV001"
              className="pl-10"
            />
          </div>
          <select
            value={staffFactory}
            onChange={(event) => setStaffFactory(event.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Tất cả nhà máy</option>
            {factories.map((factory) => (
              <option key={factory} value={factory}>
                {factory}
              </option>
            ))}
          </select>
          <Button type="button" onClick={() => void loadStaffHours()} disabled={staffLoading}>
            <Search />
            Tìm kiếm
          </Button>
        </div>

        {staffSearched && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Mã NV</TableHead>
                  <TableHead>Nhà máy</TableHead>
                  <TableHead>Tháng</TableHead>
                  <TableHead className="text-right">Giờ HC</TableHead>
                  <TableHead className="text-right">Giờ TC</TableHead>
                  <TableHead className="text-right">Tổng giờ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : groupedStaffRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Không tìm thấy nhân viên phù hợp
                    </TableCell>
                  </TableRow>
                ) : (
                  groupedStaffRows.map(({ record, fullName, employeeCode }) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{fullName}</TableCell>
                      <TableCell>{employeeCode || "—"}</TableCell>
                      <TableCell>{record.factory_name || "Chưa có nhà máy"}</TableCell>
                      <TableCell>{record.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(record.hc_hours || 0).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(record.tc_hours || 0).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {Number(record.total_hours || 0).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <h4 className="font-semibold">Tìm kiếm tài khoản user để đưa lên nội bộ</h4>
          <p className="text-sm text-muted-foreground">
            Nhập tên, username, mã NV hoặc số điện thoại. Danh sách chỉ xuất hiện sau khi tìm kiếm.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void loadCandidateUsers()}
              placeholder="Nhập thông tin tài khoản cần tìm"
              className="pl-10"
            />
          </div>
          <Button
            type="button"
            onClick={() => void loadCandidateUsers()}
            disabled={candidateLoading}
          >
            <Search />
            Tìm
          </Button>
        </div>

        {dirtyCount > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Có {dirtyCount} thay đổi chưa lưu.</AlertDescription>
          </Alert>
        )}

        {candidateSearched && (
          <div className="space-y-2">
            {candidateLoading ? (
              <div className="py-8 text-center text-muted-foreground">Đang tìm kiếm...</div>
            ) : candidateUsers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Không tìm thấy tài khoản</div>
            ) : (
              candidateUsers.map((user) => {
                const state = editStates.get(user.id);
                if (!state) return null;
                return (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={fileUrl(user, user.avatar)} alt={user.full_name} />
                      <AvatarFallback>
                        {user.full_name?.charAt(0) || user.username?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-[180px] flex-1">
                      <div className="font-medium">{user.full_name || user.username}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.username} · {user.phone || "Chưa có số điện thoại"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={state.isInternal}
                        onCheckedChange={(value) => handleToggleInternal(user.id, value)}
                      />
                      {state.isInternal ? (
                        <UserCheck className="h-4 w-4 text-green-600" />
                      ) : (
                        <UserX className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <Input
                      value={state.employeeCode}
                      onChange={(event) => handleEmployeeCodeChange(user.id, event.target.value)}
                      disabled={!state.isInternal}
                      placeholder="Mã NV"
                      className="w-36"
                    />
                    {state.isDirty && (
                      <Button type="button" size="sm" onClick={() => void handleSave(user.id)}>
                        <Save />
                        Lưu
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription>
          Giờ làm được phân biệt theo tài khoản, nhà máy, tháng và nguồn dữ liệu; mã NV trùng giữa
          các nhà máy là hợp lệ.
        </AlertDescription>
      </Alert>
    </div>
  );
}
