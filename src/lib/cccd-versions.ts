import { pb } from "./pocketbase";
import { updateCachedCccdVersion } from "./staff-cache";

export interface CccdVersionRecord {
  id: string;
  user: string;
  cccd_number: string;
  front_image?: string;
  back_image?: string;
  is_current: boolean;
  note?: string;
  created?: string;
  updated?: string;
  collectionId?: string;
  collectionName?: string;
}

export async function getCurrentCccdVersion(
  userId: string,
): Promise<CccdVersionRecord | null> {
  try {
    return (await pb
      .collection("cccd_versions")
      .getFirstListItem(`user="${userId}" && is_current=true`)) as unknown as CccdVersionRecord;
  } catch {
    return null;
  }
}

export async function getCccdVersionByNumber(
  userId: string,
  cccdNumber: string,
): Promise<CccdVersionRecord | null> {
  try {
    return (await pb
      .collection("cccd_versions")
      .getFirstListItem(
        `user="${userId}" && cccd_number="${cccdNumber}"`,
      )) as unknown as CccdVersionRecord;
  } catch {
    return null;
  }
}

export async function findOrCreateCccdVersion(
  userId: string,
  cccdNumber: string,
  frontFile?: File | null,
  backFile?: File | null,
): Promise<CccdVersionRecord> {
  const existing = await getCccdVersionByNumber(userId, cccdNumber);
  if (existing) {
    await updateCachedCccdVersion(existing);
    return existing;
  }

  const currentVersion = await getCurrentCccdVersion(userId);
  if (currentVersion) {
    await updateCccdVersionAndCache(currentVersion.id, { is_current: false });
  }

  const fd = new FormData();
  fd.append("user", userId);
  fd.append("cccd_number", cccdNumber);
  fd.append("is_current", "true");
  if (frontFile) fd.append("front_image", frontFile);
  if (backFile) fd.append("back_image", backFile);

  const created = (await pb
    .collection("cccd_versions")
    .create(fd)) as unknown as CccdVersionRecord;
  await updateCachedCccdVersion(created);
  return created;
}

export async function updateCccdVersionImages(
  versionId: string,
  frontFile?: File | null,
  backFile?: File | null,
): Promise<CccdVersionRecord> {
  const fd = new FormData();
  if (frontFile) fd.append("front_image", frontFile);
  if (backFile) fd.append("back_image", backFile);

  return updateCccdVersionAndCache(versionId, fd);
}

export async function updateCccdVersionAndCache(
  versionId: string,
  payload: Record<string, unknown> | FormData,
): Promise<CccdVersionRecord> {
  const updated = (await pb
    .collection("cccd_versions")
    .update(versionId, payload)) as unknown as CccdVersionRecord;
  await updateCachedCccdVersion(updated);
  return updated;
}

export async function fetchCccdVersionsByUser(
  userId: string,
): Promise<CccdVersionRecord[]> {
  return (await pb.collection("cccd_versions").getFullList({
    filter: `user="${userId}"`,
    sort: "-created",
  })) as unknown as CccdVersionRecord[];
}
