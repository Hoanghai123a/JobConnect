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
  account_code_prefix?: string;
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
  install_guide_images: [],
};

export async function fetchAppSettingsStrict(): Promise<AppSettings> {
  const res = await pb.collection("app_settings").getList(1, 1);
  return { ...DEFAULTS, ...((res.items[0] as AppSettings | undefined) || {}) };
}

export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    return await fetchAppSettingsStrict();
  } catch {
    return DEFAULTS;
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
