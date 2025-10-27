"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, useUser } from "@/lib/auth-hooks";
import { supabase } from "@/lib/supabaseClient";

import SlideDrawer from "@/components/slide-drawer";
import JournalHeader from "@/components/journal/JournalHeader";
import SearchBar, { type JournalFilterState } from "@/components/journal/SearchBar";
import NewEntryForm from "@/components/journal/NewEntryForm";
import EntryCard from "@/components/journal/EntryCard";
import type { JournalEntry } from "@/components/journal/types";
import PreviewModal from "@/components/journal/PreviewModal";

import { filterEntries, type Entry as FilterEntry } from "@/lib/journal-filter";
import { fruitForEmotion } from "@/lib/moodFruit";

/** ---------- Normalizers (prevent shape issues) ---------- */
const normalizeTags = (tags: unknown): string[] => {
  if (Array.isArray(tags)) return tags.map(String).map((t) => t.trim()).filter(Boolean);
  if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
};

const filenameToSlug = (icon?: string) => {
  if (!icon) return undefined;
  const base = icon.split("/").pop() ?? "";
  const name = base.replace(/\.(ico|png|jpg|jpeg|svg)$/i, "");
  return name ? name.toLowerCase().replace(/\s+/g, "-") : undefined;
};

const moodToSlug = (mood?: string) => {
  if (!mood) return undefined;
  const name = fruitForEmotion(mood).name; // e.g. "Sour Lemon"
  return name.toLowerCase().replace(/\s+/g, "-");
};

const normalizeEntry = (e: any): (JournalEntry & { fruitId?: string; favorite?: boolean }) => {
  const id = e?.id ?? e?._id ?? crypto.randomUUID();
  const createdAt = e?.createdAt ?? e?.date ?? new Date().toISOString();
  const updatedAt = e?.updatedAt ?? createdAt;
  const date = e?.date ?? createdAt;

  const fruitIcon = e?.fruit ? String(e.fruit) : undefined;
  const fruitId = filenameToSlug(fruitIcon) || moodToSlug(e?.mood ? String(e.mood) : undefined);

  return {
    id: String(id),
    title: String(e?.title ?? ""),
    content: String(e?.content ?? ""),
    date: String(date),
    mood: e?.mood ? String(e.mood) : undefined,
    fruit: fruitIcon, // icon URL or legacy emoji
    tags: normalizeTags(e?.tags),
    userId: String(e?.userId ?? e?.user_id ?? ""),
    createdAt: String(createdAt),
    updatedAt: String(updatedAt),

    // extras for filtering
    fruitId,
    favorite: Boolean(e?.favorite),
  };
};

const normalizeArrayResponse = (raw: any): (JournalEntry & { fruitId?: string; favorite?: boolean })[] => {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : raw ? [raw] : [];
  return arr.map(normalizeEntry);
};

