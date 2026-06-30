import { pb, type UserRecord } from "./pocketbase";

export function normalizeAccountIdentity(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeAccountUsername(value: unknown) {
  return normalizeAccountIdentity(value);
}

export function accountIdentityKey(value: unknown) {
  return normalizeAccountIdentity(value);
}

export function buildUserIdentityMaps<T extends Pick<UserRecord, "uid" | "username">>(users: T[]) {
  const userByUid = new Map<string, T>();
  const userByUsername = new Map<string, T>();

  for (const user of users) {
    const uidKey = accountIdentityKey(user.uid);
    const usernameKey = accountIdentityKey(user.username);
    if (uidKey) userByUid.set(uidKey, user);
    if (usernameKey) userByUsername.set(usernameKey, user);
  }

  return { userByUid, userByUsername };
}

function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function findUserByUsernameInsensitive(username: string) {
  const key = accountIdentityKey(username);
  if (!key) return null;

  const exact = await pb
    .collection("users")
    .getList<UserRecord>(1, 1, { filter: `username="${escapePb(key)}"` })
    .catch(() => ({ items: [] as UserRecord[] }));
  const exactMatch = exact.items.find((user) => accountIdentityKey(user.username) === key);
  if (exactMatch) return exactMatch;

  const loose = await pb
    .collection("users")
    .getList<UserRecord>(1, 25, { filter: `username~"${escapePb(key)}"` })
    .catch(() => ({ items: [] as UserRecord[] }));
  const looseMatch = loose.items.find((user) => accountIdentityKey(user.username) === key);
  if (looseMatch) return looseMatch;

  const allUsers = await pb
    .collection("users")
    .getFullList<UserRecord>({ fields: "id,username" })
    .catch(() => [] as UserRecord[]);
  return allUsers.find((user) => accountIdentityKey(user.username) === key) || null;
}

export async function findUserByUidInsensitive(uid: string) {
  const key = accountIdentityKey(uid);
  if (!key) return null;

  const exact = await pb
    .collection("users")
    .getList<UserRecord>(1, 1, { filter: `uid="${escapePb(uid.trim())}"` })
    .catch(() => ({ items: [] as UserRecord[] }));
  const exactMatch = exact.items.find((user) => accountIdentityKey(user.uid) === key);
  if (exactMatch) return exactMatch;

  const loose = await pb
    .collection("users")
    .getList<UserRecord>(1, 25, { filter: `uid~"${escapePb(uid.trim())}"` })
    .catch(() => ({ items: [] as UserRecord[] }));
  const looseMatch = loose.items.find((user) => accountIdentityKey(user.uid) === key);
  if (looseMatch) return looseMatch;

  const allUsers = await pb
    .collection("users")
    .getFullList<UserRecord>({ fields: "id,uid" })
    .catch(() => [] as UserRecord[]);
  return allUsers.find((user) => accountIdentityKey(user.uid) === key) || null;
}
