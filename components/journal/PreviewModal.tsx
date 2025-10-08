"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Eye, X, Edit3 } from "lucide-react";
import { motion } from "framer-motion";
import type { JournalEntry } from "./EntryCard";

export default function PreviewModal({
  entry,
  onClose,
  onEdit,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
  onEdit: (e: JournalEntry) => void;
}) {
  if (!entry) return null;

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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3">
            <Eye className="w-6 h-6" />
            Preview Entry
          </h2>
          <Button onClick={onClose} variant="ghost" size="sm" className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-display font-medium text-clay-700 dark:text-sand-200 mb-4">{entry.title}</h1>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-2 text-clay-500 dark:text-sand-400">
                  <Calendar className="w-5 h-5" />
                  <span className="text-lg">
                    {new Date(entry.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {entry.fruit &&
                    (typeof entry.fruit === "string" && entry.fruit.startsWith("/") ? (
                      <img src={entry.fruit} alt="fruit" className="h-6 w-6 rounded-sm" />
                    ) : (
                      <span className="text-2xl">{entry.fruit}</span>
                    ))}
                  {entry.mood && <Badge className={`text-sm border ${getMoodColor(entry.mood)}`}>{entry.mood}</Badge>}
                </div>
              </div>
            </div>

            <div className="prose prose-lg dark:prose-invert max-w-none">
              <div className="text-clay-600 dark:text-sand-300 font-sans leading-relaxed text-lg whitespace-pre-wrap">{entry.content}</div>
            </div>

            {entry.tags.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-display font-medium text-clay-700 dark:text-sand-200 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center rounded bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 text-sm px-3 py-1">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex justify-between items-center text-sm text-clay-500 dark:text-sand-400">
                <span>
                  Created:{" "}
                  {new Date(entry.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {entry.updatedAt !== entry.createdAt && (
                  <span>
                    Last updated:{" "}
                    {new Date(entry.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Button
            onClick={() => {
              onClose();
              onEdit(entry);
            }}
            className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Edit Entry
          </Button>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
