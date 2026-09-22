import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pb, fileUrl } from "./pocketbase";

export interface AppSettings {
  id?: string;
  company_name?: string;
  slogan?: string;
  address?: string;
  hotline?: string;
  email?: string;
  about?: string;
  advance_limit?: number;
  advance_rules?: string;
  allow_advance_after_leave?: boolean;
  advance_reporting_enabled?: boolean;
  advance_blocked_users?: string[]; // Danh sách user IDs bị chặn báo ứng
  staff_employment_factory_scope?: "assigned" | "all";
  logo?: string;
  updated?: string;
  install_guide_images?: string[];
  collectionId?: string;
  collectionName?: string;
}

const DEFAULTS: AppSettings = {
  company_name: "Chấm công",
  slogan: "Kết nối nhà tuyển dụng & người lao động",
  address: "",
  hotline: "",
  email: "",
  about: "",
  advance_limit: 0,
  advance_rules: "",
  allow_advance_after_leave: false,
  advance_reporting_enabled: true,
  advance_blocked_users: [],
  staff_employment_factory_scope: "assigned",
  install_guide_images: [],
};

// Helper để parse giá trị dựa trên data_type
function parseValue(value: string, dataType?: string): any {
  if (!value) return null;
  if (dataType === "json") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (dataType === "number") return Number(value);
  if (dataType === "boolean") return value === "true";
  return value;
}

export async function fetchAppSettingsStrict(): Promise<AppSettings> {
  // Fetch all key-value records
  const res = await pb.collection("app_settings").getFullList();

  const settings: any = { ...DEFAULTS };
  let firstRecordId = "";

  // Convert key-value records to flat object
  res.forEach((record: any) => {
    const key = record.key;
    const value = parseValue(record.value, record.data_type);

    if (key in settings) {
      settings[key] = value;
    }

    // Store metadata from first record for logo URL
    if (!firstRecordId && record.id) {
      firstRecordId = record.id;
      settings.id = record.id;
      settings.collectionId = record.collectionId;
      settings.collectionName = record.collectionName;
    }

    // Store file fields
    if (key === "logo" && record.logo) {
      settings.logo = record.logo;
    }
    if (key === "install_guide_images" && record.install_guide_images) {
      settings.install_guide_images = record.install_guide_images;
    }
  });

  return settings;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    return await fetchAppSettingsStrict();
  } catch {
    return DEFAULTS;
  }
}

// Helper để lưu một setting theo cấu trúc key-value
export async function saveAppSetting(key: string, value: any, file?: File | null): Promise<void> {
  // Tìm record hiện có cho key này
  const existing = await pb.collection("app_settings").getFullList({
    filter: `key = "${key}"`,
  });

  const fd = new FormData();
  fd.append("key", key);

  // Serialize value dựa trên kiểu
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    fd.append("value", JSON.stringify(value));
    fd.append("data_type", "json");
  } else if (typeof value === "number") {
    fd.append("value", String(value));
    fd.append("data_type", "number");
  } else if (typeof value === "boolean") {
    fd.append("value", String(value));
    fd.append("data_type", "boolean");
  } else if (Array.isArray(value)) {
    fd.append("value", JSON.stringify(value));
    fd.append("data_type", "json");
  } else {
    fd.append("value", String(value || ""));
    fd.append("data_type", "string");
  }

  if (file) {
    fd.append(key, file);
  }

  if (existing.length > 0) {
    await pb.collection("app_settings").update(existing[0].id, fd);
  } else {
    await pb.collection("app_settings").create(fd);
  }
}

export function useAppSettings() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["app_settings"],
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    pb.collection("app_settings")
      .subscribe("*", () => {
        void queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      })
      .then((stop) => {
        if (active) unsubscribe = stop;
        else stop();
      })
      .catch(() => {});

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [queryClient]);

  const data = q.data || DEFAULTS;
  const logoUrl = data.logo ? fileUrl(data, data.logo) : "";
  return { ...q, data, logoUrl };
}
