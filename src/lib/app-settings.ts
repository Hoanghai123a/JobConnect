import { useQuery } from "@tanstack/react-query";
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
  account_code_prefix?: string;
  logo?: string;
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
  install_guide_images: [],
};

export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const res = await pb.collection("app_settings").getList(1, 1);
    return (res.items[0] as AppSettings | undefined) || DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useAppSettings() {
  const q = useQuery({
    queryKey: ["app_settings"],
    queryFn: fetchAppSettings,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const data = q.data || DEFAULTS;
  const logoUrl = data.logo ? fileUrl(data, data.logo) : "";
  return { ...q, data, logoUrl };
}
