import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  KeyRound,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { exportToExcel } from "@/lib/excel";
import { escapePb, userDisplayName, type UserDelegationRecord } from "@/lib/delegations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Mode = "user" | "admin";

const MAX_DELEGATIONS = 3;

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

const pick = (row: Record<string, unknown>, keys: string[]) => {
  const normalized = new Map(Object.keys(row).map((key) => [normalize(key), key]));
  for (const key of keys) {
    const sourceKey = normalized.get(normalize(key));
    if (sourceKey && String(row[sourceKey] ?? "").trim()) return row[sourceKey];
  }
  return "";
};

const parseBool = (value: unknown, fallback = true) => {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const text = normalize(raw);
  if (["0", "no", "false", "khong", "xoa", "off"].includes(text)) return false;
  return true;
};

function userKey(user: UserRecord) {
  return [user.username, user.employee_code, user.phone, user.id]
    .filter(Boolean)
    .map((value) => normalize(value))
    .filter(Boolean);
}

function buildUserMap(users: UserRecord[]) {
  const map = new Map<string, UserRecord>();
  for (const user of users) for (const key of userKey(user)) map.set(key, user);
  return map;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function DelegationPanel({ mode }: { mode: Mode }) {
  const { user } = useAuth();
  const isAdminMode = mode === "admin";
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [items, setItems] = useState<UserDelegationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [grantorId, setGrantorId] = useState(user?.id || "");
  const [delegateeId, setDelegateeId] = useState("");
  const [canAdvance, setCanAdvance] = useState(true);
  const [canCheck, setCanCheck] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [userRes, delegationRes] = await Promise.all([
        pb.collection("users").getFullList({ sort: "full_name" }),
        pb.collection("user_delegations").getFullList({
          filter: isAdminMode
            ? ""
            : `grantor="${escapePb(user?.id || "")}" || delegatee="${escapePb(user?.id || "")}"`,
          sort: "-created",
          expand: "grantor,delegatee",
        }),
      ]);
      const normalUsers = (userRes as unknown as UserRecord[]).filter(
        (row) => row.role !== "admin",
      );
      setUsers(normalUsers);
      setItems(delegationRes as unknown as UserDelegationRecord[]);
      if (!isAdminMode && user?.id) setGrantorId(user.id);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không tải được ủy quyền"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMode, user?.id]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = normalize(search);
    return items.filter((item) => {
      const grantor = item.expand?.grantor;
      const delegatee = item.expand?.delegatee;
      return normalize(`${userDisplayName(grantor)} ${userDisplayName(delegatee)}`).includes(q);
    });
  }, [items, search]);

  const grantorCount = (id: string) => items.filter((item) => item.grantor === id).length;
  const selectableUsers = users.filter((row) => row.id !== grantorId);

  const resetForm = () => {
    setDelegateeId("");
    setCanAdvance(true);
    setCanCheck(true);
    if (!isAdminMode && user?.id) setGrantorId(user.id);
  };

  const save = async () => {
    const ownerId = isAdminMode ? grantorId : user?.id;
    if (!ownerId || !delegateeId) {
      toast.error("Chọn đủ người ủy quyền và người nhận");
      return;
    }
    if (ownerId === delegateeId) {
      toast.error("Không thể tự ủy quyền cho chính mình");
      return;
    }
    if (!canAdvance && !canCheck) {
      toast.error("Chọn ít nhất một quyền");
      return;
    }
    const duplicate = items.find(
      (item) => item.grantor === ownerId && item.delegatee === delegateeId,
    );
    if (!duplicate && grantorCount(ownerId) >= MAX_DELEGATIONS) {
      toast.error("Mỗi user chỉ được ủy quyền tối đa 3 người");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        grantor: ownerId,
        delegatee: delegateeId,
        can_advance: canAdvance,
        can_check: canCheck,
      };
      if (duplicate) await pb.collection("user_delegations").update(duplicate.id, payload);
      else await pb.collection("user_delegations").create(payload);
      toast.success(duplicate ? "Đã cập nhật ủy quyền" : "Đã thêm ủy quyền");
      resetForm();
      load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không lưu được ủy quyền"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: UserDelegationRecord) => {
    if (!isAdminMode && item.grantor !== user?.id) return;
    if (!confirm("Xóa ủy quyền này?")) return;
    try {
      await pb.collection("user_delegations").delete(item.id);
      toast.success("Đã xóa ủy quyền");
      load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không xóa được"));
    }
  };

  const updatePermission = async (
    item: UserDelegationRecord,
    patch: Partial<Pick<UserDelegationRecord, "can_advance" | "can_check">>,
  ) => {
    if (!isAdminMode && item.grantor !== user?.id) return;
    const next = {
      can_advance: item.can_advance !== false,
      can_check: item.can_check !== false,
      ...patch,
    };
    if (!next.can_advance && !next.can_check) {
      toast.error("Ủy quyền phải có ít nhất một quyền");
      return;
    }
    try {
      await pb.collection("user_delegations").update(item.id, next);
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, ...next } : row)));
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không cập nhật được"));
    }
  };

  const exportExcel = () => {
    const rows = filteredItems.map((item, index) => ({
      STT: index + 1,
      "Người ủy quyền": userDisplayName(item.expand?.grantor),
      "Username ủy quyền": item.expand?.grantor?.username || "",
      "Mã NV ủy quyền": item.expand?.grantor?.employee_code || "",
      "SĐT ủy quyền": item.expand?.grantor?.phone || "",
      "Người nhận ủy quyền": userDisplayName(item.expand?.delegatee),
      "Username nhận": item.expand?.delegatee?.username || "",
      "Mã NV nhận": item.expand?.delegatee?.employee_code || "",
      "SĐT nhận": item.expand?.delegatee?.phone || "",
      "Được báo ứng": item.can_advance === false ? "Không" : "Có",
      "Được check công/lương": item.can_check === false ? "Không" : "Có",
      "Ngày tạo": item.created || "",
    }));
    exportToExcel(`danh_sach_uy_quyen_${Date.now()}`, { "Ủy quyền": rows });
  };

  const downloadTemplate = () => {
    exportToExcel("mau_import_uy_quyen", {
      "Ủy quyền": [
        {
          "Username ủy quyền": "nguyenvana",
          "Mã NV ủy quyền": "NV001",
          "Username nhận": "tranthib",
          "Mã NV nhận": "NV002",
          "Được báo ứng": "Có",
          "Được check công/lương": "Có",
        },
      ],
    });
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const userMap = buildUserMap(users);
      const counts = new Map<string, number>();
      for (const item of items) counts.set(item.grantor, (counts.get(item.grantor) || 0) + 1);
      let ok = 0;
      let fail = 0;
      for (const row of rows) {
        const grantorKey = normalize(
          pick(row, [
            "Username ủy quyền",
            "Nguoi uy quyen",
            "Grantor",
            "Mã NV ủy quyền",
            "SĐT ủy quyền",
          ]),
        );
        const delegateeKey = normalize(
          pick(row, ["Username nhận", "Nguoi nhan", "Delegatee", "Mã NV nhận", "SĐT nhận"]),
        );
        const grantor = userMap.get(grantorKey);
        const delegatee = userMap.get(delegateeKey);
        if (!grantor || !delegatee || grantor.id === delegatee.id) {
          fail++;
          continue;
        }
        const existing = items.find(
          (item) => item.grantor === grantor.id && item.delegatee === delegatee.id,
        );
        if (!existing && (counts.get(grantor.id) || 0) >= MAX_DELEGATIONS) {
          fail++;
          continue;
        }
        const payload = {
          grantor: grantor.id,
          delegatee: delegatee.id,
          can_advance: parseBool(pick(row, ["Được báo ứng", "Bao ung", "can_advance"]), true),
          can_check: parseBool(
            pick(row, ["Được check công/lương", "Check cong luong", "can_check"]),
            true,
          ),
        };
        if (!payload.can_advance && !payload.can_check) {
          fail++;
          continue;
        }
        try {
          if (existing) await pb.collection("user_delegations").update(existing.id, payload);
          else {
            await pb.collection("user_delegations").create(payload);
            counts.set(grantor.id, (counts.get(grantor.id) || 0) + 1);
          }
          ok++;
        } catch {
          fail++;
        }
      }
      toast.success(`Đã nhập ${ok} ủy quyền${fail ? `, ${fail} lỗi` : ""}`);
      load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "File ủy quyền không hợp lệ"));
    } finally {
      setImporting(false);
    }
  };

  const granted = filteredItems.filter((item) => item.grantor === user?.id);
  const received = filteredItems.filter((item) => item.delegatee === user?.id);
  const displayItems = isAdminMode
    ? filteredItems
    : [...granted, ...received.filter((item) => item.grantor !== user?.id)];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Ủy quyền</h2>
            <div className="text-[11px] text-muted-foreground">
              Tối đa {MAX_DELEGATIONS} người nhận ủy quyền cho mỗi user.
            </div>
          </div>
        </div>
        {isAdminMode && (
          <div className="flex flex-wrap gap-1.5">
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={importExcel}
                disabled={importing}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
                <Upload className="h-3.5 w-3.5" /> {importing ? "Đang nhập" : "Nhập"}
              </span>
            </label>
            <Button size="sm" variant="outline" onClick={downloadTemplate} className="rounded-full">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Mẫu
            </Button>
            <Button size="sm" variant="outline" onClick={exportExcel} className="rounded-full">
              <FileDown className="h-3.5 w-3.5" /> Xuất
            </Button>
          </div>
        )}
      </div>

      {isAdminMode && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Tìm người ủy quyền / người nhận"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2 rounded-2xl border bg-muted/30 p-3">
        {isAdminMode && (
          <SelectUser
            label="Người ủy quyền"
            value={grantorId}
            onChange={setGrantorId}
            users={users}
          />
        )}
        <SelectUser
          label="Người nhận ủy quyền"
          value={delegateeId}
          onChange={setDelegateeId}
          users={selectableUsers}
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 rounded-xl border bg-card p-2">
            <Checkbox
              checked={canAdvance}
              onCheckedChange={(checked) => setCanAdvance(checked === true)}
            />
            Báo ứng lương
          </label>
          <label className="flex items-center gap-2 rounded-xl border bg-card p-2">
            <Checkbox
              checked={canCheck}
              onCheckedChange={(checked) => setCanCheck(checked === true)}
            />
            Check công/lương
          </label>
        </div>
        <Button onClick={save} disabled={saving} className="w-full rounded-xl">
          <Save className="h-4 w-4" /> {saving ? "Đang lưu..." : "Lưu ủy quyền"}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {loading ? "Đang tải..." : `${displayItems.length} ủy quyền`}
      </div>

      <div className="space-y-2">
        {displayItems.map((item) => {
          const canEdit = isAdminMode || item.grantor === user?.id;
          return (
            <div key={item.id} className="list-card border-l-[color:var(--status-info)] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {userDisplayName(item.expand?.grantor)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">ủy quyền cho</div>
                  <div className="truncate text-sm font-medium">
                    {userDisplayName(item.expand?.delegatee)}
                  </div>
                </div>
                {canEdit && (
                  <button
                    className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                    onClick={() => remove(item)}
                    aria-label="Xóa ủy quyền"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 rounded-xl border bg-muted/30 p-2">
                  <Checkbox
                    checked={item.can_advance !== false}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      updatePermission(item, { can_advance: checked === true })
                    }
                  />
                  Báo ứng
                </label>
                <label className="flex items-center gap-2 rounded-xl border bg-muted/30 p-2">
                  <Checkbox
                    checked={item.can_check !== false}
                    disabled={!canEdit}
                    onCheckedChange={(checked) =>
                      updatePermission(item, { can_check: checked === true })
                    }
                  />
                  Check công/lương
                </label>
              </div>
            </div>
          );
        })}
        {!loading && displayItems.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card/50 py-8 text-center text-sm text-muted-foreground">
            Chưa có ủy quyền.
          </div>
        )}
      </div>
    </Card>
  );
}

function SelectUser({
  label,
  value,
  onChange,
  users,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  users: UserRecord[];
}) {
  const [open, setOpen] = useState(false);
  const selected = users.find((item) => item.id === value);

  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full justify-between gap-2 rounded-xl px-3 text-left font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? userDisplayName(selected) : "Chọn user"}
            </span>
            <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(calc(100vw-3rem),24rem)] p-0">
          <Command>
            <CommandInput placeholder="Tìm tên, username, mã NV, SĐT..." />
            <CommandList className="max-h-72">
              <CommandEmpty>Không tìm thấy user.</CommandEmpty>
              {users.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.full_name || ""} ${item.username || ""} ${item.employee_code || ""} ${item.phone || ""}`}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="items-center gap-2 py-2"
                >
                  <Check
                    className={cn("h-4 w-4", item.id === value ? "opacity-100" : "opacity-0")}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{userDisplayName(item)}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      @{item.username || "—"} · {item.phone || "—"}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
