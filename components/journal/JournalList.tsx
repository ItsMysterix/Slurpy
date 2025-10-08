"use client";

import * as React from "react";
import JournalItem from "./JournalItem";
import { JournalEntry } from "./types";

export default function JournalList(props: {
  entries: JournalEntry[];
  searchQuery: string;
  editingEntryId: string | null;
  edit: { title: string; content: string; tags: string; mood: string; fruit: string };
  setEdit: (updater: (s: any) => any) => void;
  saving: boolean;
  deleting: string | null;
  expandedSet: Set<string>;
  onToggleExpand: (id: string) => void;
  onPreview: (e: JournalEntry) => void;
  onStartEdit: (e: JournalEntry) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    entries,
    searchQuery,
    editingEntryId,
    edit,
    setEdit,
    saving,
    deleting,
    expandedSet,
    onToggleExpand,
    onPreview,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
  } = props;

  const filtered = entries.filter(
    (e) =>
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {filtered.map((entry, index) => (
        <JournalItem
          key={entry.id}
          entry={entry}
          index={index}
          isEditing={editingEntryId === entry.id}
          edit={edit}
          setEdit={setEdit}
          saving={saving}
          deleting={deleting}
          expanded={expandedSet.has(entry.id)}
          onToggleExpand={onToggleExpand}
          onPreview={onPreview}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onDelete={onDelete}
        />
      ))}
      {filtered.length === 0 && !searchQuery && (
        <div className="text-center py-12 opacity-90">
          <p className="text-clay-500 dark:text-sand-400">Start your journaling journey!</p>
        </div>
      )}
      {filtered.length === 0 && !!searchQuery && (
        <div className="text-center py-12 opacity-90">
          <p className="text-clay-500 dark:text-sand-400">No entries found matching “{searchQuery}”.</p>
        </div>
      )}
    </div>
  );
}
