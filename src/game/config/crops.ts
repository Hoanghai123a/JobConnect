import type { CropConfig } from "../types";

export * from "./progression";

export const CROPS: Record<string, CropConfig> = {
  // Level 1-3: Cây dễ trồng
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
  lettuce: {
    id: "lettuce",
    name: "Rau xà lách",
    seedCost: 25,
    sellPrice: 45,
    growTime: 45,
    expReward: 4,
    unlockedAtLevel: 2,
  },

  // Level 4-6: Cây trung bình
  corn: {
    id: "corn",
    name: "Ngô",
    seedCost: 50,
    sellPrice: 90,
    growTime: 120,
    expReward: 8,
    unlockedAtLevel: 3,
  },
  potato: {
    id: "potato",
    name: "Khoai tây",
    seedCost: 80,
    sellPrice: 140,
    growTime: 180,
    expReward: 12,
    unlockedAtLevel: 4,
  },
  tomato: {
    id: "tomato",
    name: "Cà chua",
    seedCost: 120,
    sellPrice: 210,
    growTime: 300,
    expReward: 18,
    unlockedAtLevel: 5,
  },

  // Level 7-9: Cây khá khó
  strawberry: {
    id: "strawberry",
    name: "Dâu tây",
    seedCost: 200,
    sellPrice: 360,
    growTime: 600,
    expReward: 30,
    unlockedAtLevel: 6,
  },
  pumpkin: {
    id: "pumpkin",
    name: "Bí ngô",
    seedCost: 250,
    sellPrice: 480,
    growTime: 720,
    expReward: 38,
    unlockedAtLevel: 7,
  },
  chili: {
    id: "chili",
    name: "Ớt",
    seedCost: 280,
    sellPrice: 530,
    growTime: 780,
    expReward: 42,
    unlockedAtLevel: 8,
  },

  // Level 10-12: Cây khó
  watermelon: {
    id: "watermelon",
    name: "Dưa hấu",
    seedCost: 350,
    sellPrice: 650,
    growTime: 900,
    expReward: 45,
    unlockedAtLevel: 9,
  },
  grape: {
    id: "grape",
    name: "Nho",
    seedCost: 420,
    sellPrice: 790,
    growTime: 1080,
    expReward: 55,
    unlockedAtLevel: 10,
  },
  eggplant: {
    id: "eggplant",
    name: "Cà tím",
    seedCost: 480,
    sellPrice: 920,
    growTime: 1200,
    expReward: 62,
    unlockedAtLevel: 11,
  },

  // Level 13-15: Cây rất khó (Quý hiếm)
  sunflower: {
    id: "sunflower",
    name: "Hướng dương",
    seedCost: 750,
    sellPrice: 1400,
    growTime: 1800,
    expReward: 90,
    unlockedAtLevel: 12,
  },
  dragon_fruit: {
    id: "dragon_fruit",
    name: "Thanh long",
    seedCost: 1200,
    sellPrice: 2300,
    growTime: 3600,
    expReward: 140,
    unlockedAtLevel: 13,
  },
  golden_ginger: {
    id: "golden_ginger",
    name: "Gừng vàng",
    seedCost: 1500,
    sellPrice: 2900,
    growTime: 4200,
    expReward: 180,
    unlockedAtLevel: 14,
  },
};

export const calculateExpForLevel = (level: number): number => {
  return Math.floor(100 * Math.pow(1.5, level - 1));
};
