import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb, type Role, type UserRecord, dataUrlToFile, fileUrl } from "@/lib/pocketbase";
import { generateUid } from "@/lib/uid";
import {
  accountIdentityKey,
  buildUserIdentityMaps,
  findUserByUidInsensitive,
  findUserByUsernameInsensitive,
  normalizeAccountUsername,
} from "@/lib/account-identity";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VN_BANKS, resolveBankName } from "@/lib/vn-banks";
import { exportToExcel } from "@/lib/excel";
import { normalizeDate } from "@/lib/date-utils";
import { escapePb } from "@/lib/delegations";
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
  ClipboardList,
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
  Users,
  CalendarRange,
  Pencil,
  CircleX,
  ImagePlus,
  IdCard,
  MoreHorizontal,
  Trash,
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

function buildUserSearchFilter(search: string, extraFilter = "") {
  const q = escapePb(search.trim());
  const searchFilter = q
    ? `(${["full_name", "username", "phone", "employee_code", "company", "role"]
        .map((field) => `${field}~"${q}"`)
        .join(" || ")})`
    : "";
  return [extraFilter, searchFilter].filter(Boolean).join(" && ");
}

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
            <TabsList className="grid h-10 w-full grid-cols-4 rounded-2xl">
              <TabsTrigger value="admin" className="rounded-xl text-xs">
                Tài khoản NLĐ
              </TabsTrigger>
              <TabsTrigger value="staff" className="rounded-xl text-xs">
                Staff & Admin
              </TabsTrigger>
              <TabsTrigger value="factories" className="rounded-xl text-xs">
                QLNM
              </TabsTrigger>
              <TabsTrigger value="profile" className="rounded-xl text-xs">
                Thông tin
              </TabsTrigger>
            </TabsList>
            <TabsContent value="admin" className="mt-0">
              <AdminUsersPanel />
            </TabsContent>
            <TabsContent value="staff" className="mt-0">
              <StaffPanel />
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
  const [cccdFrontFile, setCccdFrontFile] = useState<File | null>(null);
  const [cccdBackFile, setCccdBackFile] = useState<File | null>(null);
  const [cccdFrontPreview, setCccdFrontPreview] = useState<string>("");
  const [cccdBackPreview, setCccdBackPreview] = useState<string>("");
  const [removeFront, setRemoveFront] = useState(false);
  const [removeBack, setRemoveBack] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
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
      cccd: user?.cccd || "",
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
    setCccdFrontFile(null);
    setCccdBackFile(null);
    setCccdFrontPreview(user?.cccd_front ? fileUrl(user, user.cccd_front) : "");
    setCccdBackPreview(user?.cccd_back ? fileUrl(user, user.cccd_back) : "");
    setRemoveFront(false);
    setRemoveBack(false);
    setAvatarFile(null);
    setAvatarPreview(user?.avatar ? fileUrl(user, user.avatar) : "");
    setRemoveAvatar(false);
  }, [user?.id, user?.cccd_front, user?.cccd_back, user?.avatar]);

  const pickCccd = (side: "front" | "back") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn ảnh");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      if (side === "front") {
        setCccdFrontPreview(url);
        setCccdFrontFile(dataUrlToFile(url, file.name || "cccd_front.jpg"));
        setRemoveFront(false);
      } else {
        setCccdBackPreview(url);
        setCccdBackFile(dataUrlToFile(url, file.name || "cccd_back.jpg"));
        setRemoveBack(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearCccd = (side: "front" | "back") => {
    if (side === "front") {
      setCccdFrontFile(null);
      setCccdFrontPreview("");
      setRemoveFront(true);
    } else {
      setCccdBackFile(null);
      setCccdBackPreview("");
      setRemoveBack(true);
    }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = isAdmin
        ? {
            full_name: form.full_name || "",
            phone: form.phone || "",
          }
        : { ...form };
      if (!isAdmin) {
        for (const [k] of NUM_FIELDS) payload[k] = Number(payload[k]) || 0;
      }

      const hasFileChange =
        cccdFrontFile || cccdBackFile || removeFront || removeBack || avatarFile || removeAvatar;
      if (hasFileChange) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(payload)) {
          fd.append(k, (v as any) ?? "");
        }
        if (cccdFrontFile) fd.append("cccd_front", cccdFrontFile);
        else if (removeFront) fd.append("cccd_front", "");
        if (cccdBackFile) fd.append("cccd_back", cccdBackFile);
        else if (removeBack) fd.append("cccd_back", "");
        if (avatarFile) fd.append("avatar", avatarFile);
        else if (removeAvatar) fd.append("avatar", "");
        await pb.collection("users").update(user.id, fd);
      } else {
        await pb.collection("users").update(user.id, payload);
      }
      setCccdFrontFile(null);
      setCccdBackFile(null);
      setAvatarFile(null);
      setRemoveFront(false);
      setRemoveBack(false);
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
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-20 w-20">
            {avatarPreview ? (
              <>
                <img
                  src={avatarPreview}
                  alt="Ảnh đại diện"
                  className="h-20 w-20 rounded-full object-cover border border-border"
                />
                <button
                  type="button"
                  onClick={() => {
                    setAvatarFile(null);
                    setAvatarPreview("");
                    setRemoveAvatar(true);
                  }}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white"
                >
                  <Trash className="h-3 w-3" />
                </button>
              </>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted border border-dashed border-border">
                <User2 className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <label className="cursor-pointer text-xs font-medium text-primary">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  toast.error("Vui lòng chọn ảnh");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  const url = reader.result as string;
                  setAvatarPreview(url);
                  setAvatarFile(dataUrlToFile(url, file.name || "avatar.jpg"));
                  setRemoveAvatar(false);
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }}
            />
            <span className="flex items-center gap-1">
              <ImagePlus className="h-3 w-3" /> Đổi ảnh đại diện
            </span>
          </label>
        </div>
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
            <TextField
              label="CCCD"
              value={form.cccd || ""}
              onChange={(v) => setForm({ ...form, cccd: v.replace(/\D/g, "") })}
            />
            <FactorySelect
              value={form.company}
              onChange={(v) => setForm({ ...form, company: v })}
            />
            <TextField
              label="Mã NV"
              value={form.employee_code}
              onChange={(v) => setForm({ ...form, employee_code: v })}
            />
          </>
        )}
      </Section>

      {!isAdmin && (
        <Section title="Ảnh CCCD">
          <p className="text-[11px] text-muted-foreground">
            Tải lên 2 ảnh CCCD: mặt trước và mặt sau. Ảnh dùng cho hồ sơ cá nhân, không gắn với từng
            lịch sử đi làm.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <CccdUploader
              label="Mặt trước"
              preview={cccdFrontPreview}
              onPick={pickCccd("front")}
              onClear={() => clearCccd("front")}
            />
            <CccdUploader
              label="Mặt sau"
              preview={cccdBackPreview}
              onPick={pickCccd("back")}
              onClear={() => clearCccd("back")}
            />
          </div>
        </Section>
      )}

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

      <ChangePasswordSection />
    </>
  );
}

