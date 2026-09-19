import { allocateUserUids } from "./uid-counter";
import { pb, type UserRecord } from "./pocketbase";

export async function generateUid(): Promise<string> {
  const [uid] = await allocateUserUids(1);
  if (!uid) throw new Error("Không cấp được UID tài khoản.");
  return uid;
}

export async function assignUidIfMissing(userId: string): Promise<string> {
  const user = await pb.collection("users").getOne<UserRecord>(userId);
  if (user.uid?.trim()) return user.uid;

  const uid = await generateUid();
  await pb.collection("users").update(userId, { uid });
  return uid;
}
