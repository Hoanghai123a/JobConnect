import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { createStaffActionLog } from "@/lib/staff-log";
import { fetchFactories, fetchFactoryManagers, type FactoryManagerRecord, type FactoryRecord } from "@/lib/factories";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as any;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminStaffPage,
});

function AdminStaffPage() {
  const currentUser = pb.authStore.record as UserRecord;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [assignments, setAssignments] = useState<FactoryManagerRecord[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Partial<FactoryManagerRecord> | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [userRows, factoryRows, assignmentRows] = await Promise.all([
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchFactories(),
        fetchFactoryManagers(),
      ]);
      setUsers(userRows.filter((item) => item.role !== "admin"));
      setFactories(factoryRows);
      setAssignments(assignmentRows);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((item) => {
      const haystack = [item.full_name, item.username, item.phone, item.role].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [search, users]);

  const staffUsers = useMemo(() => users.filter((item) => item.role === "staff"), [users]);

  const updateRole = async (targetUser: UserRecord, nextRole: "user" | "staff") => {
    try {
      await pb.collection("users").update(targetUser.id, { role: nextRole });
      await createStaffActionLog({
        actor: currentUser,
        targetUserId: targetUser.id,
        targetCollection: "users",
        targetRecord: targetUser.id,
        action: "update",
        before: { role: targetUser.role || "user" },
        after: { role: nextRole },
        note: "Admin cập nhật role tài khoản",
      });
      toast.success("Đã cập nhật role");
      load();
    } catch (error: any) {
      toast.error(error?.message || "Không cập nhật được role");
    }
  };

  const saveAssignment = async () => {
    if (!editingAssignment?.staff || !editingAssignment?.factory) {
      toast.warning("Chọn staff và nhà máy trước khi lưu");
      return;
    }

    const payload = {
      staff: editingAssignment.staff,
      factory: editingAssignment.factory,
      active_from: editingAssignment.active_from || null,
      active_to: editingAssignment.active_to || null,
      status: editingAssignment.status || "active",
      note: editingAssignment.note || "",
    };

    try {
      if (editingAssignment.id) {
        await pb.collection("factory_managers").update(editingAssignment.id, payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "factory_managers",
          targetRecord: editingAssignment.id,
          action: "update",
          after: payload,
          note: "Admin cập nhật phụ trách nhà máy",
        });
      } else {
        const created = await pb.collection("factory_managers").create(payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "factory_managers",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin tạo phụ trách nhà máy",
        });
      }
      toast.success("Đã lưu phụ trách nhà máy");
      setAssignmentOpen(false);
      setEditingAssignment(null);
      load();
    } catch (error: any) {
      toast.error(error?.message || "Không lưu được phụ trách nhà máy");
    }
  };

  const deleteAssignment = async (assignment: FactoryManagerRecord) => {
    if (!confirm("Xóa phân công nhà máy này?")) return;
    try {
      await pb.collection("factory_managers").delete(assignment.id);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "factory_managers",
        targetRecord: assignment.id,
        action: "delete",
        before: assignment,
        note: "Admin xóa phụ trách nhà máy",
      });
      toast.success("Đã xóa phân công");
      load();
    } catch (error: any) {
      toast.error(error?.message || "Không xóa được phân công");
    }
  };

  return (
    <PageContainer title="Staff & nhà máy" subtitle="Quản lý role staff và phân nhà máy phụ trách">
      <div className="grid grid-cols-3 gap-2">
        <Link to="/admin/settings" className="rounded-2xl border border-border/60 bg-card px-3 py-3 text-center text-sm font-medium shadow-soft">
          Cài đặt
        </Link>
        <Link to="/admin/imports" className="rounded-2xl border border-border/60 bg-card px-3 py-3 text-center text-sm font-medium shadow-soft">
          Import
        </Link>
        <Link to="/admin/logs" className="rounded-2xl border border-border/60 bg-card px-3 py-3 text-center text-sm font-medium shadow-soft">
          Nhật ký
        </Link>
      </div>

      <div className="relative">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm staff theo tên, username, số điện thoại..."
          className="rounded-full"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Tài khoản nhân sự</div>
          <StatusChip tone="info">{staffUsers.length} staff</StatusChip>
        </div>

        {loading ? (
          <Card className="rounded-2xl p-4 text-sm text-muted-foreground">Đang tải tài khoản...</Card>
        ) : filteredUsers.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Chưa có tài khoản phù hợp" description="Thử tìm bằng username hoặc số điện thoại." />
        ) : (
          filteredUsers.map((item) => (
            <Card key={item.id} className="space-y-3 rounded-2xl p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.full_name || item.username}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    @{item.username || "chưa có username"} · {item.phone || "chưa có số điện thoại"}
                  </div>
                </div>
                <StatusChip tone={item.role === "staff" ? "success" : "neutral"}>
                  {item.role === "staff" ? "Staff" : "User"}
                </StatusChip>
              </div>

              <Select value={item.role || "user"} onValueChange={(value: "user" | "staff") => updateRole(item, value)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </Card>
          ))
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Phân công nhà máy</div>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              setEditingAssignment({ status: "active" } as any);
              setAssignmentOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Thêm phân công
          </Button>
        </div>

        {assignments.length === 0 ? (
          <EmptyState icon={Building2} title="Chưa có phân công" description="Admin cần gán staff vào nhà máy để staff có quyền qlnm." />
        ) : (
          assignments.map((assignment) => (
            <Card key={assignment.id} className="space-y-3 rounded-2xl p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{assignment.expand?.factory?.name || "Nhà máy"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Staff: {staffUsers.find((item) => item.id === assignment.staff)?.full_name || assignment.staff}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {assignment.active_from || "Ngay lập tức"} → {assignment.active_to || "Không giới hạn"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip tone={assignment.status === "active" ? "success" : "neutral"}>
                    {assignment.status === "active" ? "Đang áp dụng" : "Tạm dừng"}
                  </StatusChip>
                  <button
                    type="button"
                    onClick={() => deleteAssignment(assignment)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-destructive"
                    aria-label="Xóa phân công"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingAssignment?.id ? "Sửa phân công nhà máy" : "Thêm phân công nhà máy"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Select
                value={editingAssignment?.staff || ""}
                onValueChange={(value) => setEditingAssignment((current) => ({ ...current, staff: value }))}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn staff" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((staffUser) => (
                    <SelectItem key={staffUser.id} value={staffUser.id}>
                      {staffUser.full_name || staffUser.username || staffUser.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nhà máy</Label>
              <Select
                value={editingAssignment?.factory || ""}
                onValueChange={(value) => setEditingAssignment((current) => ({ ...current, factory: value }))}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn nhà máy" />
                </SelectTrigger>
                <SelectContent>
                  {factories.map((factory) => (
                    <SelectItem key={factory.id} value={factory.id}>
                      {factory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Từ ngày</Label>
                <Input
                  type="date"
                  value={editingAssignment?.active_from || ""}
                  onChange={(event) => setEditingAssignment((current) => ({ ...current, active_from: event.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  value={editingAssignment?.active_to || ""}
                  onChange={(event) => setEditingAssignment((current) => ({ ...current, active_to: event.target.value }))}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Trạng thái</Label>
              <Select
                value={editingAssignment?.status || "active"}
                onValueChange={(value) => setEditingAssignment((current) => ({ ...current, status: value as any }))}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Đang áp dụng</SelectItem>
                  <SelectItem value="inactive">Tạm dừng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Input
                value={editingAssignment?.note || ""}
                onChange={(event) => setEditingAssignment((current) => ({ ...current, note: event.target.value }))}
                className="rounded-xl"
                placeholder="Ví dụ: phụ trách ca sáng, phụ trách tạm thời..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignmentOpen(false)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={saveAssignment} className="rounded-xl">
              <Settings2 className="h-4 w-4" /> Lưu phân công
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}