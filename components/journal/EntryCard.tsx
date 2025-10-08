// components/journal/EntryCard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, PencilLine, Save, X, ChevronDown, ChevronUp, Eye } from "lucide-react";
import Image from "next/image";
import type { JournalEntry } from "./types";

export type EntryCardProps = {
  entry: JournalEntry;
  index: number;
  expanded: boolean;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  editValues: { title: string; content: string; tags: string; mood: string; fruit: string };
  onToggleExpand: (id: string) => void;
  onPreview: (e: JournalEntry) => void;
  onStartEdit: (e: JournalEntry) => void;
  onEditChange: (patch: Partial<EntryCardProps["editValues"]>) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  // 🔥 NEW
  onDelete: (id: string) => void;
};

export default function EntryCard({
  entry,
  index,
  expanded,
  editing,
  saving,
  deleting,
  editValues,
  onToggleExpand,
  onPreview,
  onStartEdit,
  onEditChange,
  onCancelEdit,
  onSaveEdit,
  onDelete, // ← NEW
}: EntryCardProps) {
  const [confirm, setConfirm] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.25 }}
      className="rounded-2xl border border-sage-200/60 dark:border-gray-700/60 bg-white/70 dark:bg-gray-800/70 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        {/* Fruit icon if present */}
        {entry.fruit ? (
          <Image src={entry.fruit} alt={entry.mood ?? "mood"} width={28} height={28} className="rounded-md" />
        ) : null}

        <div className="flex-1">
          {editing ? (
            <input
              className="w-full bg-transparent outline-none font-semibold text-clay-700 dark:text-sand-100"
              value={editValues.title}
              onChange={(e) => onEditChange({ title: e.target.value })}
              placeholder="Title"
            />
          ) : (
            <h3 className="font-semibold text-clay-700 dark:text-sand-100">{entry.title || "Untitled"}</h3>
          )}

          <div className="text-xs text-clay-400 dark:text-sand-500 mt-1">
            {new Date(entry.date || entry.createdAt).toLocaleString()}
            {entry.tags.length ? (
              <span className="ml-2">
                • {entry.tags.map((t) => `#${t}`).join(" ")}
              </span>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {!editing ? (
            <>
              <button
                onClick={() => onPreview(entry)}
                className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60"
                title="Preview"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={() => onStartEdit(entry)}
                className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60"
                title="Edit"
              >
                <PencilLine className="w-4 h-4" />
              </button>

              {/* Delete w/ confirm */}
              {confirm ? (
                <div className="flex items-center gap-1">
                  <button
                    disabled={deleting}
                    onClick={() => onDelete(entry.id)}
                    className="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    title="Confirm delete"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirm(false)}
                    className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  disabled={deleting}
                  onClick={() => setConfirm(true)}
                  className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60 text-red-600"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => onToggleExpand(entry.id)}
                className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60"
                title={expanded ? "Collapse" : "Expand"}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </>
          ) : (
            <>
              <button
                disabled={saving}
                onClick={onSaveEdit}
                className="px-2 py-1 rounded-lg bg-sage-500 text-white hover:bg-sage-600 disabled:opacity-50"
                title="Save"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={onCancelEdit}
                className="px-2 py-1 rounded-lg hover:bg-sage-100/60 dark:hover:bg-gray-700/60"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4">
          {editing ? (
            <>
              <textarea
                className="w-full min-h-[120px] bg-transparent outline-none text-sm text-clay-700 dark:text-sand-100"
                value={editValues.content}
                onChange={(e) => onEditChange({ content: e.target.value })}
                placeholder="Write your thoughts…"
              />
              <input
                className="mt-3 w-full bg-transparent outline-none text-xs text-clay-500 dark:text-sand-400"
                value={editValues.tags}
                onChange={(e) => onEditChange({ tags: e.target.value })}
                placeholder="Tags (comma separated)"
              />
            </>
          ) : (
            <p className="text-sm text-clay-700/90 dark:text-sand-100/90 whitespace-pre-wrap">
              {entry.content}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
