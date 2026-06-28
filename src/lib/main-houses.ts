import { pb } from "./pocketbase";

export interface MainHouseRecord {
  id: string;
  name: string;
  address?: string;
  hotline?: string;
  note?: string;
  created?: string;
  updated?: string;
}

export async function fetchMainHouses() {
  const res = await pb.collection("main_houses").getList(1, 300, {
    sort: "name",
  });
  return res.items as unknown as MainHouseRecord[];
}
