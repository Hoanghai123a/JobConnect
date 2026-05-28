import { getPBUpstream } from "@/lib/pocketbase-config";

type AppSettingsRecord = {
  id?: string;
  collectionId?: string;
  collectionName?: string;
  company_name?: string;
  slogan?: string;
  logo?: string;
};

type ListResponse = {
  items?: AppSettingsRecord[];
};

function normalizeUpstream(url: string) {
  return url.replace(/\/+$/, "");
}

export async function fetchAppSettingsRecord() {
  const upstream = normalizeUpstream(getPBUpstream());
  const res = await fetch(`${upstream}/api/collections/app_settings/records?page=1&perPage=1&sort=-updated`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) return null;

  const json = (await res.json().catch(() => null)) as ListResponse | null;
  const item = json?.items?.[0];
  if (!item?.id) return null;

  return { upstream, item };
}

export function buildPocketBaseFileUrl(params: {
  upstream: string;
  collectionIdOrName: string;
  recordId: string;
  fileName: string;
}) {
  const { upstream, collectionIdOrName, recordId, fileName } = params;
  return `${upstream}/api/files/${encodeURIComponent(collectionIdOrName)}/${encodeURIComponent(recordId)}/${encodeURIComponent(fileName)}`;
}
