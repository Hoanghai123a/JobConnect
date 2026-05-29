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

type CachedAppSettingsRecord = { upstream: string; item: AppSettingsRecord } | null;

const CACHE_SUCCESS_MS = 60 * 1000;
const CACHE_FAILURE_MS = 15 * 1000;

let cachedRecord: { value: CachedAppSettingsRecord; expiresAt: number } | null = null;
let pendingFetch: Promise<CachedAppSettingsRecord> | null = null;

function normalizeUpstream(url: string) {
  return url.replace(/\/+$/, "");
}

export async function fetchAppSettingsRecord() {
  const now = Date.now();
  if (cachedRecord && cachedRecord.expiresAt > now) return cachedRecord.value;
  if (pendingFetch) return pendingFetch;

  pendingFetch = fetchAppSettingsRecordUncached().then(
    (value) => {
      cachedRecord = {
        value,
        expiresAt: Date.now() + (value ? CACHE_SUCCESS_MS : CACHE_FAILURE_MS),
      };
      pendingFetch = null;
      return value;
    },
    (error) => {
      cachedRecord = { value: null, expiresAt: Date.now() + CACHE_FAILURE_MS };
      pendingFetch = null;
      throw error;
    },
  );

  return pendingFetch;
}

async function fetchAppSettingsRecordUncached(): Promise<CachedAppSettingsRecord> {
  const upstream = normalizeUpstream(getPBUpstream());
  const res = await fetch(
    `${upstream}/api/collections/app_settings/records?page=1&perPage=1&sort=-updated`,
    {
      headers: { "ngrok-skip-browser-warning": "true" },
    },
  );
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
