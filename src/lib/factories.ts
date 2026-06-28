import { pb } from "./pocketbase";
import { escapePb } from "./delegations";

export type FactoryStatus = "active" | "inactive";

export interface FactoryRecord {
  id: string;
  code?: string;
  name: string;
  address?: string;
  hotline?: string;
  attendance_cutoff_day?: number;
  status?: FactoryStatus;
  note?: string;
  created?: string;
  updated?: string;
}

export interface FactoryManagerRecord {
  id: string;
  factory: string;
  staff: string;
  active_from?: string;
  active_to?: string;
  status?: FactoryStatus;
  note?: string;
  expand?: {
    factory?: FactoryRecord;
  };
}

export async function fetchFactories() {
  const res = await pb.collection("factories").getList(1, 300, {
    sort: "name",
  });
  return res.items as unknown as FactoryRecord[];
}

export async function fetchFactoryManagers(staffId?: string) {
  const filter = staffId ? `staff="${escapePb(staffId)}"` : "";
  const res = await pb.collection("factory_managers").getList(1, 500, {
    filter,
    sort: "-created",
    expand: "factory",
  });
  return res.items as unknown as FactoryManagerRecord[];
}

export function isFactoryAssignmentActive(
  record: FactoryManagerRecord,
  referenceDate = new Date(),
) {
  if (record.status === "inactive") return false;

  const refTime = referenceDate.getTime();
  const fromTime = record.active_from
    ? new Date(record.active_from).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTime = record.active_to ? new Date(record.active_to).getTime() : Number.POSITIVE_INFINITY;

  return fromTime <= refTime && toTime >= refTime;
}

export function factoryDisplayName(factory?: Partial<FactoryRecord> | null) {
  if (!factory) return "Chưa gán nhà máy";
  return [factory.code, factory.name].filter(Boolean).join(" - ");
}
