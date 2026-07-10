import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type HTMLAttributes,
  type RefObject,
} from "react";
import {
  BriefcaseBusiness,
  Camera,
  Check,
  ChevronsUpDown,
  IdCard,
  ScanLine,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findOrCreateCccdVersion } from "@/lib/cccd-versions";
import { displayDateToPocketBase, scanCccdQrFromFile, type CccdQrData } from "@/lib/cccd-qr";
import { findUserByUsernameInsensitive, normalizeAccountUsername } from "@/lib/account-identity";
import { createEmploymentHistory, syncLegacyUserWorkFields } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import { compressImage } from "@/lib/image-compress";
import type { MainHouseRecord } from "@/lib/main-houses";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { updateCachedCccdVersion, updateCachedHistory, updateCachedUser } from "@/lib/staff-cache";
import { createStaffActionLog } from "@/lib/staff-log";
import { generateUid } from "@/lib/uid";
import { cn } from "@/lib/utils";
import { resolveBankName, VN_BANKS } from "@/lib/vn-banks";

type QuickWorkerForm = {
  real_name: string;
  worker_name_snapshot: string;
  cccd: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  address: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_name: string;
  recruiter_staff: string;
  join_date: string;
  main_house: string;
  factory: string;
  employee_code: string;
  note: string;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const emptyForm = (): QuickWorkerForm => ({
  real_name: "",
  worker_name_snapshot: "",
  cccd: "",
  phone: "",
  date_of_birth: "",
  gender: "",
  address: "",
  bank_name: "",
  bank_account_number: "",
  bank_account_name: "",
  recruiter_staff: "",
  join_date: todayIso(),
  main_house: "",
  factory: "",
  employee_code: "",
  note: "",
});

function buildUsername(phone: string, cccd: string) {
  const base = (phone.replace(/\D/g, "") || cccd.replace(/\D/g, "")).trim();
  return normalizeAccountUsername(base);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPocketBaseFieldErrors(error: unknown) {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error.data as { data?: Record<string, unknown> }).data
      : undefined;
  if (!data) return "";
  return Object.entries(data)
    .map(([field, value]) => {
      const message =
        typeof value === "object" && value !== null && "message" in value
          ? String(value.message)
          : String(value);
      return `${field}: ${message}`;
    })
    .join("; ");
}

export function QuickWorkerAccountDialog({
  open,
  onOpenChange,
  actor,
  factories,
  mainHouses,
  staffUsers,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actor: UserRecord | null;
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  staffUsers: UserRecord[];
  onCreated: (userId: string) => void | Promise<void>;
}) {
  const [form, setForm] = useState<QuickWorkerForm>(() => emptyForm());
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState("");
  const [backPreview, setBackPreview] = useState("");
  const [scanningSide, setScanningSide] = useState<"front" | "back" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const frontCameraInputRef = useRef<HTMLInputElement | null>(null);
  const frontLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const backCameraInputRef = useRef<HTMLInputElement | null>(null);
  const backLibraryInputRef = useRef<HTMLInputElement | null>(null);

  const resetFormState = useCallback(() => {
    setForm(emptyForm());
    setFrontFile(null);
    setBackFile(null);
    setFrontPreview("");
    setBackPreview("");
    setScanningSide(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetFormState();
      return;
    }

    setForm((current) => ({
      ...current,
      recruiter_staff: current.recruiter_staff || actor?.id || "",
    }));
  }, [actor?.id, open, resetFormState]);

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview);
      if (backPreview) URL.revokeObjectURL(backPreview);
    };
  }, [backPreview, frontPreview]);

  const selectedFactory = useMemo(
    () => factories.find((factory) => factory.id === form.factory),
    [factories, form.factory],
  );

  const setField = <K extends keyof QuickWorkerForm>(key: K, value: QuickWorkerForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyQrData = (data: CccdQrData) => {
    setForm((current) => {
      const next = { ...current };
      const changes: Partial<QuickWorkerForm> = {
        cccd: data.cccd || "",
        real_name: data.fullName || "",
        worker_name_snapshot: data.fullName || "",
        date_of_birth: data.dateOfBirth ? displayDateToPocketBase(data.dateOfBirth) : "",
        gender: data.gender || "",
        address: data.address || "",
      };

      for (const [key, value] of Object.entries(changes) as Array<
        [keyof QuickWorkerForm, string]
      >) {
        if (!value) continue;
        if (!next[key] || window.confirm(`Ghi đè ${fieldLabels[key]} bằng dữ liệu QR?`)) {
          next[key] = value;
        }
      }

      return next;
    });
  };

  const pickCccdImage =
    (side: "front" | "back") => async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      event.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Vui lòng chọn file ảnh CCCD");
        return;
      }

      const preview = URL.createObjectURL(file);
      if (side === "front") {
        if (frontPreview) URL.revokeObjectURL(frontPreview);
        setFrontFile(file);
        setFrontPreview(preview);
      } else {
        if (backPreview) URL.revokeObjectURL(backPreview);
        setBackFile(file);
        setBackPreview(preview);
      }

      await scanImage(file, side);
    };

  const scanImage = async (file: File, side: "front" | "back") => {
    setScanningSide(side);
    try {
      const data = await scanCccdQrFromFile(file);
      if (!data) {
        toast.warning("Không đọc được QR, vui lòng nhập tay");
        return;
      }
      applyQrData(data);
      toast.success("Đã đọc thông tin CCCD từ QR");
    } catch (error) {
      toast.error(getErrorMessage(error, "Không đọc được QR, vui lòng nhập tay"));
    } finally {
      setScanningSide(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!actor?.id) return toast.error("Không xác định người thao tác");

    const realName = form.real_name.trim();
    const workerName = form.worker_name_snapshot.trim() || realName;
    const cccd = form.cccd.replace(/\D/g, "");
    const phone = form.phone.replace(/\s/g, "").trim();
    const username = buildUsername(phone, cccd);
    const birthForPb = displayDateToPocketBase(form.date_of_birth);

    if (!realName) return toast.warning("Nhập tên thật");
    if (!cccd && !phone) return toast.warning("Nhập CCCD hoặc số điện thoại");
    if (!username) return toast.warning("Không tạo được tên đăng nhập từ SĐT/CCCD");
    if (form.date_of_birth.trim() && !birthForPb) {
      return toast.warning("Ngày sinh không hợp lệ");
    }
    if ((frontFile || backFile) && ![9, 12].includes(cccd.length)) {
      return toast.warning("Nhập số CMND/CCCD hợp lệ trước khi lưu ảnh CCCD");
    }
    if (!form.factory) return toast.warning("Chọn công ty/nhà máy");
    if (!form.main_house) return toast.warning("Chọn nhà chính");
    if (!form.recruiter_staff) return toast.warning("Chọn người tuyển");
    if (!form.join_date) return toast.warning("Nhập ngày vào làm");

    setSubmitting(true);
    try {
      const existing = await findUserByUsernameInsensitive(username);
      if (existing) {
        toast.error("Tên đăng nhập đã tồn tại. Hãy đổi SĐT hoặc CCCD.");
        return;
      }

      const [uid, compressedFront, compressedBack] = await Promise.all([
        generateUid(),
        frontFile ? compressImage(frontFile) : Promise.resolve(null),
        backFile ? compressImage(backFile) : Promise.resolve(null),
      ]);

      const fd = new FormData();
      fd.append("full_name", realName);
      fd.append("phone", phone);
      fd.append("username", username);
      fd.append("uid", uid);
      fd.append("password", "12345678");
      fd.append("passwordConfirm", "12345678");
      fd.append("role", "user");
      fd.append("approvalStatus", "approved");
      fd.append("approved", "true");
      fd.append("status", "active");
      fd.append("must_change_password", "true");
      fd.append("cccd", cccd);
      fd.append("gender", form.gender.trim());
      if (birthForPb) fd.append("date_of_birth", birthForPb);
      fd.append("address", form.address.trim());
      fd.append("bank_name", resolveBankName(form.bank_name.trim()));
      fd.append("bank_account_number", form.bank_account_number.replace(/\D/g, ""));
      fd.append("bank_account_name", form.bank_account_name.trim());
      fd.append("employee_code", form.employee_code.trim());
      fd.append("company", selectedFactory?.name || "");
      if (compressedFront) fd.append("cccd_front", compressedFront);
      if (compressedBack) fd.append("cccd_back", compressedBack);

      const createdUser = await pb.collection("users").create<UserRecord>(fd);
      const secondaryWarnings: string[] = [];
      const cacheUser: UserRecord = {
        ...createdUser,
        full_name: realName,
        phone,
        username,
        cccd,
        company: selectedFactory?.name || "",
        employee_code: form.employee_code.trim(),
      };

      try {
        await updateCachedUser(cacheUser);
      } catch {
        secondaryWarnings.push("chưa cập nhật được cache tài khoản");
      }

      let cccdVersionId: string | undefined;
      if (cccd && (compressedFront || compressedBack)) {
        try {
          const version = await findOrCreateCccdVersion(
            createdUser.id,
            cccd,
            compressedFront,
            compressedBack,
          );
          cccdVersionId = version.id;
          await updateCachedCccdVersion(version);
        } catch {
          secondaryWarnings.push("chưa lưu được phiên bản CCCD");
        }
      }

      let historyId: string | undefined;
      try {
        const history = await createEmploymentHistory({
          user: createdUser.id,
          factory: form.factory,
          main_house: form.main_house,
          employee_code: form.employee_code.trim(),
          worker_name_snapshot: workerName,
          worker_cccd_snapshot: cccd,
          recruiter_staff: form.recruiter_staff,
          cccd_version: cccdVersionId,
          join_date: form.join_date,
          status: "working",
          note: form.note.trim(),
        });
        historyId = history.id;
        await updateCachedHistory(history);
        await syncLegacyUserWorkFields(createdUser.id, history);
        await updateCachedUser(cacheUser);
      } catch {
        secondaryWarnings.push("chưa tạo được lịch sử đi làm");
      }

      try {
        await createStaffActionLog({
          actor,
          targetUserId: createdUser.id,
          targetCollection: "users",
          targetRecord: createdUser.id,
          action: "create",
          after: { id: createdUser.id, username, uid, full_name: realName, cccd },
          note: "Tạo nhanh tài khoản NLĐ từ mục NLĐ",
        });
        if (historyId) {
          await createStaffActionLog({
            actor,
            targetUserId: createdUser.id,
            targetCollection: "employment_histories",
            targetRecord: historyId,
            action: "report_join",
            after: { id: historyId },
            note: "Tạo nhanh lịch sử đi làm từ mục NLĐ",
          });
        }
      } catch {
        secondaryWarnings.push("chưa ghi được nhật ký thao tác");
      }

      resetFormState();
      onOpenChange(false);
      try {
        await onCreated(createdUser.id);
      } catch {
        secondaryWarnings.push("chưa tải lại được danh sách");
      }

      if (secondaryWarnings.length > 0) {
        toast.warning(`Tài khoản đã tạo, nhưng ${secondaryWarnings.join(", ")}.`);
      }
      toast.success("Đã tạo nhanh tài khoản NLĐ");
    } catch (error) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      toast.error(fieldErrors || getErrorMessage(error, "Không tạo được tài khoản nhanh"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !submitting && onOpenChange(value)}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b bg-background px-5 py-4 pr-14">
          <DialogTitle>Tạo nhanh tài khoản NLĐ</DialogTitle>
          <DialogDescription>
            Tạo tài khoản user và ghi nhận lịch sử đang đi làm trong một bước.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <CccdImageBox
                  label="CCCD trước"
                  preview={frontPreview}
                  scanning={scanningSide === "front"}
                  cameraInputRef={frontCameraInputRef}
                  libraryInputRef={frontLibraryInputRef}
                  onPick={pickCccdImage("front")}
                  onScan={() => frontFile && scanImage(frontFile, "front")}
                  onClear={() => {
                    if (frontPreview) URL.revokeObjectURL(frontPreview);
                    setFrontFile(null);
                    setFrontPreview("");
                  }}
                />
                <CccdImageBox
                  label="CCCD sau"
                  preview={backPreview}
                  scanning={scanningSide === "back"}
                  cameraInputRef={backCameraInputRef}
                  libraryInputRef={backLibraryInputRef}
                  onPick={pickCccdImage("back")}
                  onScan={() => backFile && scanImage(backFile, "back")}
                  onClear={() => {
                    if (backPreview) URL.revokeObjectURL(backPreview);
                    setBackFile(null);
                    setBackPreview("");
                  }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <TextField
                  label="Tên thật"
                  value={form.real_name}
                  onChange={(value) => setField("real_name", value)}
                  placeholder="Nguyễn Văn A"
                />
                <TextField
                  label="Họ tên theo nhà máy"
                  value={form.worker_name_snapshot}
                  onChange={(value) => setField("worker_name_snapshot", value)}
                  placeholder="Tên hiển thị tại nhà máy"
                />
                <TextField
                  label="CMND/CCCD"
                  value={form.cccd}
                  onChange={(value) => setField("cccd", value.replace(/\D/g, ""))}
                  placeholder="001099012345"
                  inputMode="numeric"
                />
                <TextField
                  label="Số điện thoại"
                  value={form.phone}
                  onChange={(value) => setField("phone", value.replace(/[^\d+]/g, ""))}
                  placeholder="0900000001"
                  inputMode="tel"
                />
                <TextField
                  label="Ngày sinh"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(value) => setField("date_of_birth", value)}
                />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Giới tính</Label>
                  <Select value={form.gender} onValueChange={(value) => setField("gender", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Giới tính" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nam">Nam</SelectItem>
                      <SelectItem value="Nữ">Nữ</SelectItem>
                      <SelectItem value="Khác">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <TextField
                  label="Ngân hàng"
                  value={form.bank_name}
                  onChange={(value) => setField("bank_name", value)}
                  placeholder="Ngân hàng"
                  list="quick-worker-bank-list"
                />
                <TextField
                  label="Số tài khoản"
                  value={form.bank_account_number}
                  onChange={(value) => setField("bank_account_number", value.replace(/\D/g, ""))}
                  placeholder="Số tài khoản"
                  inputMode="numeric"
                />
                <TextField
                  label="Chủ tài khoản"
                  value={form.bank_account_name}
                  onChange={(value) => setField("bank_account_name", value)}
                  placeholder="Chủ tài khoản"
                />
                <div className="sm:col-span-2">
                  <TextField
                    label="Địa chỉ"
                    value={form.address}
                    onChange={(value) => setField("address", value)}
                    placeholder="Địa chỉ theo CCCD"
                  />
                </div>
                <ComboboxField
                  label="Người tuyển"
                  placeholder="Chọn người tuyển"
                  options={staffUsers.map((staff) => ({
                    value: staff.id,
                    label: staff.full_name || staff.username || staff.id,
                    description: staff.username || staff.phone || "",
                  }))}
                  value={form.recruiter_staff}
                  onChange={(value) => setField("recruiter_staff", value)}
                />
                <TextField
                  label="Ngày vào làm"
                  type="date"
                  value={form.join_date}
                  onChange={(value) => setField("join_date", value)}
                />
                <ComboboxField
                  label="Nhà chính"
                  placeholder="Chọn nhà chính"
                  options={mainHouses.map((house) => ({
                    value: house.id,
                    label: house.name,
                    description: house.note || "",
                  }))}
                  value={form.main_house}
                  onChange={(value) => setField("main_house", value)}
                />
                <ComboboxField
                  label="Công ty"
                  placeholder="Chọn công ty"
                  options={factories.map((factory) => ({
                    value: factory.id,
                    label: factory.name,
                    description: factory.code || "",
                  }))}
                  value={form.factory}
                  onChange={(value) => setField("factory", value)}
                />
                <TextField
                  label="Mã nhân viên"
                  value={form.employee_code}
                  onChange={(value) => setField("employee_code", value)}
                  placeholder="Mã nhân viên"
                />
                <div className="sm:col-span-2 lg:col-span-4">
                  <Label className="text-xs">Ghi chú</Label>
                  <Textarea
                    rows={2}
                    value={form.note}
                    onChange={(event) => setField("note", event.target.value)}
                    placeholder="Ghi chú thêm nếu có"
                  />
                </div>
              </div>
            </div>
          </div>

          <datalist id="quick-worker-bank-list">
            {VN_BANKS.map((bank) => (
              <option key={bank.code} value={bank.name}>
                {bank.code}
              </option>
            ))}
          </datalist>

          <DialogFooter className="shrink-0 border-t bg-background px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || scanningSide !== null}>
              <BriefcaseBusiness className="h-4 w-4" />
              {submitting ? "Đang lưu..." : "Tạo nhanh"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const fieldLabels: Record<keyof QuickWorkerForm, string> = {
  real_name: "tên thật",
  worker_name_snapshot: "họ tên theo nhà máy",
  cccd: "CCCD",
  phone: "số điện thoại",
  date_of_birth: "ngày sinh",
  gender: "giới tính",
  address: "địa chỉ",
  bank_name: "ngân hàng",
  bank_account_number: "số tài khoản",
  bank_account_name: "chủ tài khoản",
  recruiter_staff: "người tuyển",
  join_date: "ngày vào làm",
  main_house: "nhà chính",
  factory: "công ty",
  employee_code: "mã nhân viên",
  note: "ghi chú",
};

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  list,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  list?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        list={list}
      />
    </div>
  );
}

function CccdImageBox({
  label,
  preview,
  scanning,
  cameraInputRef,
  libraryInputRef,
  onPick,
  onScan,
  onClear,
}: {
  label: string;
  preview: string;
  scanning: boolean;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  libraryInputRef: RefObject<HTMLInputElement | null>;
  onPick: (event: ChangeEvent<HTMLInputElement>) => void;
  onScan: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative aspect-[1.586/1] overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
        {preview ? (
          <img src={preview} alt={label} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-xs text-muted-foreground">
            <IdCard className="h-6 w-6" />
            <span>{label}</span>
            <div className="grid w-full grid-cols-2 gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 px-2 text-xs"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
                Chụp
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 px-2 text-xs"
                onClick={() => libraryInputRef.current?.click()}
              >
                Thư viện
              </Button>
            </div>
          </div>
        )}
        {preview && (
          <div className="absolute inset-x-2 bottom-2 flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 flex-1"
              onClick={onScan}
            >
              <ScanLine className="h-4 w-4" />
              {scanning ? "Đang quét" : "Quét QR"}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={onClear}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      {preview && (
        <div className="grid grid-cols-2 gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Chụp lại
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => libraryInputRef.current?.click()}
          >
            Thư viện
          </Button>
        </div>
      )}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

function ComboboxField({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: Array<{ value: string; label: string; description?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm kiếm..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.description || ""}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        option.value === value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{option.label}</div>
                      {option.description && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {option.description}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
