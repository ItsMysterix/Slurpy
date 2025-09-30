// lib/moodFruit.ts
export type FruitInfo = { id: string; name: string; icon: string };

const FILES = {
  CHERRY_CHARGE:        "Cherry charge.ico",
  FIERY_GUAVA:          "Fiery Guava.ico",
  GRAPE_EXPECTATIONS:   "Grape Expectations.ico",
  KIWI_COMEBACK:        "Kiwi Comeback.ico",
  MANGO_MANIA:          "Mango Mania.ico",
  MUSK_MELT:            "Musk Melt.ico",
  PEACHY_KEEN:          "Peachy Keen.ico",
  PEER_PRESSURE:        "Peer Pressure.ico",
  PINEAPPLE_PUNCH:      "Pineapple punch.ico",
  SLIPPERY_BANANA:      "Slippery Banana.ico",
  SOUR_LEMON:           "Sour Lemon.ico",
  SPIKY_PAPAYA:         "Spiky Papaya.ico",
  STRAWBERRY_BLISS:     "Strawberry Bliss.ico",
  WATERMELON_WAVE:      "Watermelon Wave.ico",
  PLACEHOLDER:          "placeholder-logo.svg",
} as const;

const urlFor = (f: string) => `/${encodeURI(f)}`;
const label = (f: string) => f.replace(/\.(ico|png|jpg|jpeg|svg)$/i, "");

const TABLE: Array<{ file: string; emotions: string[] }> = [
  { file: FILES.PEACHY_KEEN,        emotions: ["happy","pleasant","glad","cheerful","optimistic"] },
  { file: FILES.STRAWBERRY_BLISS,   emotions: ["joy","joyful","delighted","elated","thrilled"] },
  { file: FILES.WATERMELON_WAVE,    emotions: ["content","peaceful","chill","at ease"] },
  { file: FILES.KIWI_COMEBACK,      emotions: ["calm","balanced","grounded","okay"] },
  { file: FILES.MANGO_MANIA,        emotions: ["excited","motivated","energetic","hyped"] },
  { file: FILES.CHERRY_CHARGE,      emotions: ["energized","productive","focused"] },

  { file: FILES.SOUR_LEMON,         emotions: ["sad","down","blue","depressed"] },
  { file: FILES.MUSK_MELT,          emotions: ["tired","exhausted","drained","fatigued"] },
  { file: FILES.SPIKY_PAPAYA,       emotions: ["anxious","nervous","worried","tense"] },
  { file: FILES.FIERY_GUAVA,        emotions: ["angry","mad","irritated","frustrated"] },
  { file: FILES.PEER_PRESSURE,      emotions: ["stressed","overwhelmed","pressured"] },
  { file: FILES.PINEAPPLE_PUNCH,    emotions: ["overloaded","burned out","frazzled"] },
  { file: FILES.SLIPPERY_BANANA,    emotions: ["ashamed","embarrassed","guilty"] },
  { file: FILES.GRAPE_EXPECTATIONS, emotions: ["disappointed","let down","regretful"] },

  { file: FILES.PLACEHOLDER,        emotions: ["neutral","unknown",""] },
];

const DIRECT: Record<string,string> = TABLE.reduce((acc,row)=>{
  row.emotions.forEach(e=> acc[e.toLowerCase()] = row.file);
  return acc;
}, {} as Record<string,string>);

export function fruitForEmotion(emotionRaw: string | null | undefined): FruitInfo {
  const key = (emotionRaw ?? "unknown").trim().toLowerCase();
  let file: string | undefined = DIRECT[key];

  if (!file) {
    const hit = TABLE.find(row => row.emotions.some(e => e && key.includes(e.toLowerCase())));
    file = hit?.file;
  }
  const resolvedFile = file ?? FILES.PLACEHOLDER;

  return { id: key, name: label(resolvedFile), icon: urlFor(resolvedFile) };
}

export function iconForEmotion(emotion: string | null | undefined): string {
  return fruitForEmotion(emotion).icon;
}

export const ALL_FRUITS: FruitInfo[] =
  Object.values(FILES).map(f => ({ id: label(f).toLowerCase().replace(/\s+/g,"-"), name: label(f), icon: urlFor(f) }));
