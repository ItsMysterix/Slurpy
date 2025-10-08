"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Edit3, Loader2, Trash2, Eye } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import FruitSelect from "./FruitSelect";
import { fruitForEmotion } from "@/lib/moodFruit";

export type JournalEntry = {
  id: string;
  title: string;
  content: string;
  date: string;
  mood?: string;
  fruit?: string; // icon URL or legacy emoji
  tags: string[];
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export default function EntryCard({
  entry,
  index,
  expanded,
  onToggleExpand,
  onPreview,
  onStartEdit,
  editing,
  saving,
  deleting,
  editValues,
  onEditChange,
  onCancelEdit,
  onSaveEdit,
}: {
  entry: JournalEntry;
  index: number;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onPreview: (e: JournalEntry) => void;
  onStartEdit: (e: JournalEntry) => void;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  editValues: { title: string; content: string; tags: string; mood: string; fruit: string };
  onEditChange: (patch: Partial<typeof editValues>) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const getMoodColor = (mood: string) => {
    const moodColors: Record<string, string> = {
      peaceful: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300",
      stressed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300",
      joyful: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300",
      anxious: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300",
      content: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300",
      grateful: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300",
      reflective: "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300",
    };
    return moodColors[mood.toLowerCase()] || "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300";
  };

  const truncate = (s: string, n = 200) => (s.length <= n ? s : s.slice(0, n) + "...");

  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-lg transition-all duration-200">
      <CardContent className="p-6">
        {editing ? (
          // Edit Mode
          <div className="space-y-4">
            <Input
              value={editValues.title}
              onChange={(e) => onEditChange({ title: e.target.value })}
              placeholder="Entry title..."
              className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
              disabled={saving}
            />
            <Textarea
              value={editValues.content}
              onChange={(e) => onEditChange({ content: e.target.value })}
              placeholder="Content..."
              rows={6}
              className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 resize-none"
              disabled={saving}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                value={editValues.mood}
                onChange={(e) => {
                  const mood = e.target.value;
                  const suggested = fruitForEmotion(mood).icon;
                  const fruit = editValues.fruit ? editValues.fruit : suggested;
                  onEditChange({ mood, fruit });
                }}
                placeholder="Mood..."
                className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
                disabled={saving}
              />
              <FruitSelect
                value={editValues.fruit || null}
                onChange={(icon) => onEditChange({ fruit: icon })}
                placeholder="Pick fruit…"
              />
            </div>
            <Input
              value={editValues.tags}
              onChange={(e) => onEditChange({ tags: e.target.value })}
              placeholder="Tags (comma separated)..."
              className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
              disabled={saving}
            />
            <div className="flex justify-end gap-3">
              <Button onClick={onCancelEdit} variant="outline" size="sm" disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={onSaveEdit}
                size="sm"
                className="bg-gradient-to-r from-sage-500 to-clay-500 hover:from-sage-600 hover:to-clay-600 text-white"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 mr-1" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          // View Mode
          <>
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-display text-xl text-clay-700 dark:text-sand-200 mb-2">{entry.title}</h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-2 text-sm text-clay-500 dark:text-sand-400">
                    <Calendar className="w-4 h-4" />
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.fruit &&
                      (typeof entry.fruit === "string" && entry.fruit.startsWith("/") ? (
                        <img src={entry.fruit} alt="fruit" className="h-5 w-5 mr-1 rounded-sm" />
                      ) : (
                        <span className="text-lg mr-1">{entry.fruit}</span>
                      ))}
                    {entry.mood && <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${getMoodColor(entry.mood)}`}>{entry.mood}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-clay-600 dark:text-sand-300 font-sans leading-relaxed">
                {expanded ? entry.content : truncate(entry.content)}
              </p>
              {entry.content.length > 200 && (
                <Button
                  onClick={() => onToggleExpand(entry.id)}
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 p-0 h-auto font-normal"
                >
                  {expanded ? "Show less" : "Read more"}
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center rounded bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 text-xs px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={() => onPreview(entry)} variant="ghost" size="sm" className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300">
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button onClick={() => onStartEdit(entry)} variant="ghost" size="sm" className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300">
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button disabled={deleting} value={entry.id} variant="ghost" size="sm" className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300">
                  {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Delete
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
