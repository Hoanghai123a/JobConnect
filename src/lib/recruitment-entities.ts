import { pb } from "./pocketbase";

export type RecruitmentEntityStatus = "active" | "inactive";

export interface RecruitmentEntityRecord {
  id: string;
  name: string;
  address?: string;
  hotline?: string;
  note?: string;
  status?: RecruitmentEntityStatus;
  legacy_user_id?: string;
  legacy_username?: string;
  created?: string;
  updated?: string;
}

export function isRecruitmentEntityActive(entity: Partial<RecruitmentEntityRecord>) {
  return entity.status !== "inactive";
}

export async function fetchRecruitmentEntities(options?: { includeInactive?: boolean }) {
  return (await pb.collection("recruitment_entities").getFullList({
    filter: options?.includeInactive ? "" : 'status="active" || status=""',
    sort: "name",
  })) as unknown as RecruitmentEntityRecord[];
}
