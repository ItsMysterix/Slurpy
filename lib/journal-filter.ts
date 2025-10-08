export type Entry = {
  id: string;
  text: string;
  date: string;       // ISO date
  fruitId?: string;   // e.g. "cherry-charge"
  favorite?: boolean;
};

export function filterEntries(
  entries: Entry[],
  q: string,
  f: { fruits: string[]; from?: string; to?: string; favoritesOnly?: boolean }
): Entry[] {
  const query = q.trim().toLowerCase();
  const fromTs = f.from ? new Date(f.from).getTime() : -Infinity;
  const toTs = f.to ? new Date(f.to).getTime() + 86_399_999 : Infinity; // inclusive day
  return entries.filter((e) => {
    const okText = query ? e.text.toLowerCase().includes(query) : true;
    const okFruit = f.fruits?.length ? f.fruits.includes(e.fruitId ?? "") : true;
    const ts = new Date(e.date).getTime();
    const okDate = ts >= fromTs && ts <= toTs;
    const okFav = f.favoritesOnly ? !!e.favorite : true;
    return okText && okFruit && okDate && okFav;
  });
}
