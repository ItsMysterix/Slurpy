"use client";

import * as React from "react";
import Image from "next/image";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ALL_FRUITS } from "@/lib/moodFruit";

export type JournalFilterState = {
  fruits: string[];
  from?: string;
  to?: string;
  favoritesOnly?: boolean;
};

export default function SearchBar({
  value,
  onChange,
  filters,
  onFiltersChange,
}: {
  value: string;
  onChange: (v: string) => void;
  filters: JournalFilterState;
  onFiltersChange: (next: JournalFilterState) => void;
}) {
  // sanity ping
  console.log("SearchBar (journal) loaded");

  const activeCount =
    (filters.fruits?.length ?? 0) +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.favoritesOnly ? 1 : 0);

  return (
    <div className="relative flex items-center gap-2">
      {/* search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-sand-500" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search your journal entries..."
          className="pl-10 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
        />
      </div>

      {/* filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="rounded-xl border-sage-200/50">
            <Filter className="h-4 w-4 mr-2" />
            Filters {activeCount ? `(${activeCount})` : ""}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 rounded-2xl">
          <div className="space-y-4">
            {/* MoodFruit multi-select */}
            <section>
              <Label className="text-sage-700 dark:text-sand-200">Mood</Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {ALL_FRUITS.map(({ id, name, icon }) => {
                  const active = filters.fruits?.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      title={name}
                      onClick={() => {
                        const set = new Set(filters.fruits ?? []);
                        set.has(id) ? set.delete(id) : set.add(id);
                        onFiltersChange({ ...filters, fruits: Array.from(set) });
                      }}
                      className={`h-12 w-12 rounded-xl border flex items-center justify-center transition ${
                        active
                          ? "bg-sage-100 border-sage-300"
                          : "bg-white/50 border-sand-200 hover:bg-sage-50"
                      }`}
                    >
                      <Image src={icon} alt={name} width={28} height={28} className="object-contain" />
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator />

            {/* Date range */}
            <section className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="from">From</Label>
                <Input
                  id="from"
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(e) => onFiltersChange({ ...filters, from: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(e) => onFiltersChange({ ...filters, to: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </section>

            <Separator />

            {/* Favorites only */}
            <section className="flex items-center gap-2">
              <Checkbox
                id="fav"
                checked={!!filters.favoritesOnly}
                onCheckedChange={(ck) =>
                  onFiltersChange({ ...filters, favoritesOnly: Boolean(ck) })
                }
              />
              <Label htmlFor="fav">Favorites only</Label>
            </section>

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  onFiltersChange({ fruits: [], from: undefined, to: undefined, favoritesOnly: false })
                }
              >
                Clear
              </Button>
              <Button type="button">Apply</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
