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
  return (await pb.collection("main_houses").getFullList({
    sort: "name",
  })) as unknown as MainHouseRecord[];
}
