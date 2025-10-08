import { fruitForEmotion } from "@/lib/moodFruit";

// Convert legacy emotion strings ("sad", "excited") to your slug IDs ("sour-lemon", etc.)
export const fruitIdFromEmotion = (emotion: string | null | undefined) => {
  const name = fruitForEmotion(emotion).name;             // e.g., "Sour Lemon"
  return name.toLowerCase().replace(/\s+/g, "-");         // -> "sour-lemon"
};
