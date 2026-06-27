import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb, type Role, type UserRecord } from "@/lib/pocketbase";
import { assignUidIfMissing } from "@/lib/uid";
import { AppHeader } from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VN_BANKS } from "@/lib/vn-banks";
import { exportToExcel } from "@/lib/excel";
import { isUserApproved } from "@/lib/user-approval";
import { StatusChip } from "@/components/ui/status-chip";
import {
  fetchFactories,
  fetchFactoryManagers,
  isFactoryAssignmentActive,
  type FactoryManagerRecord,
  type FactoryRecord,
  type FactoryStatus,
} from "@/lib/factories";
import { createStaffActionLog } from "@/lib/staff-log";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  LogOut,
  Save,
  ShieldCheck,
  User2,
  Search,
  FileDown,
  KeyRound,
  Trash2,
  UserCog,
  Send,
  Ban,
  CheckCircle2,
  UserPlus,
  Upload,
  FileSpreadsheet,
  Building2,
  Plus,
  CalendarRange,
  Pencil,
  CircleX,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  validateSearch: (s: Record<string, unknown>) => ({
    incomplete: s.incomplete ? 1 : undefined,
  }),
  component: AccountPage,
});

const NUM_FIELDS = [
  ["default_hc_hours", "Số giờ HC mặc định"],
  ["default_ot_hours", "Số giờ tăng ca mặc định"],
  ["lcb", "LCB (Lương cơ bản)"],
  ["chuyen_can", "Chuyên cần"],
  ["doi_song", "Đời sống"],
  ["tham_nien", "Thâm niên"],
] as const;

const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  staff: "Staff",
  user: "Người dùng",
};

