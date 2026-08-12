import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { toast } from "@/lib/toast";
import {
  detectMapping,
  downloadLastWorkingDayResults,
  parseExcelDate,
  processLastWorkingDays,
  readSheetRows,
  readWorkbook,
  summarizeResults,
  type ColumnMapping,
  type LastWorkingDayLayout,
  type SheetRows,
  type WorkbookData,
} from "@/lib/last-working-day";

export const Route = createFileRoute("/_authenticated/last-working-day")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = pb.authStore.record as UserRecord | null;
    if (user?.role !== "admin" && user?.role !== "staff") throw redirect({ to: "/" });
  },
  component: LastWorkingDayPage,
});

const LAYOUTS: Array<{ value: LastWorkingDayLayout; label: string; description: string }> = [
  {
    value: "vertical",
    label: "Dạng dọc",
    description: "Mỗi dòng gồm ngày, mã NV, họ tên và số giờ.",
  },
  {
    value: "horizontal-single",
    label: "Dạng ngang một dòng",
    description: "Mỗi mã NV nằm trên một dòng, các ngày nằm theo cột.",
  },
  {
    value: "horizontal-multi",
    label: "Dạng ngang nhiều dòng",
    description: "Các dòng trống mã NV tiếp nối nhân viên gần nhất phía trên.",
  },
];

function LastWorkingDayPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<LastWorkingDayLayout>("vertical");
  const [file, setFile] = useState<File | null>(null);
  const [workbookData, setWorkbookData] = useState<WorkbookData | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<SheetRows>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Chưa chọn file Excel");

  const headers = useMemo(() => {
    const row = mapping ? (rows[mapping.headerRow] ?? []) : [];
    return row.map((cell, index) => String(cell || `Cột ${index + 1}`));
  }, [mapping, rows]);

  const detect = (nextRows: SheetRows, nextLayout = layout) => {
    const detected = detectMapping(nextRows, nextLayout);
    setMapping(detected.mapping);
    setIssues(detected.issues);
    setStatus(
      detected.confident
        ? "Đã nhận diện cấu trúc file. Sẵn sàng xử lý."
        : "Cần chọn lại cột trước khi xử lý.",
    );
    if (!detected.confident) setMappingOpen(true);
  };

  const handleFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    setBusy(true);
    setFile(selectedFile);
    setStatus("Đang đọc file Excel...");
    try {
      const loaded = await readWorkbook(selectedFile);
      if (!loaded.sheetNames.length) throw new Error("File Excel không có sheet dữ liệu.");
      const firstSheet = loaded.sheetNames[0];
      const nextRows = readSheetRows(loaded.workbook, firstSheet);
      setWorkbookData(loaded);
      setSheetName(firstSheet);
      setRows(nextRows);
      detect(nextRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể đọc file Excel.";
      setStatus(message);
      toast.error(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const changeSheet = (nextSheet: string) => {
    if (!workbookData) return;
    const nextRows = readSheetRows(workbookData.workbook, nextSheet);
    setSheetName(nextSheet);
    setRows(nextRows);
    detect(nextRows);
  };

  const changeLayout = (nextLayout: LastWorkingDayLayout) => {
    setLayout(nextLayout);
    if (rows.length) detect(rows, nextLayout);
  };

  const handleProcess = () => {
    if (!file || !mapping) return;
    if (issues.length) {
      setMappingOpen(true);
      return;
    }
    setBusy(true);
    setStatus("Đang xử lý và tạo file kết quả...");
    try {
      const results = processLastWorkingDays(rows, layout, mapping);
      downloadLastWorkingDayResults(results, file.name);
      const summary = summarizeResults(results);
      setStatus(
        `Đã xử lý ${summary.total} mã NV: ${summary.found} mã có ngày công cuối, ${summary.empty} mã để trống.`,
      );
      toast.success(`Đã tải kết quả: ${summary.found}/${summary.total} mã NV có ngày công cuối.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể xử lý file Excel.";
      setStatus(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const updateHeaderRow = (value: string) => {
    const headerRow = Number(value);
    const next = detectMapping([rows[headerRow] ?? []], layout).mapping;
    setMapping({ ...next, headerRow });
  };

  const confirmMapping = () => {
    if (!mapping) return;
    const nextIssues: string[] = [];
    if (mapping.employeeCodeColumn < 0) nextIssues.push("Vui lòng chọn cột Mã NV.");
    if (layout === "vertical" && mapping.dateColumn == null)
      nextIssues.push("Vui lòng chọn cột Ngày/tháng.");
    if (layout === "vertical" && mapping.hoursColumn == null)
      nextIssues.push("Vui lòng chọn cột Số giờ.");
    if (layout !== "vertical") {
      const hasDates = (rows[mapping.headerRow] ?? []).some((cell) =>
        Boolean(parseExcelDate(cell)),
      );
      if (!hasDates) nextIssues.push("Dòng tiêu đề không có cột ngày hợp lệ.");
    }
    setIssues(nextIssues);
    if (nextIssues.length) return;
    setStatus("Đã xác nhận cấu trúc file. Sẵn sàng xử lý.");
    setMappingOpen(false);
  };

  return (
    <PageContainer
      title="Ngày Công Cuối"
      subtitle="Tìm ngày cuối cùng có giờ làm lớn hơn 0 theo mã NV"
      desktopWidth="wide"
    >
      <Card className="relative overflow-hidden rounded-3xl border-emerald-200 bg-gradient-to-br from-emerald-50 via-card to-amber-50 p-5">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <CalendarClock className="h-6 w-6" />
          </div>
          <div>
            <div className="font-semibold">Xử lý an toàn ngay trên thiết bị</div>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              File không được tải lên hệ thống. Kết quả sẽ tự động tải về dưới dạng Excel.
            </p>
          </div>
        </div>
      </Card>

      <Card className="rounded-3xl p-4 desktop:p-6">
        <div className="space-y-5">
          <div>
            <Label className="text-base">1. Chọn dạng dữ liệu</Label>
            <RadioGroup
              value={layout}
              onValueChange={(value) => changeLayout(value as LastWorkingDayLayout)}
              className="mt-3 grid gap-3 desktop:grid-cols-3"
            >
              {LAYOUTS.map((item) => (
                <label
                  key={item.value}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 bg-background p-4 has-[[data-state=checked]]:border-emerald-500 has-[[data-state=checked]]:bg-emerald-50"
                >
                  <RadioGroupItem value={item.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-4 desktop:grid-cols-2">
            <div className="space-y-2">
              <Label>2. Chọn file Excel</Label>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-12 w-full justify-start rounded-2xl px-4"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                <span className="min-w-0 truncate">
                  {file?.name || "Chọn file .xlsx hoặc .xls"}
                </span>
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </div>

            <div className="space-y-2">
              <Label>3. Chọn sheet</Label>
              <Select
                value={sheetName}
                onValueChange={changeSheet}
                disabled={!workbookData || busy}
              >
                <SelectTrigger className="h-12 rounded-2xl">
                  <SelectValue placeholder="Chưa có sheet" />
                </SelectTrigger>
                <SelectContent>
                  {workbookData?.sheetNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/30 p-4 desktop:flex-row desktop:items-center desktop:justify-between">
            <div className="flex items-start gap-3 text-sm">
              {file && issues.length === 0 ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <div className="font-medium">{status}</div>
                {issues.length > 0 && (
                  <div className="mt-1 text-xs text-amber-700">{issues.join(" ")}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {file && (
                <Button type="button" variant="outline" onClick={() => setMappingOpen(true)}>
                  Kiểm tra cột
                </Button>
              )}
              <Button
                type="button"
                onClick={handleProcess}
                disabled={!file || !mapping || busy}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
                Xử lý và tải kết quả
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent className="desktop:max-w-xl">
          <DialogHeader>
            <DialogTitle>Kiểm tra cấu trúc Excel</DialogTitle>
            <DialogDescription>
              Chọn dòng tiêu đề và các cột tương ứng nếu hệ thống chưa nhận diện đúng.
            </DialogDescription>
          </DialogHeader>
          {mapping && (
            <div className="grid gap-4">
              <MappingSelect
                label="Dòng tiêu đề"
                value={String(mapping.headerRow)}
                onChange={updateHeaderRow}
                options={rows.slice(0, 20).map((row, index) => ({
                  value: String(index),
                  label: `Dòng ${index + 1}: ${row.filter(Boolean).slice(0, 4).join(" | ") || "Trống"}`,
                }))}
              />
              <MappingSelect
                label="Cột Mã NV"
                value={String(mapping.employeeCodeColumn)}
                onChange={(value) =>
                  setMapping((current) =>
                    current ? { ...current, employeeCodeColumn: Number(value) } : current,
                  )
                }
                options={headers.map((label, index) => ({ value: String(index), label }))}
              />
              <MappingSelect
                label="Cột Họ tên (không bắt buộc)"
                value={
                  mapping.employeeNameColumn == null ? "none" : String(mapping.employeeNameColumn)
                }
                onChange={(value) =>
                  setMapping((current) =>
                    current
                      ? {
                          ...current,
                          employeeNameColumn: value === "none" ? undefined : Number(value),
                        }
                      : current,
                  )
                }
                options={[
                  { value: "none", label: "Không có cột Họ tên" },
                  ...headers.map((label, index) => ({ value: String(index), label })),
                ]}
              />
              {layout === "vertical" && (
                <>
                  <MappingSelect
                    label="Cột Ngày/tháng"
                    value={mapping.dateColumn == null ? "none" : String(mapping.dateColumn)}
                    onChange={(value) =>
                      setMapping((current) =>
                        current
                          ? { ...current, dateColumn: value === "none" ? undefined : Number(value) }
                          : current,
                      )
                    }
                    options={[
                      { value: "none", label: "Chưa chọn cột Ngày/tháng" },
                      ...headers.map((label, index) => ({ value: String(index), label })),
                    ]}
                  />
                  <MappingSelect
                    label="Cột Số giờ"
                    value={mapping.hoursColumn == null ? "none" : String(mapping.hoursColumn)}
                    onChange={(value) =>
                      setMapping((current) =>
                        current
                          ? {
                              ...current,
                              hoursColumn: value === "none" ? undefined : Number(value),
                            }
                          : current,
                      )
                    }
                    options={[
                      { value: "none", label: "Chưa chọn cột Số giờ" },
                      ...headers.map((label, index) => ({ value: String(index), label })),
                    ]}
                  />
                </>
              )}
              {layout !== "vertical" && (
                <div className="rounded-2xl bg-muted p-3 text-xs leading-5 text-muted-foreground">
                  Các cột ngày được lấy tự động từ dòng tiêu đề đã chọn.
                </div>
              )}
              {issues.length > 0 && (
                <div className="text-sm text-amber-700">{issues.join(" ")}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMappingOpen(false)}>
              Hủy
            </Button>
            <Button type="button" onClick={confirmMapping}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function MappingSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
