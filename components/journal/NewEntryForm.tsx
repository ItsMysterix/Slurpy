"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Edit3, Loader2 } from "lucide-react";
import FruitSelect from "./FruitSelect";
import { fruitForEmotion } from "@/lib/moodFruit";

export default function NewEntryForm({
  open,
  saving,
  values,
  onChange,
  onCancel,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  values: { title: string; content: string; tags: string; mood: string; fruit: string };
  onChange: (patch: Partial<typeof values>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!open) return null;

  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
            <Edit3 className="w-5 h-5" />
            New Journal Entry
          </h3>
          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
            disabled={saving}
          >
            Cancel
          </Button>
        </div>

        <div className="space-y-4">
          <Input
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Entry title..."
            className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
            disabled={saving}
          />

          <Textarea
            value={values.content}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder="What's on your mind today?"
            rows={6}
            className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 resize-none backdrop-blur-sm"
            disabled={saving}
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Mood with auto-suggested fruit */}
            <Input
              value={values.mood}
              onChange={(e) => {
                const mood = e.target.value;
                const suggested = fruitForEmotion(mood).icon;
                // Keep user-picked fruit if already set; otherwise auto-suggest
                const fruit = values.fruit ? values.fruit : suggested;
                onChange({ mood, fruit });
              }}
              placeholder="Mood (optional)..."
              className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
              disabled={saving}
            />

            {/* Fruit selector */}
            <FruitSelect
              value={values.fruit || null}
              onChange={(icon) => onChange({ fruit: icon })}
              placeholder="Pick fruit…"
            />
          </div>

          <Input
            value={values.tags}
            onChange={(e) => onChange({ tags: e.target.value })}
            placeholder="Tags (comma separated)..."
            className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
            disabled={saving}
          />

          <div className="flex justify-end gap-3">
            <Button
              onClick={onCancel}
              variant="outline"
              className="rounded-xl border-sage-200 hover:bg-sage-100 dark:border-gray-600 dark:hover:bg-gray-700"
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={onSave}
              className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl"
              disabled={saving || !values.title.trim() || !values.content.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Entry"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
