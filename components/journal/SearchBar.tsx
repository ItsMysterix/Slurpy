"use client";

import * as React from "react";
import Image from "next/image";
import { Search, Filter, Calendar } from "lucide-react";
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
          className="pl-10 rounded-xl border-sage-200/40 dark:border-gray-700/60 bg-white/60 dark:bg-slate-900/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
        />
      </div>

      {/* filters */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="rounded-xl border-sage-200/50 dark:border-gray-700/70 bg-white/70 dark:bg-slate-900/70 text-clay-700 dark:text-sand-100 hover:bg-white/90 dark:hover:bg-slate-800/80"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters {activeCount ? `(${activeCount})` : ""}
          </Button>
        </PopoverTrigger>

        {/* Panel styled for dark theme */}
        <PopoverContent
          align="end"
          className="w-[22rem] rounded-2xl border border-gray-700/70 bg-[#0B1220]/95 text-sand-100 shadow-2xl backdrop-blur-md"
        >
          <div className="space-y-4">
            {/* MoodFruit multi-select */}
            <section>
              <Label className="text-sand-200">Mood</Label>
              <div className="mt-3 grid grid-cols-5 gap-2">
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
                      className={[
                        "h-12 w-12 rounded-xl border flex items-center justify-center transition",
                        "bg-slate-900/70 border-slate-700/70 hover:bg-slate-800/70",
                        active &&
                          "ring-2 ring-sage-400/50 border-sage-400/70 bg-sage-500/15 hover:bg-sage-500/20",
                      ].join(" ")}
                    >
                      <Image
                        src={icon}
                        alt={name}
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator className="bg-slate-700/60" />

            {/* Date range */}
            <section className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="from" className="text-sand-200">
                  From
                </Label>
                <div className="relative">
                  <Input
                    id="from"
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) => onFiltersChange({ ...filters, from: e.target.value })}
                    className="date-input rounded-2xl bg-slate-900/70 text-sand-100 border border-slate-700/70 focus:border-sage-400 focus:ring-2 focus:ring-sage-400/30 px-4 pr-11 py-3"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sand-300" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="to" className="text-sand-200">
                  To
                </Label>
                <div className="relative">
                  <Input
                    id="to"
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) => onFiltersChange({ ...filters, to: e.target.value })}
                    className="date-input rounded-2xl bg-slate-900/70 text-sand-100 border border-slate-700/70 focus:border-sage-400 focus:ring-2 focus:ring-sage-400/30 px-4 pr-11 py-3"
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sand-300" />
                </div>
              </div>
            </section>

            <Separator className="bg-slate-700/60" />

            {/* Favorites only */}
            <section className="flex items-center gap-2">
              <Checkbox
                id="fav"
                checked={!!filters.favoritesOnly}
                onCheckedChange={(ck) => onFiltersChange({ ...filters, favoritesOnly: Boolean(ck) })}
              />
              <Label htmlFor="fav" className="text-sand-200">
                Favorites only
              </Label>
            </section>

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                className="text-sand-200 hover:bg-slate-800/60"
                onClick={() =>
                  onFiltersChange({
                    fruits: [],
                    from: undefined,
                    to: undefined,
                    favoritesOnly: false,
                  })
                }
              >
                Clear
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-sage-600 text-white hover:bg-sage-500"
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