export default function JournalPage() {
  const { userId } = useAuth();
  const { user } = useUser();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // page state
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<JournalFilterState>({
    fruits: [],
    from: undefined,
    to: undefined,
    favoritesOnly: false,
  });

  const [journalEntries, setJournalEntries] = useState<(JournalEntry & { fruitId?: string; favorite?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<JournalEntry | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // form models
  const [newEntry, setNewEntry] = useState({ title: "", content: "", tags: "", mood: "", fruit: "" });
  const [editEntry, setEditEntry] = useState({ title: "", content: "", tags: "", mood: "", fruit: "" });

  // ---------- Fetch journal entries ----------
  const fetchJournalEntries = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      let bearer = "";
      try { const { data } = await supabase.auth.getSession(); bearer = data.session?.access_token || ""; } catch {}
      const response = await fetch(`/api/journal`, { headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) } });
      if (response.ok) {
        const raw = await response.json();
        const normalized = normalizeArrayResponse(raw);
        setJournalEntries(normalized);
      } else {
        console.error("Failed to fetch journal entries");
        setJournalEntries([]);
      }
    } catch (error) {
      console.error("Error fetching journal entries:", error);
      setJournalEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) void fetchJournalEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ---------- Actions ----------
  const handleSaveEntry = async () => {
    if (!userId || !newEntry.title.trim() || !newEntry.content.trim()) {
      alert("Please fill in both title and content");
      return;
    }
    try {
      setSaving(true);
      const entryData = {
        title: newEntry.title.trim(),
        content: newEntry.content.trim(),
        mood: newEntry.mood.trim() || undefined,
        fruit: newEntry.fruit || undefined, // icon URL if chosen
        tags: newEntry.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0),
        userId,
      };
      let bearer = "";
      try { const { data } = await supabase.auth.getSession(); bearer = data.session?.access_token || ""; } catch {}
      const headersPost: Record<string, string> = { "Content-Type": "application/json" };
      if (typeof document !== "undefined") {
        const m = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
        const t = m ? decodeURIComponent(m[1]) : "";
        if (t) headersPost["x-csrf"] = t;
      }
      if (bearer) headersPost["Authorization"] = `Bearer ${bearer}`;
      const response = await fetch("/api/journal", {
        method: "POST",
        headers: headersPost,
        body: JSON.stringify(entryData),
      });
      if (response.ok) {
        const rawSaved = await response.json();
        const savedArray = normalizeArrayResponse(rawSaved);
        const savedEntry = savedArray[0] ?? normalizeEntry(rawSaved);
        setJournalEntries((prev) => [savedEntry, ...prev]);
        setNewEntry({ title: "", content: "", tags: "", mood: "", fruit: "" });
        setShowNewEntry(false);
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("Failed to save entry:", err);
        alert("Failed to save entry. Please try again.");
      }
    } catch (error) {
      console.error("Error saving entry:", error);
      alert("Error saving entry. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditEntry = (entry: JournalEntry) => {
    setEditingEntry(entry.id);
    setEditEntry({
      title: entry.title,
      content: entry.content,
      tags: entry.tags.join(", "),
      mood: entry.mood || "",
      fruit: entry.fruit || "",
    });
  };

  const handleSaveEdit = async (entryId: string) => {
    if (!editEntry.title.trim() || !editEntry.content.trim()) {
      alert("Please fill in both title and content");
      return;
    }
    try {
      setSaving(true);
      const updateData = {
        id: entryId,
        title: editEntry.title.trim(),
        content: editEntry.content.trim(),
        mood: editEntry.mood.trim() || undefined,
        fruit: editEntry.fruit || undefined,
        tags: editEntry.tags.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0),
      };
      let bearer = "";
      try { const { data } = await supabase.auth.getSession(); bearer = data.session?.access_token || ""; } catch {}
      const headersPut: Record<string, string> = { "Content-Type": "application/json" };
      if (typeof document !== "undefined") {
        const m2 = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
        const t2 = m2 ? decodeURIComponent(m2[1]) : "";
        if (t2) headersPut["x-csrf"] = t2;
      }
      if (bearer) headersPut["Authorization"] = `Bearer ${bearer}`;
      const response = await fetch("/api/journal", {
        method: "PUT",
        headers: headersPut,
        body: JSON.stringify(updateData),
      });
      if (response.ok) {
        const rawUpdated = await response.json();
        const updatedArray = normalizeArrayResponse(rawUpdated);
        const updatedEntry = updatedArray[0] ?? normalizeEntry(rawUpdated);
        setJournalEntries((prev) => prev.map((e) => (e.id === entryId ? updatedEntry : e)));
        setEditingEntry(null);
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("Failed to update entry:", err);
        alert("Failed to update entry. Please try again.");
      }
    } catch (error) {
      console.error("Error updating entry:", error);
      alert("Error updating entry. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Delete this journal entry? This action cannot be undone.")) return;
    try {
      setDeleting(entryId);
  let bearer = "";
  try { const { data } = await supabase.auth.getSession(); bearer = data.session?.access_token || ""; } catch {}
  const headersDel: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const m3 = /(?:^|;\s*)slurpy\.csrf=([^;]+)/i.exec(document.cookie || "");
    const t3 = m3 ? decodeURIComponent(m3[1]) : "";
    if (t3) headersDel["x-csrf"] = t3;
  }
  if (bearer) headersDel["Authorization"] = `Bearer ${bearer}`;
  const response = await fetch(`/api/journal?id=${entryId}`, { method: "DELETE", headers: headersDel });
      if (response.ok) {
        setJournalEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("Failed to delete entry:", err);
        alert("Failed to delete entry. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting entry:", error);
      alert("Error deleting entry. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  // UI helpers
  const toggleExpanded = (entryId: string) => {
    setExpandedEntries((s) => {
      const n = new Set(s);
      n.has(entryId) ? n.delete(entryId) : n.add(entryId);
      return n;
    });
  };

  const safeEntries = Array.isArray(journalEntries) ? journalEntries : [];

  // Build filterable projection
  const filterInput: FilterEntry[] = useMemo(
    () =>
      safeEntries.map((e) => ({
        id: e.id,
        text: `${e.title} ${e.content} ${e.tags.join(" ")}`,
        date: e.date,
        fruitId: (e as any).fruitId,
        favorite: (e as any).favorite,
      })),
    [safeEntries]
  );

  const filteredIds = useMemo(
    () =>
      new Set(
        filterEntries(filterInput, searchQuery, {
          fruits: filters.fruits,
          from: filters.from,
          to: filters.to,
          favoritesOnly: filters.favoritesOnly,
        }).map((e) => e.id)
      ),
    [filterInput, searchQuery, filters]
  );

  const filteredEntries = safeEntries.filter((e) => filteredIds.has(e.id));

  // ---- Empty state guards ----
  const hasAnyEntries = safeEntries.length > 0;
  const hasActiveFilters =
    !!searchQuery ||
    filters.fruits.length > 0 ||
    !!filters.from ||
    !!filters.to ||
    !!filters.favoritesOnly;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "md:ml-64" : "md:ml-16"} ml-0`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-clay-500 dark:text-sand-400" />
              <p className="text-clay-500 dark:text-sand-400">Loading your journal entries...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "md:ml-64" : "md:ml-16"} ml-0`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <JournalHeader userFirstName={(() => {
            const m: any = user?.user_metadata || {};
            const username = m.username || m.user_name;
            const full = m.name || m.full_name;
            const gn = m.given_name, fn = m.family_name;
            const email = user?.email;
            return (username || full || [gn, fn].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "")) as string;
          })()} onNew={() => setShowNewEntry(true)} />

          {/* Main */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Search + Filters */}
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                filters={filters}
                onFiltersChange={setFilters}
              />

              {/* New Entry */}
              <NewEntryForm
                open={showNewEntry}
                saving={saving}
                values={newEntry}
                onChange={(patch) => setNewEntry((prev) => ({ ...prev, ...patch }))}
                onCancel={() => setShowNewEntry(false)}
                onSave={handleSaveEntry}
              />

              {/* Entries */}
              <div className="space-y-4">
                {/* True empty state: no entries, no filters/search, and not composing */}
                {!hasAnyEntries && !hasActiveFilters && !showNewEntry ? (
                  <div className="text-center py-12 opacity-90">
                    <p className="text-clay-500 dark:text-sand-400 font-sans mb-4">Start your journaling journey!</p>
                    <button
                      onClick={() => setShowNewEntry(true)}
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl px-4 py-2"
                    >
                      Write your first entry
                    </button>
                  </div>
                ) : (
                  filteredEntries.map((entry, index) => (
                    <div key={entry.id}>
                      <EntryCard
                        entry={entry}
                        index={index}
                        expanded={expandedEntries.has(entry.id)}
                        onToggleExpand={toggleExpanded}
                        onPreview={(e) => setPreviewEntry(e)}
                        onStartEdit={handleEditEntry}
                        editing={editingEntry === entry.id}
                        saving={saving}
                        deleting={deleting === entry.id}
                        editValues={editEntry}
                        onEditChange={(patch) => setEditEntry((prev) => ({ ...prev, ...patch }))}
                        onCancelEdit={() => {
                          setEditingEntry(null);
                          setEditEntry({ title: "", content: "", tags: "", mood: "", fruit: "" });
                        }}
                        onSaveEdit={() => handleSaveEdit(entry.id)}
                        // ✅ wired delete
                        onDelete={(id) => handleDeleteEntry(id)}
                      />
                    </div>
                  ))
                )}
              </div>

              {/* No results (filters or query applied, or user has entries) */}
              {filteredEntries.length === 0 && (hasActiveFilters || hasAnyEntries) && (
                <div className="text-center py-12">
                  <p className="text-clay-500 dark:text-sand-400 font-sans">No entries match your filters.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal
        entry={previewEntry}
        onClose={() => setPreviewEntry(null)}
        onEdit={(e) => {
          setPreviewEntry(null);
          handleEditEntry(e);
        }}
      />
    </div>
  );
}
