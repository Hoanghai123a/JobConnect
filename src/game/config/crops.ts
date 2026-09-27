import type { CropConfig } from "../types";

export * from "./progression";

export const CROPS: Record<string, CropConfig> = {
  carrot: {
    id: "carrot",
    name: "Cà rốt",
    seedCost: 20,
    sellPrice: 35,
    growTime: 30,
    expReward: 3,
    unlockedAtLevel: 1,
  },
  rice: {
    id: "rice",
    name: "Lúa",
    seedCost: 30,
    sellPrice: 55,
    growTime: 60,
    expReward: 5,
    unlockedAtLevel: 1,
  },
  corn: {
    id: "corn",
    name: "Ngô",
    seedCost: 50,
    sellPrice: 90,
    growTime: 120,
    expReward: 8,
    unlockedAtLevel: 2,
  },
  potato: {
    id: "potato",
    name: "Khoai tây",
    seedCost: 80,
    sellPrice: 140,
    growTime: 180,
    expReward: 12,
    unlockedAtLevel: 3,
  },
  tomato: {
    id: "tomato",
    name: "Cà chua",
    seedCost: 120,
    sellPrice: 210,
    growTime: 300,
    expReward: 18,
    unlockedAtLevel: 4,
  },
  strawberry: {
    id: "strawberry",
    name: "Dâu tây",
    seedCost: 200,
    sellPrice: 360,
    growTime: 600,
    expReward: 30,
    unlockedAtLevel: 5,
  },
  watermelon: {
    id: "watermelon",
    name: "Dưa hấu",
    seedCost: 350,
    sellPrice: 650,
    growTime: 900,
    expReward: 45,
    unlockedAtLevel: 6,
  },
  pumpkin: {
    id: "pumpkin",
    name: "Bí ngô",
    seedCost: 500,
    sellPrice: 950,
    growTime: 1200,
    expReward: 65,
    unlockedAtLevel: 7,
  },
  sunflower: {
    id: "sunflower",
    name: "Hướng dương",
    seedCost: 750,
    sellPrice: 1400,
    growTime: 1800,
    expReward: 90,
    unlockedAtLevel: 8,
  },
  dragon_fruit: {
    id: "dragon_fruit",
    name: "Thanh long",
    seedCost: 1200,
    sellPrice: 2300,
    growTime: 3600,
    expReward: 140,
    unlockedAtLevel: 9,
  },
};

export const calculateExpForLevel = (level: number): number => {
  return Math.floor(100 * Math.pow(1.5, level - 1));
};
