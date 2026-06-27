import { pb, type UserRecord } from "./pocketbase";
import { fetchAppSettings } from "./app-settings";

export async function generateUid(manualUid?: string): Promise<string> {
  if (manualUid?.trim()) return manualUid.trim();

  const settings = await fetchAppSettings();
  const prefix = (settings.account_code_prefix || "").trim();

  const allUsers = await pb.collection("users").getFullList<UserRecord>({
    fields: "uid",
  });

  let maxNum = 0;
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{6})$`);

  for (const u of allUsers) {
    if (!u.uid) continue;
    const match = u.uid.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const next = maxNum + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export async function assignUidIfMissing(userId: string, manualUid?: string): Promise<string> {
  const user = await pb.collection("users").getOne<UserRecord>(userId);
  if (user.uid?.trim()) return user.uid;

  const uid = await generateUid(manualUid);
  await pb.collection("users").update(userId, { uid });
  return uid;
}
