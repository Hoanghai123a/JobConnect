import { pb } from "./pocketbase";

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
  if (existing) return existing;

  const currentVersion = await getCurrentCccdVersion(userId);
  if (currentVersion) {
    await pb
      .collection("cccd_versions")
      .update(currentVersion.id, { is_current: false });
  }

  const fd = new FormData();
  fd.append("user", userId);
  fd.append("cccd_number", cccdNumber);
  fd.append("is_current", "true");
  if (frontFile) fd.append("front_image", frontFile);
  if (backFile) fd.append("back_image", backFile);

  return (await pb
    .collection("cccd_versions")
    .create(fd)) as unknown as CccdVersionRecord;
}

export async function updateCccdVersionImages(
  versionId: string,
  frontFile?: File | null,
  backFile?: File | null,
): Promise<CccdVersionRecord> {
  const fd = new FormData();
  if (frontFile) fd.append("front_image", frontFile);
  if (backFile) fd.append("back_image", backFile);

  return (await pb
    .collection("cccd_versions")
    .update(versionId, fd)) as unknown as CccdVersionRecord;
}

export async function fetchCccdVersionsByUser(
  userId: string,
): Promise<CccdVersionRecord[]> {
  return (await pb.collection("cccd_versions").getFullList({
    filter: `user="${userId}"`,
    sort: "-created",
  })) as unknown as CccdVersionRecord[];
}
