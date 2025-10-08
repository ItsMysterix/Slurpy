"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-sand-500" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search your journal entries..."
        className="pl-10 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
      />
    </div>
  );
}