function ChangePasswordSection() {
  const { user } = useAuth();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changing, setChanging] = useState(false);

  const changePassword = async () => {
    if (!user) return;
    if (!oldPwd || !newPwd || !confirmPwd) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    if (newPwd.length < 8) {
      toast.error("Mật khẩu mới tối thiểu 8 ký tự");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Mật khẩu mới không khớp");
      return;
    }
    setChanging(true);
    try {
      await pb.collection("users").update(user.id, {
        oldPassword: oldPwd,
        password: newPwd,
        passwordConfirm: confirmPwd,
        must_change_password: false,
      });
      toast.success("Đổi mật khẩu thành công");
      setOldPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: any) {
      toast.error(e?.response?.message || e?.message || "Mật khẩu cũ không đúng");
    } finally {
      setChanging(false);
    }
  };

  return (
    <Section title="Đổi mật khẩu">
      <TextField label="Mật khẩu hiện tại" type="password" value={oldPwd} onChange={setOldPwd} />
      <TextField
        label="Mật khẩu mới (≥ 8 ký tự)"
        type="password"
        value={newPwd}
        onChange={setNewPwd}
      />
      <TextField
        label="Xác nhận mật khẩu mới"
        type="password"
        value={confirmPwd}
        onChange={setConfirmPwd}
      />
      <Button onClick={changePassword} disabled={changing} className="w-full" variant="outline">
        <KeyRound className="h-4 w-4" /> Đổi mật khẩu
      </Button>
    </Section>
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
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [pendingApprovalValue, setPendingApprovalValue] = useState<boolean | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [detailUser, setDetailUser] = useState<any>(null);
  const [bulkStaffProcessing, setBulkStaffProcessing] = useState(false);
  const emptyNew = {
    full_name: "",
    phone: "",
    username: "",
    password: "",
    uid: "",
    company: "",
    employee_code: "",
  };
  const [newUser, setNewUser] = useState<any>(emptyNew);

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("users").getList(1, 500, {
        filter: buildUserSearchFilter(search, me?.id ? `id!="${escapePb(me.id)}"` : ""),
        sort: "-created",
      });
      setUsers(res.items);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải");
    } finally {
      setLoading(false);
    }

    try {
      const s = await pb.collection("app_settings").getList(1, 1);
      if (s.items[0]) {
        setSettingsId(s.items[0].id);
        setRequireApproval(Boolean(s.items[0].requireApproval));
      }
    } catch {
      // Collection settings có thể chưa được khởi tạo ở môi trường mới.
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, me?.id]);

  const filtered = users;

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

  const formatUserRow = (u: any, i: number) => ({
    STT: i + 1,
    "Họ tên": u.full_name || "",
    "Tên đăng nhập": u.username || "",
    "Số điện thoại": u.phone || "",
    "Giới tính": u.gender || "",
    CCCD: u.cccd || "",
    "Ngày sinh": u.date_of_birth ? new Date(u.date_of_birth).toLocaleDateString("vi-VN") : "",
    "Địa chỉ": u.address || "",
    "Mã tài khoản": u.uid || "",
    "Mã nhân viên": u.employee_code || "",
    "Nhà máy": u.company || "",
    "Ngân hàng": u.bank_name || "",
    "Số tài khoản": u.bank_account_number || "",
    "Tên tài khoản": u.bank_account_name || "",
    "Vai trò": ROLE_LABELS[(u.role || "user") as Role],
    "Ngày tạo": new Date(u.created).toLocaleDateString("vi-VN"),
    "Trạng thái": isUserApproved(u) ? "Hoạt động" : "Vô hiệu hoá",
  });

  const exportExcel = () => {
    const rows = filtered.map(formatUserRow);
    exportToExcel("danh_sach_tai_khoan_" + Date.now(), { "Tài khoản": rows });
  };

  const exportAll = async () => {
    try {
      const all = await pb.collection("users").getFullList({ sort: "-created" });
      const rows = all.map(formatUserRow);
      exportToExcel("tat_ca_tai_khoan_" + Date.now(), { "Tài khoản": rows });
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xuất dữ liệu");
    }
  };

  const bulkDisable = async (disable: boolean) => {
    if (!confirm((disable ? "Vô hiệu hoá" : "Kích hoạt") + " " + selected.size + " tài khoản?"))
      return;
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

  const downloadStaffTemplate = () => {
    const sample = [
      { "Tên đăng nhập": "nguyenvana", "Nhà máy": "Nhà máy A" },
      { "Tên đăng nhập": "tranthib", "Nhà máy": "" },
    ];
    exportToExcel("mau_chuyen_staff", { "Chuyển Staff": sample });
  };

  const onImportStaff = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !me) return;
    setBulkStaffProcessing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      const factories = await pb.collection("factories").getFullList({ sort: "name" });
      const factoryMap = new Map(factories.map((f: any) => [f.name.toLowerCase(), f.id]));
      const allUsers = await pb.collection("users").getFullList<UserRecord>({
        fields: "id,username,uid,role",
      });
      const { userByUid, userByUsername } = buildUserIdentityMaps(allUsers);

      let ok = 0;
      let fail = 0;
      let assigned = 0;
      const errors: string[] = [];

      for (const r of rows) {
        const username = String(
          r["Tên đăng nhập"] || r["username"] || r["Mã tài khoản"] || r["uid"] || "",
        ).trim();
        const identityKey = accountIdentityKey(username);
        const factoryName = String(r["Nhà máy"] || r["factory"] || "").trim();

        if (!identityKey) {
          fail++;
          errors.push("???: thiếu tên đăng nhập");
          continue;
        }

        const factoryId = factoryName ? factoryMap.get(factoryName.toLowerCase()) : null;
        if (factoryName && !factoryId) {
          fail++;
          errors.push(username + ': không tìm thấy nhà máy "' + factoryName + '"');
          continue;
        }

        try {
          const user = userByUsername.get(identityKey) || userByUid.get(identityKey);
          if (!user) {
            fail++;
            errors.push(username + ": không tìm thấy tài khoản");
            continue;
          }
          await pb.collection("users").update(user.id, { role: "staff" });
          if (factoryId) {
            await pb.collection("factory_managers").create({
              staff: user.id,
              factory: factoryId,
              status: "active",
              active_from: null,
              active_to: null,
              note: "Gán từ Excel bởi admin",
            });
            assigned++;
          }
          await createStaffActionLog({
            actor: me as UserRecord,
            targetUserId: user.id,
            targetCollection: "users",
            targetRecord: user.id,
            action: "update",
            after: { role: "staff", ...(factoryId ? { factory: factoryId } : {}) },
            note: factoryId
              ? "Admin chuyển sang staff và gán nhà máy (import Excel)"
              : "Admin chuyển sang staff không gán nhà máy (import Excel)",
          });
          ok++;
        } catch (err: any) {
          fail++;
          errors.push(username + ": " + (err?.message || "lỗi"));
        }
      }

      toast.success(
        "Đã chuyển " +
          ok +
          " tài khoản sang Staff" +
          (assigned ? ", gán " + assigned + " nhà máy" : "") +
          (fail ? ", " + fail + " lỗi" : ""),
      );
      if (errors.length) console.warn("Import staff errors:", errors);
      load();
    } catch (err: any) {
      toast.error(err?.message || "File không hợp lệ");
    } finally {
      setBulkStaffProcessing(false);
    }
  };

  const toggleApprovalRequirement = async (val: boolean) => {
    setRequireApproval(val);
    try {
      if (settingsId) {
        await pb.collection("app_settings").update(settingsId, { requireApproval: val });
      } else {
        const r = await pb.collection("app_settings").create({ requireApproval: val });
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
      load();
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
      toast.success(
        targets.length ? "Đã gửi đến " + targets.length + " người" : "Đã gửi tới tất cả",
      );
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
    const username = normalizeAccountUsername(newUser.username);
    const password = newUser.password || "";
    const manualUid = (newUser.uid || "").trim();
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
      const existingUser = await findUserByUsernameInsensitive(username);
      if (existingUser) {
        toast.error("Tên đăng nhập đã tồn tại");
        return;
      }
      if (manualUid && (await findUserByUidInsensitive(manualUid))) {
        toast.error("Mã tài khoản đã tồn tại");
        return;
      }
      const uid = await generateUid(manualUid || undefined);
      await pb.collection("users").create({
        full_name,
        phone,
        username,
        uid,
        password,
        company,
        employee_code,
        passwordConfirm: password,
        role: "user",
        approvalStatus: "approved",
        approved: "true",
        status: "active",
        must_change_password: password === "12345678",
      });
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
        "Mã tài khoản": "",
        "Giới tính": "Nam",
        CCCD: "001099012345",
        "Ngày sinh": "1990-01-15",
        "Địa chỉ": "123 Đường ABC, Quận 1, TP.HCM",
        "Ngân hàng": "VCB",
        "Số tài khoản": "1234567890",
        "Tên tài khoản": "NGUYEN VAN A",
      },
      {
        "Họ tên": "Trần Thị B",
        "Số điện thoại": "0900000002",
        "Tên đăng nhập": "tranthib",
        "Mật khẩu": "12345678",
        "Mã tài khoản": "",
        "Giới tính": "Nữ",
        CCCD: "001099067890",
        "Ngày sinh": "20/03/1995",
        "Địa chỉ": "456 Đường XYZ, Quận 7, TP.HCM",
        "Ngân hàng": "TCB",
        "Số tài khoản": "0987654321",
        "Tên tài khoản": "TRAN THI B",
      },
    ];
    exportToExcel("mau_nhap_tai_khoan", { "Tài khoản": sample });
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
      const failedRows: Array<Record<string, unknown>> = [];
      const existingUsers = await pb.collection("users").getFullList<UserRecord>({
        fields: "id,username,uid",
      });
      const existingUsernameKeys = new Set(
        existingUsers.map((user) => accountIdentityKey(user.username)).filter(Boolean),
      );
      const existingUidKeys = new Set(
        existingUsers.map((user) => accountIdentityKey(user.uid)).filter(Boolean),
      );
      for (const [index, r] of rows.entries()) {
        const rowNum = index + 2;
        const full_name = String(r["Họ tên"] || r["full_name"] || "").trim();
        const phone = String(r["Số điện thoại"] || r["phone"] || "").trim();
        const username = String(r["Tên đăng nhập"] || r["username"] || "").trim();
        const normalizedUsername = normalizeAccountUsername(username);
        const password = String(r["Mật khẩu"] || r["password"] || "").trim();
        const manualUid = String(r["Mã tài khoản"] || r["Mã TK"] || r["uid"] || "").trim();
        const gender = String(r["Giới tính"] || r["gender"] || "").trim();
        const cccd = String(r["CCCD"] || r["cccd"] || "").trim();
        const date_of_birth = normalizeDate(r["Ngày sinh"] ?? r["date_of_birth"] ?? "");
        const address = String(r["Địa chỉ"] || r["address"] || "").trim();
        const bank_name = resolveBankName(String(r["Ngân hàng"] || r["bank_name"] || "").trim());
        const bank_account_number = String(
          r["Số tài khoản"] || r["Số TK"] || r["bank_account_number"] || "",
        ).trim();
        const bank_account_name = String(
          r["Tên tài khoản"] || r["Tên TK"] || r["bank_account_name"] || "",
        ).trim();
        if (!full_name || !phone || !normalizedUsername || !password) {
          fail++;
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Thiếu thông tin bắt buộc (họ tên/SĐT/username/mật khẩu)", ...r });
          continue;
        }
        if (existingUsernameKeys.has(normalizedUsername)) {
          fail++;
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Tên đăng nhập đã tồn tại", ...r });
          continue;
        }
        const manualUidKey = accountIdentityKey(manualUid);
        if (manualUidKey && existingUidKeys.has(manualUidKey)) {
          fail++;
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Mã tài khoản đã tồn tại", ...r });
          continue;
        }
        if (password.length < 8) {
          fail++;
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Mật khẩu < 8 ký tự", ...r });
          continue;
        }
        try {
          const uid = await generateUid(manualUid || undefined);
          await pb.collection("users").create({
            full_name,
            phone,
            username: normalizedUsername,
            uid,
            password,
            passwordConfirm: password,
            gender,
            cccd,
            date_of_birth,
            address,
            bank_name,
            bank_account_number,
            bank_account_name,
            role: "user",
            approvalStatus: "approved",
            status: "active",
            must_change_password: password === "12345678",
          });
          existingUsernameKeys.add(normalizedUsername);
          existingUidKeys.add(accountIdentityKey(uid));
          ok++;
        } catch (err: any) {
          fail++;
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": err?.response?.message || err?.message || "Lỗi tạo tài khoản", ...r });
        }
      }
      toast.success("Đã nhập " + ok + " tài khoản" + (fail ? ", " + fail + " lỗi" : ""));
      if (failedRows.length) {
        exportToExcel(`import_tai_khoan_loi_${Date.now()}`, { "Dòng lỗi": failedRows });
        toast.warning("Đã xuất file các dòng lỗi");
      }
      load();
    } catch (err: any) {
      toast.error(err?.message || "File không hợp lệ");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <Link
        to="/admin/accounts/logs"
        className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 p-3 transition hover:bg-muted/50"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ClipboardList className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Nhật ký thao tác</span>
          <span className="block text-[11px] text-muted-foreground">
            Xem lịch sử tác động của staff và admin lên tài khoản
          </span>
        </span>
      </Link>

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Quản lý tài khoản ({users.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Tạo nhanh bên ngoài, các thao tác nhập/xuất/Staff nằm trong bảng thao tác.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <Button size="sm" onClick={() => setCreateOpen(true)} className="rounded-full">
            <UserPlus className="h-3.5 w-3.5" /> Tạo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActionSheetOpen(true)}
            className="rounded-full"
          >
            <MoreHorizontal className="h-3.5 w-3.5" /> Thao tác
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
        <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-2">
          <span className="min-w-0 flex-1 text-xs font-medium text-primary">
            {selected.size} đã chọn
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActionSheetOpen(true)}
            className="rounded-full bg-background"
          >
            <MoreHorizontal className="h-3.5 w-3.5" /> Hàng loạt
          </Button>
        </div>
      )}

      <Sheet open={actionSheetOpen} onOpenChange={setActionSheetOpen}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-3xl p-4">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Thao tác quản trị</SheetTitle>
            <SheetDescription>
              Gom các thao tác tạo, nhập, xuất, staff và xử lý hàng loạt cho gọn trên mobile.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-5">
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tạo
              </div>
              <Button
                onClick={() => {
                  setActionSheetOpen(false);
                  setCreateOpen(true);
                }}
                className="w-full justify-start rounded-2xl"
              >
                <UserPlus className="h-4 w-4" /> Tạo tài khoản mới
              </Button>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nhập
              </div>
              <label
                className={
                  "flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent " +
                  (importing ? "pointer-events-none opacity-50" : "")
                }
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    setActionSheetOpen(false);
                    onImportFile(e);
                  }}
                  disabled={importing}
                />
                <Upload className="h-4 w-4" /> {importing ? "Đang nhập..." : "Nhập Excel tài khoản"}
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  setActionSheetOpen(false);
                  downloadTemplate();
                }}
                className="w-full justify-start rounded-2xl"
              >
                <FileSpreadsheet className="h-4 w-4" /> Tải mẫu nhập tài khoản
              </Button>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Xuất
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setActionSheetOpen(false);
                  exportExcel();
                }}
                className="w-full justify-start rounded-2xl"
              >
                <FileDown className="h-4 w-4" /> Xuất danh sách đang lọc
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setActionSheetOpen(false);
                  exportAll();
                }}
                className="w-full justify-start rounded-2xl"
              >
                <FileDown className="h-4 w-4" /> Xuất tất cả tài khoản
              </Button>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Staff
              </div>
              <label
                className={
                  "flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent " +
                  (bulkStaffProcessing ? "pointer-events-none opacity-50" : "")
                }
              >
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    setActionSheetOpen(false);
                    onImportStaff(e);
                  }}
                  disabled={bulkStaffProcessing}
                />
                <Building2 className="h-4 w-4" />{" "}
                {bulkStaffProcessing ? "Đang xử lý..." : "Nhập danh sách Staff"}
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  setActionSheetOpen(false);
                  downloadStaffTemplate();
                }}
                className="w-full justify-start rounded-2xl"
              >
                <FileSpreadsheet className="h-4 w-4" /> Tải mẫu chuyển Staff
              </Button>
            </section>

            <Separator />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Hàng loạt
                </div>
                <span className="text-xs text-muted-foreground">{selected.size} đã chọn</span>
              </div>
              {selected.size === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Chọn tài khoản trong danh sách để mở thao tác hàng loạt.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActionSheetOpen(false);
                      setGuideOpen(true);
                    }}
                    className="justify-start rounded-2xl"
                  >
                    <Send className="h-3.5 w-3.5" /> Gửi HD
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActionSheetOpen(false);
                      bulkDisable(false);
                    }}
                    className="justify-start rounded-2xl"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Kích hoạt
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActionSheetOpen(false);
                      bulkDisable(true);
                    }}
                    className="justify-start rounded-2xl"
                  >
                    <Ban className="h-3.5 w-3.5" /> Vô hiệu
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setActionSheetOpen(false);
                      bulkDelete();
                    }}
                    className="justify-start rounded-2xl"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Xoá
                  </Button>
                </div>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

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
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setDetailUser(u)}>
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
                    <span className="chip chip-info">
                      {ROLE_LABELS[(u.role || "user") as Role]}
                    </span>
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
              Chọn vai trò mới cho{" "}
              {roleTarget?.full_name || roleTarget?.username || "tài khoản này"}.
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
              Sau khi xác thực, hệ thống sẽ {pendingApprovalValue ? "bật" : "tắt"} yêu cầu duyệt khi
              đăng ký.
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
              label="Mã tài khoản"
              value={newUser.uid}
              onChange={(v) => setNewUser({ ...newUser, uid: v })}
              placeholder="Để trống để tự sinh"
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

      {/* User detail dialog */}
      <Dialog open={!!detailUser} onOpenChange={(o) => !o && setDetailUser(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {detailUser?.full_name || detailUser?.username || "Tài khoản"}
            </DialogTitle>
            <DialogDescription>Thông tin chi tiết tài khoản</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-3 text-sm">
              <DetailRow label="Tên đăng nhập" value={detailUser.username} />
              <DetailRow label="Họ và tên" value={detailUser.full_name} />
              <DetailRow label="Số điện thoại" value={detailUser.phone} />
              <DetailRow label="Giới tính" value={detailUser.gender} />
              <DetailRow label="CCCD" value={detailUser.cccd} />
              <DetailRow
                label="Ngày sinh"
                value={
                  detailUser.date_of_birth
                    ? detailUser.date_of_birth.slice(0, 10).split("-").reverse().join("/")
                    : ""
                }
              />
              <DetailRow label="Địa chỉ" value={detailUser.address} />
              <DetailRow label="Mã tài khoản (UID)" value={detailUser.uid} />
              <DetailRow label="Mã nhân viên" value={detailUser.employee_code} />
              <DetailRow label="Nhà máy" value={detailUser.company} />
              <DetailRow label="Ngân hàng" value={detailUser.bank_name} />
              <DetailRow label="Số tài khoản" value={detailUser.bank_account_number} />
              <DetailRow label="Tên tài khoản" value={detailUser.bank_account_name} />
              <DetailRow label="Vai trò" value={ROLE_LABELS[(detailUser.role || "user") as Role]} />
              <DetailRow
                label="Trạng thái"
                value={isUserApproved(detailUser) ? "Hoạt động" : "Vô hiệu hoá"}
              />
              <DetailRow
                label="Ngày tạo"
                value={new Date(detailUser.created).toLocaleDateString("vi-VN")}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailUser(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || "—"}</span>
    </div>
  );
}