function AccountPage() {
  const { user, logout, isAdmin } = useAuth();
  const nav = useNavigate();

  return (
    <div>
      <AppHeader
        title="Tài khoản"
        right={
          <>
            <div>Đăng xuất</div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                logout();
                nav({ to: "/login" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-4">
        <Card className="overflow-hidden">
          <div className="gradient-primary p-5 text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-white/20 p-3">
                {isAdmin ? <ShieldCheck className="h-6 w-6" /> : <User2 className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">
                  {user?.full_name || "Người dùng"}
                </div>
                <div className="text-sm opacity-80">@{user?.username}</div>
              </div>
              <Badge variant="secondary" className="bg-white/20 text-primary-foreground">
                {isAdmin ? "Admin" : "User"}
              </Badge>
            </div>
          </div>
        </Card>

        {isAdmin ? (
          <Tabs defaultValue="admin" className="space-y-3">
            <TabsList className="grid h-10 w-full grid-cols-3 rounded-2xl">
              <TabsTrigger value="admin" className="rounded-xl text-xs">
                Quản trị tài khoản
              </TabsTrigger>
              <TabsTrigger value="factories" className="rounded-xl text-xs">
                QLNM
              </TabsTrigger>
              <TabsTrigger value="profile" className="rounded-xl text-xs">
                Thông tin của tôi
              </TabsTrigger>
            </TabsList>
            <TabsContent value="admin" className="mt-0">
              <AdminUsersPanel />
            </TabsContent>
            <TabsContent value="factories" className="mt-0">
              <FactoryAssignmentsPanel />
            </TabsContent>
            <TabsContent value="profile" className="mt-0 space-y-3">
              <UserProfileForm />
            </TabsContent>
          </Tabs>
        ) : (
          <UserProfileForm />
        )}
      </div>
    </div>
  );
}

/* ───────── USER PROFILE (non-admin) ───────── */

function UserProfileForm() {
  const { user, refresh, isAdmin } = useAuth();
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const search = Route.useSearch();
  const showIncomplete = !!search.incomplete;

  useEffect(() => {
    if (showIncomplete && !isAdmin) {
      toast.info("Bổ sung đầy đủ thông tin để trải nghiệm tốt nhất");
    }
  }, [isAdmin, showIncomplete]);

  useEffect(() => {
    setForm({
      full_name: user?.full_name || "",
      phone: user?.phone || "",
      default_hc_hours: user?.default_hc_hours ?? 8,
      default_ot_hours: user?.default_ot_hours ?? 0,
      company: user?.company || "",
      employee_code: user?.employee_code || "",
      lcb: user?.lcb ?? 0,
      chuyen_can: user?.chuyen_can ?? 0,
      doi_song: user?.doi_song ?? 0,
      tham_nien: user?.tham_nien ?? 0,
      bank_name: user?.bank_name || "",
      bank_account_number: user?.bank_account_number || "",
      bank_account_name: user?.bank_account_name || "",
    });
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = isAdmin
        ? {
            full_name: form.full_name || "",
            phone: form.phone || "",
          }
        : { ...form };
      if (!isAdmin) {
        for (const [k] of NUM_FIELDS) payload[k] = Number(payload[k]) || 0;
      }
      await pb.collection("users").update(user.id, payload);
      await refresh();
      toast.success("Đã lưu");
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showIncomplete && !isAdmin && (
        <Card className="border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Bổ sung đầy đủ thông tin để trải nghiệm tốt nhất.
        </Card>
      )}
      <Section title={isAdmin ? "Thông tin admin" : "Thông tin chung"}>
        <div className="space-y-1">
          <Label className="text-xs">Tên đăng nhập</Label>
          <div className="rounded-md bg-muted px-3 py-2 text-sm">@{user?.username}</div>
        </div>
        <TextField
          label="Họ và tên"
          value={form.full_name}
          onChange={(v) => setForm({ ...form, full_name: v })}
        />
        <TextField
          label="Số điện thoại"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
        />
        {!isAdmin && (
          <>
            <FactorySelect value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
            <TextField
              label="Mã NV"
              value={form.employee_code}
              onChange={(v) => setForm({ ...form, employee_code: v })}
            />
          </>
        )}
      </Section>

      {!isAdmin && (
        <Section title="Mặc định lương & giờ">
          {NUM_FIELDS.map(([k, label]) => (
            <NumberField
              key={k}
              label={label}
              value={Number(form[k] ?? 0)}
              onChange={(n) => setForm({ ...form, [k]: n })}
            />
          ))}
        </Section>
      )}

      {!isAdmin && (
        <Section title="Số tài khoản (STK)">
          <div className="space-y-1">
            <Label className="text-xs">Ngân hàng</Label>
            <Select
              value={form.bank_name || ""}
              onValueChange={(v) => setForm({ ...form, bank_name: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn ngân hàng" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {VN_BANKS.map((b) => (
                  <SelectItem key={b.code} value={b.name}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TextField
            label="Số TK"
            value={form.bank_account_number}
            onChange={(v) => setForm({ ...form, bank_account_number: v.replace(/\D/g, "") })}
          />
          <TextField
            label="Tên TK"
            value={form.bank_account_name}
            onChange={(v) => setForm({ ...form, bank_account_name: v })}
          />
        </Section>
      )}

      <Button onClick={save} disabled={saving} className="w-full">
        <Save className="h-4 w-4" /> Lưu thay đổi
      </Button>
    </>
  );
}

/* ───────── ADMIN: USERS MANAGEMENT ───────── */

function AdminUsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState({ title: "", content: "" });
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPwd, setNewPwd] = useState("");
  const [roleTarget, setRoleTarget] = useState<any>(null);
  const [roleValue, setRoleValue] = useState<Role>("user");
  const [createOpen, setCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [pendingApprovalValue, setPendingApprovalValue] = useState<boolean | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const emptyNew = { full_name: "", phone: "", username: "", password: "", company: "", employee_code: "" };
  const [newUser, setNewUser] = useState<any>(emptyNew);

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("users").getFullList({ sort: "-created" });
      setUsers(res.filter((u: any) => u.id !== me?.id));
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải");
    } finally {
      setLoading(false);
    }

    try {
      const s = await pb.collection("settings").getList(1, 1);
      if (s.items[0]) {
        setSettingsId(s.items[0].id);
        setRequireApproval(Boolean(s.items[0].require_approval));
      }
    } catch {
      // Collection settings có thể chưa được khởi tạo ở môi trường mới.
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const s = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(s) ||
        (u.phone || "").toLowerCase().includes(s) ||
        (u.username || "").toLowerCase().includes(s),
    );
  }, [users, search]);

  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.id)));
  };

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  const exportExcel = () => {
    const rows = filtered.map((u, i) => ({
      STT: i + 1,
      "Họ tên": u.full_name || "",
      "Số điện thoại": u.phone || "",
      "Tên đăng nhập": u.username || "",
      "Mã NV": u.employee_code || "",
      "Nhà máy": u.company || "",
      "Ngày tạo": new Date(u.created).toLocaleDateString("vi-VN"),
      "Trạng thái": isUserApproved(u) ? "Hoạt động" : "Vô hiệu hoá",
    }));
    exportToExcel("danh_sach_tai_khoan_" + Date.now(), { Users: rows });
  };

  const bulkDisable = async (disable: boolean) => {
    if (!confirm((disable ? "Vô hiệu hoá" : "Kích hoạt") + " " + selected.size + " tài khoản?")) return;
    try {
      for (const id of selected) {
        await pb.collection("users").update(id, {
          approvalStatus: disable ? "pending" : "approved",
          approved: disable ? "false" : "true",
          status: disable ? "disabled" : "active",
        });
      }
      toast.success("Đã cập nhật");
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const bulkDelete = async () => {
    if (!confirm("Xoá " + selected.size + " tài khoản? Hành động không thể hoàn tác.")) return;
    try {
      for (const id of selected) {
        await pb.collection("users").delete(id);
      }
      toast.success("Đã xoá");
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const toggleApprovalRequirement = async (val: boolean) => {
    setRequireApproval(val);
    try {
      if (settingsId) {
        await pb.collection("settings").update(settingsId, { require_approval: val });
      } else {
        const r = await pb.collection("settings").create({ require_approval: val });
        setSettingsId(r.id);
      }
      toast.success("Đã cập nhật kiểm duyệt đăng ký");
    } catch (e: any) {
      setRequireApproval((prev) => !prev);
      toast.error(e?.message || "Lỗi cập nhật kiểm duyệt đăng ký");
    }
  };

  const requestToggleApprovalRequirement = (val: boolean) => {
    setPendingApprovalValue(val);
    setAdminPassword("");
  };

  const closeApprovalConfirm = () => {
    if (confirmingApproval) return;
    setPendingApprovalValue(null);
    setAdminPassword("");
  };

  const confirmToggleApprovalRequirement = async () => {
    if (pendingApprovalValue === null) return;
    const admin = pb.authStore.record as UserRecord | null;
    const identity = admin?.username || admin?.email;
    if (!identity) {
      toast.error("Không xác định được tài khoản admin");
      return;
    }
    if (!adminPassword) {
      toast.error("Nhập mật khẩu admin");
      return;
    }

    setConfirmingApproval(true);
    try {
      const res = await fetch("/api/public/pocketbase-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, password: adminPassword }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Mật khẩu admin không đúng");
      if (payload?.record?.id !== admin?.id || payload?.record?.role !== "admin") {
        throw new Error("Tài khoản xác thực không phải admin hiện tại");
      }

      await toggleApprovalRequirement(pendingApprovalValue);
      closeApprovalConfirm();
    } catch (e: any) {
      toast.error(e?.message || "Không xác thực được mật khẩu admin");
    } finally {
      setConfirmingApproval(false);
    }
  };

  const deleteOne = async (u: any) => {
    if (!confirm("Xoá tài khoản " + (u.full_name || u.username) + "?")) return;
    try {
      await pb.collection("users").delete(u.id);
      toast.success("Đã xoá");
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const doResetPassword = async () => {
    if (!resetTarget) return;
    if (newPwd.length < 8) {
      toast.error("Mật khẩu tối thiểu 8 ký tự");
      return;
    }
    try {
      await pb.collection("users").update(resetTarget.id, {
        password: newPwd,
        passwordConfirm: newPwd,
      });
      toast.success("Đã đặt lại mật khẩu");
      setResetTarget(null);
      setNewPwd("");
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const openRoleDialog = (u: any) => {
    setRoleTarget(u);
    setRoleValue((u.role || "user") as Role);
  };

  const updateRole = async () => {
    if (!roleTarget || !me) return;
    try {
      await pb.collection("users").update(roleTarget.id, { role: roleValue });
      await createStaffActionLog({
        actor: me as UserRecord,
        targetUserId: roleTarget.id,
        targetCollection: "users",
        targetRecord: roleTarget.id,
        action: "update",
        before: { role: roleTarget.role || "user" },
        after: { role: roleValue },
        note: "Admin cập nhật vai trò tài khoản",
      });
      toast.success("Đã cập nhật vai trò");
      setRoleTarget(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Không cập nhật được vai trò");
    }
  };

  const sendGuide = async () => {
    if (!guide.title.trim() || !guide.content.trim()) {
      toast.error("Nhập tiêu đề và nội dung");
      return;
    }
    const targets = Array.from(selected);
    try {
      await pb.collection("guides").create({
        title: guide.title,
        content: guide.content,
        target_type: targets.length ? "users" : "all",
        target_users: targets,
        target_factories: [],
        created_by: me?.id,
      });
      toast.success(targets.length ? "Đã gửi đến " + targets.length + " người" : "Đã gửi tới tất cả");
      setGuideOpen(false);
      setGuide({ title: "", content: "" });
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message || "Lỗi gửi hướng dẫn");
    }
  };

  const createOne = async () => {
    const full_name = (newUser.full_name || "").trim();
    const phone = (newUser.phone || "").trim();
    const username = (newUser.username || "").trim().toLowerCase();
    const password = newUser.password || "";
    const company = (newUser.company || "").trim();
    const employee_code = (newUser.employee_code || "").trim();
    if (!full_name || !phone || !username || !password) {
      toast.error("Vui lòng nhập đủ Họ tên, SĐT, Tên đăng nhập, Mật khẩu");
      return;
    }
    if (password.length < 8) {
      toast.error("Mật khẩu tối thiểu 8 ký tự");
      return;
    }
    try {
      const created = await pb.collection("users").create({
        full_name,
        phone,
        username,
        password,
        company,
        employee_code,
        passwordConfirm: password,
        role: "user",
        approvalStatus: "approved",
        approved: "true",
        status: "active",
      });
      try {
        await assignUidIfMissing(created.id);
      } catch {
        // best-effort; admin can backfill later
      }
      toast.success("Đã tạo tài khoản");
      setCreateOpen(false);
      setNewUser(emptyNew);
      load();
    } catch (e: any) {
      toast.error(e?.response?.message || e?.message || "Lỗi tạo");
    }
  };

  const downloadTemplate = () => {
    const sample = [
      {
        "Họ tên": "Nguyễn Văn A",
        "Số điện thoại": "0900000001",
        "Tên đăng nhập": "nguyenvana",
        "Mật khẩu": "12345678",
        "Nhà máy": "",
        "Mã NV": "",
      },
      {
        "Họ tên": "Trần Thị B",
        "Số điện thoại": "0900000002",
        "Tên đăng nhập": "tranthib",
        "Mật khẩu": "12345678",
        "Nhà máy": "",
        "Mã NV": "",
      },
    ];
    exportToExcel("mau_nhap_tai_khoan", { Users: sample });
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImporting(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      let ok = 0;
      let fail = 0;
      const errors: string[] = [];
      for (const r of rows) {
        const full_name = String(r["Họ tên"] || r["full_name"] || "").trim();
        const phone = String(r["Số điện thoại"] || r["phone"] || "").trim();
        const username = String(r["Tên đăng nhập"] || r["username"] || "")
          .trim()
          .toLowerCase();
        const password = String(r["Mật khẩu"] || r["password"] || "").trim();
        const company = String(r["Nhà máy"] || r["Công ty"] || r["company"] || "").trim();
        const employee_code = String(r["Mã NV"] || r["Ma NV"] || r["employee_code"] || "").trim();
        if (!full_name || !phone || !username || !password) {
          fail++;
          continue;
        }
        if (password.length < 8) {
          fail++;
          errors.push(username + ": mật khẩu < 8 ký tự");
          continue;
        }
        try {
          const created = await pb.collection("users").create({
            full_name,
            phone,
            username,
            password,
            passwordConfirm: password,
            company,
            employee_code,
            role: "user",
            approvalStatus: "approved",
            status: "active",
          });
          try {
            await assignUidIfMissing(created.id);
          } catch {
            // best-effort
          }
          ok++;
        } catch (err: any) {
          fail++;
          errors.push(username + ": " + (err?.response?.message || err?.message || "lỗi"));
        }
      }
      toast.success("Đã nhập " + ok + " tài khoản" + (fail ? ", " + fail + " lỗi" : ""));
      if (errors.length) console.warn("Import errors:", errors);
      load();
    } catch (err: any) {
      toast.error(err?.message || "File không hợp lệ");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-semibold">Yêu cầu duyệt khi đăng ký</Label>
          <div className="text-[11px] text-muted-foreground">
            Tắt để tài khoản mới được dùng ngay sau khi đăng ký.
          </div>
        </div>
        <Switch checked={requireApproval} onCheckedChange={requestToggleApprovalRequirement} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quản lý tài khoản ({users.length})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="rounded-full">
            <UserPlus className="h-3.5 w-3.5" /> Tạo
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onImportFile}
              disabled={importing}
            />
            <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
              <Upload className="h-3.5 w-3.5" /> {importing ? "Đang nhập..." : "Nhập Excel"}
            </span>
          </label>
          <Button size="sm" variant="outline" onClick={downloadTemplate} className="rounded-full">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Mẫu
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} className="rounded-full">
            <FileDown className="h-3.5 w-3.5" /> Xuất
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Tìm theo họ tên / SĐT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary/10 p-2">
          <span className="text-xs font-medium text-primary">{selected.size} đã chọn</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setGuideOpen(true)}>
              <Send className="h-3.5 w-3.5" /> Gửi HD
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkDisable(true)}>
              <Ban className="h-3.5 w-3.5" /> Vô hiệu
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkDisable(false)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Kích hoạt
            </Button>
            <Button size="sm" variant="destructive" onClick={bulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Xoá
            </Button>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          Chọn tất cả ({filtered.length})
        </label>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
          Không có tài khoản.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const isSel = selected.has(u.id);
            const approved = isUserApproved(u);
            const tone = approved
              ? "border-l-[color:var(--status-success)]"
              : "border-l-[color:var(--status-danger)]";
            return (
              <div key={u.id} className={"list-card flex items-start gap-3 " + tone}>
                <Checkbox checked={isSel} onCheckedChange={() => toggle(u.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{u.full_name || u.username}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {"📞 " + (u.phone || "—")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {"Mã NV " + (u.employee_code || "—") + " · " + (u.company || "—")}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {"📅 " + new Date(u.created).toLocaleDateString("vi-VN")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={"chip " + (approved ? "chip-success" : "chip-danger")}>
                      {approved ? "Hoạt động" : "Vô hiệu hoá"}
                    </span>
                    <span className="chip chip-info">{ROLE_LABELS[(u.role || "user") as Role]}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setResetTarget(u);
                      setNewPwd("");
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                    title="Đặt lại mật khẩu"
                  >
                    <KeyRound className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => openRoleDialog(u)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                    title="Chuyển quyền"
                  >
                    <UserCog className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteOne(u)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                    title="Xoá"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Đặt lại mật khẩu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {(resetTarget?.full_name || resetTarget?.username) + " · " + resetTarget?.phone}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mật khẩu mới (tối thiểu 8 ký tự)</Label>
              <Input
                type="text"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              Hủy
            </Button>
            <Button onClick={doResetPassword}>
              <Save className="h-4 w-4" /> Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Chuyển quyền tài khoản</DialogTitle>
            <DialogDescription>
              Chọn vai trò mới cho {roleTarget?.full_name || roleTarget?.username || "tài khoản này"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Vai trò</Label>
            <Select value={roleValue} onValueChange={(value) => setRoleValue(value as Role)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Chọn vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Người dùng</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Quản trị viên</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Hủy
            </Button>
            <Button onClick={updateRole}>
              <UserCog className="h-4 w-4" /> Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingApprovalValue !== null}
        onOpenChange={(open) => !open && closeApprovalConfirm()}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Xác nhận mật khẩu admin</DialogTitle>
            <DialogDescription>
              Xác thực lại trước khi thay đổi cách duyệt tài khoản mới.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Mật khẩu admin</Label>
            <Input
              type="password"
              className="rounded-xl"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmToggleApprovalRequirement();
              }}
              autoComplete="current-password"
              autoFocus
            />
            <div className="text-xs text-muted-foreground">
              Sau khi xác thực, hệ thống sẽ {pendingApprovalValue ? "bật" : "tắt"} yêu cầu duyệt
              khi đăng ký.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeApprovalConfirm}>
              Huỷ
            </Button>
            <Button onClick={confirmToggleApprovalRequirement} disabled={confirmingApproval}>
              {confirmingApproval ? "Đang xác thực..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send guide dialog */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {"Gửi hướng dẫn (" + (selected.size ? selected.size + " người" : "tất cả") + ")"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Tiêu đề</Label>
              <Input
                value={guide.title}
                onChange={(e) => setGuide({ ...guide, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nội dung</Label>
              <Textarea
                rows={6}
                value={guide.content}
                onChange={(e) => setGuide({ ...guide, content: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuideOpen(false)}>
              Hủy
            </Button>
            <Button onClick={sendGuide}>
              <Send className="h-4 w-4" /> Gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Tạo tài khoản mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <TextField
              label="Họ tên *"
              value={newUser.full_name}
              onChange={(v) => setNewUser({ ...newUser, full_name: v })}
            />
            <TextField
              label="Số điện thoại *"
              value={newUser.phone}
              onChange={(v) => setNewUser({ ...newUser, phone: v })}
            />
            <TextField
              label="Tên đăng nhập *"
              value={newUser.username}
              onChange={(v) => setNewUser({ ...newUser, username: v })}
            />
            <TextField
              label="Mật khẩu * (≥ 8 ký tự)"
              value={newUser.password}
              onChange={(v) => setNewUser({ ...newUser, password: v })}
            />
            <TextField
              label="Nhà máy"
              value={newUser.company}
              onChange={(v) => setNewUser({ ...newUser, company: v })}
            />
            <TextField
              label="Mã NV"
              value={newUser.employee_code}
              onChange={(v) => setNewUser({ ...newUser, employee_code: v })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button onClick={createOne}>
              <UserPlus className="h-4 w-4" /> Tạo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

type EditingAssignment = Partial<FactoryManagerRecord> & { staff?: string };

function formatDateRange(record: FactoryManagerRecord) {
  const from = record.active_from || "Ngay lập tức";
  const to = record.active_to || "Không giới hạn";
  return `${from} -> ${to}`;
}

function FactoryAssignmentsPanel() {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [assignments, setAssignments] = useState<FactoryManagerRecord[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<EditingAssignment | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<UserRecord | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [userRows, factoryRows, assignmentRows] = await Promise.all([
        pb.collection("users").getFullList<UserRecord>({
          filter: `role="staff"`,
          sort: "full_name,username",
        }),
        fetchFactories(),
        fetchFactoryManagers(),
      ]);
      setStaffUsers(userRows);
      setFactories(factoryRows);
      setAssignments(assignmentRows);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu phân công");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const assignmentsByStaff = useMemo(() => {
    const map = new Map<string, FactoryManagerRecord[]>();
    for (const assignment of assignments) {
      const bucket = map.get(assignment.staff) || [];
      bucket.push(assignment);
      map.set(assignment.staff, bucket);
    }
    return map;
  }, [assignments]);

  const filteredStaff = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return staffUsers;
    return staffUsers.filter((item) =>
      [item.full_name, item.username, item.phone].filter(Boolean).join(" ").toLowerCase().includes(keyword),
    );
  }, [search, staffUsers]);

  const openAdd = (staffId?: string) => {
    setEditingAssignment({ staff: staffId, status: "active" });
    setPickerOpen(true);
  };

  const openEdit = (assignment: FactoryManagerRecord) => {
    setEditingAssignment({ ...assignment });
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setEditingAssignment(null);
  };

  const saveAssignment = async () => {
    if (!currentUser) return;
    if (!editingAssignment?.staff) {
      toast.warning("Chọn staff trước khi lưu");
      return;
    }
    if (!editingAssignment?.factory) {
      toast.warning("Chọn nhà máy trước khi lưu");
      return;
    }

    const payload = {
      staff: editingAssignment.staff,
      factory: editingAssignment.factory,
      active_from: editingAssignment.active_from || null,
      active_to: editingAssignment.active_to || null,
      status: (editingAssignment.status as FactoryStatus) || "active",
      note: editingAssignment.note || "",
    };

    try {
      if (editingAssignment.id) {
        await pb.collection("factory_managers").update(editingAssignment.id, payload);
        await createStaffActionLog({
          actor: currentUser as UserRecord,
          targetUserId: payload.staff,
          targetCollection: "factory_managers",
          targetRecord: editingAssignment.id,
          action: "update",
          after: payload,
          note: "Admin cập nhật phân công nhà máy cho staff",
        });
      } else {
        const created = await pb.collection("factory_managers").create(payload);
        await createStaffActionLog({
          actor: currentUser as UserRecord,
          targetUserId: payload.staff,
          targetCollection: "factory_managers",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin gán nhà máy cho staff",
        });
      }

      toast.success(editingAssignment.id ? "Đã cập nhật phân công" : "Đã gán nhà máy cho staff");
      closePicker();
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Không lưu được phân công");
    }
  };

  const deleteAssignment = async (assignment: FactoryManagerRecord) => {
    if (!currentUser) return;
    if (!confirm(`Xóa quyền quản lý nhà máy "${assignment.expand?.factory?.name || assignment.factory}"?`)) return;

    try {
      await pb.collection("factory_managers").delete(assignment.id);
      await createStaffActionLog({
        actor: currentUser as UserRecord,
        targetUserId: assignment.staff,
        targetCollection: "factory_managers",
        targetRecord: assignment.id,
        action: "delete",
        before: assignment,
        note: "Admin thu hồi quyền quản lý nhà máy của staff",
      });
      toast.success("Đã thu hồi phân công");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Không xóa được phân công");
    }
  };

  const totalAssignments = assignments.length;
  const activeAssignments = assignments.filter((item) => isFactoryAssignmentActive(item)).length;
  const selectedStaffAssignments = selectedStaff ? assignmentsByStaff.get(selectedStaff.id) || [] : [];
  const selectedStaffActiveCount = selectedStaffAssignments.filter((item) => isFactoryAssignmentActive(item)).length;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Cấp quyền QLNM
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusChip tone="info">{totalAssignments} phân công</StatusChip>
            <StatusChip tone="success">{activeAssignments} đang áp dụng</StatusChip>
            <StatusChip tone="neutral">{staffUsers.length} staff</StatusChip>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm staff theo tên, username, SĐT..."
          className="rounded-full pl-9"
        />
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Đang tải phân công...</div>
      ) : staffUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
          Chưa có staff. Hãy chuyển quyền một tài khoản sang Staff trước.
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
          Không tìm thấy staff phù hợp.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStaff.map((staff) => {
            const staffAssignments = assignmentsByStaff.get(staff.id) || [];
            const activeCount = staffAssignments.filter((item) => isFactoryAssignmentActive(item)).length;

            return (
              <button
                key={staff.id}
                type="button"
                onClick={() => setSelectedStaff(staff)}
                className="w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-soft transition active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {staff.full_name || staff.username || "Chưa có tên"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      @{staff.username || "chưa có username"} · {staff.phone || "chưa có SĐT"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusChip tone={staffAssignments.length ? "success" : "neutral"}>
                      {staffAssignments.length} nhà máy
                    </StatusChip>
                    <StatusChip tone={activeCount ? "info" : "neutral"}>
                      {activeCount} hiệu lực
                    </StatusChip>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedStaff} onOpenChange={(open) => !open && setSelectedStaff(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{selectedStaff?.full_name || selectedStaff?.username || "Staff"}</DialogTitle>
            <DialogDescription>
              Quản lý các nhà máy được gán cho staff này.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone="success">{selectedStaffAssignments.length} nhà máy</StatusChip>
              <StatusChip tone={selectedStaffActiveCount ? "info" : "neutral"}>
                {selectedStaffActiveCount} hiệu lực
              </StatusChip>
            </div>

            {selectedStaffAssignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
                Staff này chưa được gán nhà máy nào.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedStaffAssignments.map((assignment) => {
                  const active = isFactoryAssignmentActive(assignment);
                  return (
                    <div
                      key={assignment.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-background/60 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {assignment.expand?.factory?.name || "Nhà máy"}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <CalendarRange className="h-3 w-3" />
                          <span>{formatDateRange(assignment)}</span>
                          <StatusChip tone={active ? "success" : "neutral"}>
                            {active ? "Đang áp dụng" : "Tạm dừng"}
                          </StatusChip>
                        </div>
                        {assignment.note && (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Ghi chú: {assignment.note}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(assignment)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                          aria-label="Sửa phân công"
                          title="Sửa phân công"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAssignment(assignment)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                          aria-label="Thu hồi phân công"
                          title="Thu hồi phân công"
                        >
                          <CircleX className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedStaff(null)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={() => selectedStaff && openAdd(selectedStaff.id)} className="rounded-xl">
              <Plus className="h-4 w-4" />
              Gán nhà máy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && closePicker()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingAssignment?.id ? "Sửa phân công nhà máy" : "Gán nhà máy cho staff"}</DialogTitle>
            <DialogDescription>
              Chọn staff và nhà máy để cấp quyền quản lý nhà máy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Select
                value={editingAssignment?.staff || ""}
                onValueChange={(value) => setEditingAssignment((current) => ({ ...(current || {}), staff: value }))}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn staff" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((staff) => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.full_name || staff.username || staff.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nhà máy</Label>
              <Select
                value={editingAssignment?.factory || ""}
                onValueChange={(value) => setEditingAssignment((current) => ({ ...(current || {}), factory: value }))}
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
                  onChange={(event) =>
                    setEditingAssignment((current) => ({ ...(current || {}), active_from: event.target.value }))
                  }
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  value={editingAssignment?.active_to || ""}
                  onChange={(event) =>
                    setEditingAssignment((current) => ({ ...(current || {}), active_to: event.target.value }))
                  }
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Trạng thái</Label>
              <Select
                value={editingAssignment?.status || "active"}
                onValueChange={(value) =>
                  setEditingAssignment((current) => ({ ...(current || {}), status: value as FactoryStatus }))
                }
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
                onChange={(event) =>
                  setEditingAssignment((current) => ({ ...(current || {}), note: event.target.value }))
                }
                className="rounded-xl"
                placeholder="Ví dụ: phụ trách ca sáng, phụ trách tạm thời..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closePicker} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={saveAssignment} className="rounded-xl">
              <Plus className="h-4 w-4" />
              {editingAssignment?.id ? "Lưu phân công" : "Gán nhà máy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string>(() =>
    Number.isFinite(value) ? new Intl.NumberFormat("vi-VN").format(value) : "",
  );
  useEffect(() => {
    const formatted = Number.isFinite(value) ? new Intl.NumberFormat("vi-VN").format(value) : "";
    const currentDigits = text.replace(/\D/g, "");
    if (currentDigits !== String(value)) setText(formatted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          const n = digits ? Number(digits) : 0;
          setText(digits ? new Intl.NumberFormat("vi-VN").format(n) : "");
          onChange(n);
        }}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FactorySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [factories, setFactories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    pb.collection("factories")
      .getFullList({ sort: "name" })
      .then((res) => {
        if (!cancelled) setFactories(res as any);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);
  const hasMatch = !value || factories.some((f) => f.name === value);
  return (
    <div className="space-y-1">
      <Label className="text-xs">Nhà máy</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Đang tải..." : "Chọn nhà máy"} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {!hasMatch && value && <SelectItem value={value}>{value} (cũ)</SelectItem>}
          {factories.map((f) => (
            <SelectItem key={f.id} value={f.name}>
              {f.name}
            </SelectItem>
          ))}
          {factories.length === 0 && !loading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Chưa có nhà máy. Admin hãy thêm trong Cài đặt hệ thống.
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