type EditingAssignment = Partial<FactoryManagerRecord> & { staff?: string };

function formatDateRange(record: FactoryManagerRecord) {
  const from = record.active_from || "Ngay lập tức";
  const to = record.active_to || "Không giới hạn";
  return `${from} -> ${to}`;
}

const STAFF_DEFAULT_PASSWORD = "nv123456";

function staffSearchFilter(search: string) {
  const q = escapePb(search.trim());
  const roleFilter = '(role="staff" || role="admin")';
  if (!q) return roleFilter;
  const searchFilter = `(${["full_name", "username", "phone", "address"]
    .map((field) => `${field}~"${q}"`)
    .join(" || ")})`;
  return `${roleFilter} && ${searchFilter}`;
}

function StaffPanel() {
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [importingStaff, setImportingStaff] = useState(false);
  const [importResult, setImportResult] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [userRows, factoryRows, assignmentRows] = await Promise.all([
        pb
          .collection("users")
          .getList<UserRecord>(1, 500, {
            filter: staffSearchFilter(search),
            sort: "full_name,username",
          })
          .then((res) => res.items),
        fetchFactories(),
        fetchFactoryManagers(),
      ]);
      setStaffUsers(userRows);
      setFactories(factoryRows);
      const counts: Record<string, number> = {};
      for (const row of assignmentRows) {
        if (isFactoryAssignmentActive(row)) {
          counts[row.staff] = (counts[row.staff] || 0) + 1;
        }
      }
      setAssignmentCounts(counts);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu staff");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search]);

  const summary = useMemo(
    () => ({
      admin: staffUsers.filter((u) => u.role === "admin").length,
      staff: staffUsers.filter((u) => u.role === "staff").length,
    }),
    [staffUsers],
  );

  const downloadTemplate = () => {
    exportToExcel("mau_import_staff", {
      Staff: [
        {
          username: "nguyenvana",
          full_name: "Nguyễn Văn A",
          phone: "0901234567",
          date_of_birth: "1990-05-15",
          address: "Hà Nội",
          password: "",
          "Nhà máy 1": "Nhà máy A",
          "Nhà máy 2": "Nhà máy B",
          "Nhà máy 3": "",
        },
      ],
    });
  };

  const importStaff = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingStaff(true);
    setImportResult("");
    try {
      const factoryRows = await fetchFactories();
      const factoryByName = new Map(factoryRows.map((f) => [f.name.toLowerCase(), f]));

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      let created = 0;
      let failed = 0;
      const failedRows: Array<Record<string, unknown>> = [];

      const pickVal = (row: Record<string, unknown>, keys: string[]) => {
        for (const key of keys) {
          const value = row[key];
          if (value === undefined || value === null) continue;
          const text = String(value).trim();
          if (text) return text;
        }
        return "";
      };

      for (const [index, row] of rows.entries()) {
        const rowNum = index + 2;
        const username = normalizeAccountUsername(
          pickVal(row, ["username", "Tên đăng nhập"]),
        );
        const fullName = pickVal(row, ["full_name", "Họ tên", "Họ và tên"]);
        const phone = pickVal(row, ["phone", "Số điện thoại", "SĐT"]);
        const dob = pickVal(row, ["date_of_birth", "Ngày sinh"]);
        const address = pickVal(row, ["address", "Địa chỉ"]);
        const password = pickVal(row, ["password", "Mật khẩu"]) || STAFF_DEFAULT_PASSWORD;

        if (!username) {
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Thiếu username", ...row });
          failed++;
          continue;
        }
        if (!/^[a-z0-9_.]{4,30}$/.test(username)) {
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Username không hợp lệ (4-30 ký tự, chỉ chữ/số/._)", ...row });
          failed++;
          continue;
        }
        if (!fullName) {
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": "Thiếu họ tên", ...row });
          failed++;
          continue;
        }

        const existing = await findUserByUsernameInsensitive(username);
        if (existing) {
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": `Username "${username}" đã tồn tại`, ...row });
          failed++;
          continue;
        }

        try {
          const uid = await generateUid();
          const newUser = await pb.collection("users").create({
            username,
            uid,
            full_name: fullName,
            phone: phone || undefined,
            date_of_birth: dob || undefined,
            address: address || undefined,
            password,
            passwordConfirm: password,
            role: "staff",
            approvalStatus: "approved",
            approved: "true",
            status: "active",
            must_change_password: true,
            emailVisibility: false,
          });

          const factoryCols = Object.keys(row).filter(
            (k) => /^nhà máy/i.test(k) || /^Nhà máy/i.test(k) || /^factory/i.test(k),
          );
          for (const col of factoryCols) {
            const factoryName = String(row[col] || "").trim();
            if (!factoryName) continue;
            const factory = factoryByName.get(factoryName.toLowerCase());
            if (factory) {
              await pb.collection("factory_managers").create({
                staff: newUser.id,
                factory: factory.id,
                status: "active",
              });
            }
          }

          await createStaffActionLog({
            actor: currentUser,
            targetUserId: newUser.id,
            targetCollection: "users",
            targetRecord: newUser.id,
            action: "create",
            after: { username, full_name: fullName, role: "staff", uid },
            note: "Admin import tạo tài khoản staff từ Excel",
          });
          created++;
        } catch (error: any) {
          failedRows.push({ Dòng: rowNum, "Lý do lỗi": error?.message || "Lỗi tạo tài khoản", ...row });
          failed++;
        }
      }

      const resultText = `Tạo staff: thành công ${created}, lỗi ${failed}`;
      setImportResult(resultText);
      toast.success(resultText);
      if (failedRows.length) {
        exportToExcel(`staff_import_loi_${Date.now()}`, { "Dòng lỗi": failedRows });
        toast.warning("Đã xuất file các dòng lỗi");
      }
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi đọc file import staff");
    } finally {
      setImportingStaff(false);
    }
  };

  const submitCreateStaff = async (form: { username: string; full_name: string; phone: string; date_of_birth: string; address: string; password: string }) => {
    const username = normalizeAccountUsername(form.username);
    if (!username) { toast.error("Nhập tên đăng nhập"); return false; }
    if (!/^[a-z0-9_.]{4,30}$/.test(username)) { toast.error("Tên đăng nhập 4-30 ký tự, chỉ chữ/số/._"); return false; }
    if (!form.full_name.trim()) { toast.error("Nhập họ và tên"); return false; }

    const existing = await findUserByUsernameInsensitive(username);
    if (existing) { toast.error("Tên đăng nhập đã tồn tại"); return false; }

    const password = form.password.trim() || STAFF_DEFAULT_PASSWORD;
    const uid = await generateUid();

    const newUser = await pb.collection("users").create({
      username, uid,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || undefined,
      date_of_birth: form.date_of_birth || undefined,
      address: form.address.trim() || undefined,
      password, passwordConfirm: password,
      role: "staff", approvalStatus: "approved", approved: "true", status: "active",
      must_change_password: true, emailVisibility: false,
    });

    await createStaffActionLog({
      actor: currentUser,
      targetUserId: newUser.id, targetCollection: "users", targetRecord: newUser.id,
      action: "create",
      after: { username, full_name: form.full_name.trim(), role: "staff", uid },
      note: "Admin tạo tài khoản staff trực tiếp",
    });

    toast.success(`Đã tạo staff "${form.full_name.trim()}" (mật khẩu: ${password})`);
    await load();
    return true;
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <StatusChip tone="info">{summary.admin} admin</StatusChip>
          <StatusChip tone="success">{summary.staff} staff</StatusChip>
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Tạo staff
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importingStaff} onChange={importStaff} />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-xs font-medium">
            <Upload className="h-3.5 w-3.5" /> {importingStaff ? "Đang import..." : "Import Excel"}
          </span>
        </label>
      </div>

      {importResult && (
        <div className="rounded-xl bg-primary/5 p-3 text-sm text-primary">{importResult}</div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm staff theo tên, username, SĐT..."
          className="rounded-full pl-9"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl p-4 text-sm text-muted-foreground">Đang tải...</div>
      ) : staffUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
          Chưa có staff. Tạo mới hoặc import từ Excel.
        </div>
      ) : (
        <div className="space-y-2">
          {staffUsers.map((staff) => {
            const factoryCount = assignmentCounts[staff.id] || 0;
            return (
              <div key={staff.id} className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {staff.full_name || staff.username || "Chưa có tên"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    @{staff.username || "—"} · {staff.phone || "chưa có SĐT"}
                  </div>
                  {(staff.date_of_birth || staff.address) && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {staff.date_of_birth && `Sinh: ${staff.date_of_birth}`}
                      {staff.date_of_birth && staff.address && " · "}
                      {staff.address && `ĐC: ${staff.address}`}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusChip tone={staff.role === "admin" ? "info" : "success"}>
                    {staff.role === "admin" ? "Admin" : "Staff"}
                  </StatusChip>
                  <StatusChip tone={factoryCount ? "info" : "neutral"}>
                    {factoryCount ? `${factoryCount} NM` : "Chưa gán"}
                  </StatusChip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateStaffDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreateStaff}
      />
    </Card>
  );
}

function CreateStaffDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: { username: string; full_name: string; phone: string; date_of_birth: string; address: string; password: string }) => Promise<boolean>;
}) {
  const [form, setForm] = useState({ username: "", full_name: "", phone: "", date_of_birth: "", address: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setForm({ username: "", full_name: "", phone: "", date_of_birth: "", address: "", password: "" });
  }, [open]);

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ok = await onSubmit(form);
      if (ok) onClose();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi tạo tài khoản staff");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Tạo staff mới</DialogTitle>
          <DialogDescription>
            Mật khẩu mặc định &quot;{STAFF_DEFAULT_PASSWORD}&quot; (yêu cầu đổi khi đăng nhập).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tên đăng nhập <span className="text-destructive">*</span></Label>
            <Input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="VD: nguyenvana" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Họ và tên <span className="text-destructive">*</span></Label>
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="VD: Nguyễn Văn A" className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Số điện thoại</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Tùy chọn" className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ngày sinh</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="rounded-xl" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Địa chỉ</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Tùy chọn" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mật khẩu</Label>
            <Input value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={`Để trống = "${STAFF_DEFAULT_PASSWORD}"`} className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">Đóng</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl">
              <Plus className="h-4 w-4" /> {submitting ? "Đang tạo..." : "Tạo staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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
        pb
          .collection("users")
          .getList<UserRecord>(1, 200, {
            filter: buildUserSearchFilter(search, `role="staff"`),
            sort: "full_name,username",
          })
          .then((res) => res.items),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const assignmentsByStaff = useMemo(() => {
    const map = new Map<string, FactoryManagerRecord[]>();
    for (const assignment of assignments) {
      const bucket = map.get(assignment.staff) || [];
      bucket.push(assignment);
      map.set(assignment.staff, bucket);
    }
    return map;
  }, [assignments]);

  const filteredStaff = staffUsers;

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
    if (
      !confirm(
        `Xóa quyền quản lý nhà máy "${assignment.expand?.factory?.name || assignment.factory}"?`,
      )
    )
      return;

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
  const selectedStaffAssignments = selectedStaff
    ? assignmentsByStaff.get(selectedStaff.id) || []
    : [];
  const selectedStaffActiveCount = selectedStaffAssignments.filter((item) =>
    isFactoryAssignmentActive(item),
  ).length;

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
            const activeCount = staffAssignments.filter((item) =>
              isFactoryAssignmentActive(item),
            ).length;

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
            <DialogTitle>
              {selectedStaff?.full_name || selectedStaff?.username || "Staff"}
            </DialogTitle>
            <DialogDescription>Quản lý các nhà máy được gán cho staff này.</DialogDescription>
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
            <Button
              onClick={() => selectedStaff && openAdd(selectedStaff.id)}
              className="rounded-xl"
            >
              <Plus className="h-4 w-4" />
              Gán nhà máy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerOpen} onOpenChange={(open) => !open && closePicker()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAssignment?.id ? "Sửa phân công nhà máy" : "Gán nhà máy cho staff"}
            </DialogTitle>
            <DialogDescription>
              Chọn staff và nhà máy để cấp quyền quản lý nhà máy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Staff</Label>
              <Select
                value={editingAssignment?.staff || ""}
                onValueChange={(value) =>
                  setEditingAssignment((current) => ({ ...(current || {}), staff: value }))
                }
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
                onValueChange={(value) =>
                  setEditingAssignment((current) => ({ ...(current || {}), factory: value }))
                }
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
                    setEditingAssignment((current) => ({
                      ...(current || {}),
                      active_from: event.target.value,
                    }))
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
                    setEditingAssignment((current) => ({
                      ...(current || {}),
                      active_to: event.target.value,
                    }))
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
                  setEditingAssignment((current) => ({
                    ...(current || {}),
                    status: value as FactoryStatus,
                  }))
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
                  setEditingAssignment((current) => ({
                    ...(current || {}),
                    note: event.target.value,
                  }))
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function CccdUploader({
  label,
  preview,
  onPick,
  onClear,
}: {
  label: string;
  preview: string;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative aspect-[1.586/1] overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
        {preview ? (
          <>
            <img src={preview} alt={label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={onClear}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={`Xoá ${label}`}
            >
              <Trash className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground">
            <input type="file" accept="image/*" hidden onChange={onPick} />
            <IdCard className="h-6 w-6" />
            <span className="text-[11px] font-medium">Bấm để chọn ảnh</span>
          </label>
        )}
      </div>
      {preview && (
        <label className="block cursor-pointer">
          <input type="file" accept="image/*" hidden onChange={onPick} />
          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
            <ImagePlus className="h-3 w-3" /> Đổi ảnh
          </span>
        </label>
      )}
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
      .getList(1, 300, { sort: "name" })
      .then((res) => {
        if (!cancelled) setFactories(res.items as any);
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
