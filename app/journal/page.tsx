"use client"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BookOpen, Plus, Search, Calendar, Sun, Moon, Edit3, Loader2, Save, X, Trash2, Eye, EyeOff } from "lucide-react"
import { useTheme } from "next-themes"
import { useAuth, useUser } from "@clerk/nextjs"
import SlideDrawer from "@/components/slide-drawer"

// Journal entry type
interface JournalEntry {
  id: string
  title: string
  content: string
  date: string
  mood?: string
  fruit?: string
  tags: string[]
  userId: string
  createdAt: string
  updatedAt: string
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors opacity-0"
      >
        <Sun className="w-5 h-5" />
      </Button>
    )
  }

  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-clay-600 hover:text-clay-500 dark:text-sand-400 dark:hover:text-sand-300 p-2 rounded-lg transition-colors"
    >
      {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </Button>
  )
}

export default function JournalPage() {
  const { userId } = useAuth()
  const { user } = useUser()
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingEntry, setEditingEntry] = useState<string | null>(null)
  const [previewEntry, setPreviewEntry] = useState<JournalEntry | null>(null)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [newEntry, setNewEntry] = useState({
    title: "",
    content: "",
    tags: "",
    mood: "",
    fruit: "🌱"
  })
  const [editEntry, setEditEntry] = useState({
    title: "",
    content: "",
    tags: "",
    mood: "",
    fruit: ""
  })

  // ---------- Normalizers (prevent shape issues) ----------
  const normalizeTags = (tags: unknown): string[] => {
    if (Array.isArray(tags)) return tags.map(String).map(t => t.trim()).filter(Boolean)
    if (typeof tags === "string") {
      return tags.split(",").map(t => t.trim()).filter(Boolean)
    }
    return []
  }

  const normalizeEntry = (e: any): JournalEntry => {
    const id =
      e?.id ?? e?._id ?? crypto.randomUUID()
    const createdAt = e?.createdAt ?? e?.date ?? new Date().toISOString()
    const updatedAt = e?.updatedAt ?? createdAt
    const date = e?.date ?? createdAt

    return {
      id: String(id),
      title: String(e?.title ?? ""),
      content: String(e?.content ?? ""),
      date: String(date),
      mood: e?.mood ? String(e.mood) : undefined,
      fruit: e?.fruit ? String(e.fruit) : undefined,
      tags: normalizeTags(e?.tags),
      userId: String(e?.userId ?? e?.user_id ?? ""),
      createdAt: String(createdAt),
      updatedAt: String(updatedAt),
    }
  }

  const normalizeArrayResponse = (raw: any): JournalEntry[] => {
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.entries)
        ? raw.entries
        : raw
          ? [raw]
          : []
    return arr.map(normalizeEntry)
  }

  // ---------- Fetch journal entries for current user ----------
  const fetchJournalEntries = async () => {
    if (!userId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/journal?userId=${userId}`)
      
      if (response.ok) {
        const raw = await response.json()
        const normalized = normalizeArrayResponse(raw)
        setJournalEntries(normalized)
      } else {
        console.error("Failed to fetch journal entries")
        setJournalEntries([]) // keep it an array to avoid filter crashes
      }
    } catch (error) {
      console.error("Error fetching journal entries:", error)
      setJournalEntries([]) // keep it an array to avoid filter crashes
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) {
      fetchJournalEntries()
    }
  }, [userId])

  // ---------- Save new journal entry ----------
  const handleSaveEntry = async () => {
    if (!userId || !newEntry.title.trim() || !newEntry.content.trim()) {
      alert("Please fill in both title and content")
      return
    }

    try {
      setSaving(true)
      
      const entryData = {
        title: newEntry.title.trim(),
        content: newEntry.content.trim(),
        mood: newEntry.mood.trim() || undefined,
        fruit: newEntry.fruit,
        tags: newEntry.tags
          .split(",")
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0),
        userId: userId
      }

      const response = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(entryData)
      })

      if (response.ok) {
        const rawSaved = await response.json()
        const savedArray = normalizeArrayResponse(rawSaved)
        const savedEntry = savedArray[0] ?? normalizeEntry(rawSaved)
        setJournalEntries(prev => [savedEntry, ...prev])
        setNewEntry({ title: "", content: "", tags: "", mood: "", fruit: "🌱" })
        setShowNewEntry(false)
        console.log("Entry saved successfully!")
      } else {
        const error = await response.json().catch(() => ({}))
        console.error("Failed to save entry:", error)
        alert("Failed to save entry. Please try again.")
      }
    } catch (error) {
      console.error("Error saving entry:", error)
      alert("Error saving entry. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ---------- Start editing ----------
  const handleEditEntry = (entry: JournalEntry) => {
    setEditingEntry(entry.id)
    setEditEntry({
      title: entry.title,
      content: entry.content,
      tags: entry.tags.join(", "),
      mood: entry.mood || "",
      fruit: entry.fruit || ""
    })
  }

  // ---------- Save edited entry ----------
  const handleSaveEdit = async (entryId: string) => {
    if (!editEntry.title.trim() || !editEntry.content.trim()) {
      alert("Please fill in both title and content")
      return
    }

    try {
      setSaving(true)
      
      const updateData = {
        id: entryId,
        title: editEntry.title.trim(),
        content: editEntry.content.trim(),
        mood: editEntry.mood.trim() || undefined,
        fruit: editEntry.fruit || undefined,
        tags: editEntry.tags
          .split(",")
          .map(tag => tag.trim())
          .filter(tag => tag.length > 0)
      }

      const response = await fetch("/api/journal", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updateData)
      })

      if (response.ok) {
        const rawUpdated = await response.json()
        const updatedArray = normalizeArrayResponse(rawUpdated)
        const updatedEntry = updatedArray[0] ?? normalizeEntry(rawUpdated)

        setJournalEntries(prev => 
          prev.map(entry => entry.id === entryId ? updatedEntry : entry)
        )
        setEditingEntry(null)
        console.log("Entry updated successfully!")
      } else {
        const error = await response.json().catch(() => ({}))
        console.error("Failed to update entry:", error)
        alert("Failed to update entry. Please try again.")
      }
    } catch (error) {
      console.error("Error updating entry:", error)
      alert("Error updating entry. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // ---------- Delete entry ----------
  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm("Are you sure you want to delete this journal entry? This action cannot be undone.")) {
      return
    }

    try {
      setDeleting(entryId)
      
      const response = await fetch(`/api/journal?id=${entryId}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setJournalEntries(prev => prev.filter(entry => entry.id !== entryId))
        console.log("Entry deleted successfully!")
      } else {
        const error = await response.json().catch(() => ({}))
        console.error("Failed to delete entry:", error)
        alert("Failed to delete entry. Please try again.")
      }
    } catch (error) {
      console.error("Error deleting entry:", error)
      alert("Error deleting entry. Please try again.")
    } finally {
      setDeleting(null)
    }
  }

  // Toggle preview mode
  const handlePreviewEntry = (entry: JournalEntry) => {
    setPreviewEntry(entry)
  }

  // Close preview
  const handleClosePreview = () => {
    setPreviewEntry(null)
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingEntry(null)
    setEditEntry({ title: "", content: "", tags: "", mood: "", fruit: "" })
  }

  // Toggle expanded content
  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries)
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId)
    } else {
      newExpanded.add(entryId)
    }
    setExpandedEntries(newExpanded)
  }

  // Truncate content for preview
  const truncateContent = (content: string, maxLength: number = 200) => {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + "..."
  }

  // Filter entries based on search query (guard with Array.isArray even though we normalize)
  const safeEntries = Array.isArray(journalEntries) ? journalEntries : []
  const filteredEntries = safeEntries.filter(
    (entry) =>
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const getMoodColor = (mood: string) => {
    const moodColors: { [key: string]: string } = {
      peaceful: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300",
      stressed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300",
      joyful: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300",
      anxious: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300",
      content: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300",
      grateful: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300",
      reflective: "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300"
    }
    return moodColors[mood.toLowerCase()] || "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300"
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-clay-500 dark:text-sand-400" />
              <p className="text-clay-500 dark:text-sand-400">Loading your journal entries...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sand-50 via-sage-25 to-clay-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-white/30 dark:bg-gray-900/30 backdrop-blur-sm border-b border-sage-100/50 dark:border-gray-800/50">
            <motion.h1
              className="text-2xl font-display font-medium text-clay-700 dark:text-sand-200 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <BookOpen className="w-6 h-6" />
              Journal
              {user && (
                <span className="text-sm font-sans text-clay-500 dark:text-sand-400">
                  - {user.firstName}'s entries
                </span>
              )}
            </motion.h1>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowNewEntry(true)}
                className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl px-4 py-2"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Entry
              </Button>
              <ThemeToggle />
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Search Bar */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-sand-500" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your journal entries..."
                    className="pl-10 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
                  />
                </div>
              </motion.div>

              {/* New Entry Form */}
              {showNewEntry && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 flex items-center gap-2">
                          <Edit3 className="w-5 h-5" />
                          New Journal Entry
                        </h3>
                        <Button
                          onClick={() => setShowNewEntry(false)}
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
                          value={newEntry.title}
                          onChange={(e) => setNewEntry((prev) => ({ ...prev, title: e.target.value }))}
                          placeholder="Entry title..."
                          className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
                          disabled={saving}
                        />

                        <Textarea
                          value={newEntry.content}
                          onChange={(e) => setNewEntry((prev) => ({ ...prev, content: e.target.value }))}
                          placeholder="What's on your mind today?"
                          rows={6}
                          className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 resize-none backdrop-blur-sm"
                          disabled={saving}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            value={newEntry.mood}
                            onChange={(e) => setNewEntry((prev) => ({ ...prev, mood: e.target.value }))}
                            placeholder="Mood (optional)..."
                            className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
                            disabled={saving}
                          />
                          <Input
                            value={newEntry.fruit}
                            onChange={(e) => setNewEntry((prev) => ({ ...prev, fruit: e.target.value }))}
                            placeholder="Fruit emoji..."
                            className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
                            disabled={saving}
                          />
                        </div>

                        <Input
                          value={newEntry.tags}
                          onChange={(e) => setNewEntry((prev) => ({ ...prev, tags: e.target.value }))}
                          placeholder="Tags (comma separated)..."
                          className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 focus:border-sage-300 dark:focus:border-sand-400 backdrop-blur-sm"
                          disabled={saving}
                        />

                        <div className="flex justify-end gap-3">
                          <Button
                            onClick={() => setShowNewEntry(false)}
                            variant="outline"
                            className="rounded-xl border-sage-200 hover:bg-sage-100 dark:border-gray-600 dark:hover:bg-gray-700"
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveEntry}
                            className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl"
                            disabled={saving || !newEntry.title.trim() || !newEntry.content.trim()}
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
                </motion.div>
              )}

              {/* Journal Entries */}
              <div className="space-y-4">
                {filteredEntries.length === 0 && !searchQuery ? (
                  <motion.div
                    className="text-center py-12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6 }}
                  >
                    <BookOpen className="w-12 h-12 text-clay-300 dark:text-sand-600 mx-auto mb-4" />
                    <p className="text-clay-500 dark:text-sand-400 font-sans mb-4">
                      Start your journaling journey!
                    </p>
                    <Button
                      onClick={() => setShowNewEntry(true)}
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white rounded-xl"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Write your first entry
                    </Button>
                  </motion.div>
                ) : (
                  filteredEntries.map((entry, index) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                    >
                      <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-lg transition-all duration-200">
                        <CardContent className="p-6">
                          {editingEntry === entry.id ? (
                            // Edit Mode
                            <div className="space-y-4">
                              <Input
                                value={editEntry.title}
                                onChange={(e) => setEditEntry(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Entry title..."
                                className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
                                disabled={saving}
                              />
                              <Textarea
                                value={editEntry.content}
                                onChange={(e) => setEditEntry(prev => ({ ...prev, content: e.target.value }))}
                                placeholder="Content..."
                                rows={6}
                                className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60 resize-none"
                                disabled={saving}
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <Input
                                  value={editEntry.mood}
                                  onChange={(e) => setEditEntry(prev => ({ ...prev, mood: e.target.value }))}
                                  placeholder="Mood..."
                                  className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
                                  disabled={saving}
                                />
                                <Input
                                  value={editEntry.fruit}
                                  onChange={(e) => setEditEntry(prev => ({ ...prev, fruit: e.target.value }))}
                                  placeholder="Fruit emoji..."
                                  className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
                                  disabled={saving}
                                />
                              </div>
                              <Input
                                value={editEntry.tags}
                                onChange={(e) => setEditEntry(prev => ({ ...prev, tags: e.target.value }))}
                                placeholder="Tags (comma separated)..."
                                className="rounded-xl border-sage-200 dark:border-gray-600 bg-white/60 dark:bg-gray-700/60"
                                disabled={saving}
                              />
                              <div className="flex justify-end gap-3">
                                <Button
                                  onClick={handleCancelEdit}
                                  variant="outline"
                                  size="sm"
                                  disabled={saving}
                                >
                                  <X className="w-4 h-4 mr-1" />
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => handleSaveEdit(entry.id)}
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
                                      <Save className="w-4 h-4 mr-1" />
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
                                  <h3 className="font-display text-xl text-clay-700 dark:text-sand-200 mb-2">
                                    {entry.title}
                                  </h3>
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
                                      {entry.fruit && <span className="text-lg">{entry.fruit}</span>}
                                      {entry.mood && (
                                        <Badge className={`text-xs border ${getMoodColor(entry.mood)}`}>
                                          {entry.mood}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="mb-4">
                                <p className="text-clay-600 dark:text-sand-300 font-sans leading-relaxed">
                                  {expandedEntries.has(entry.id) ? entry.content : truncateContent(entry.content)}
                                </p>
                                {entry.content.length > 200 && (
                                  <Button
                                    onClick={() => toggleExpanded(entry.id)}
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 text-sage-600 dark:text-sage-400 hover:text-sage-700 dark:hover:text-sage-300 p-0 h-auto font-normal"
                                  >
                                    {expandedEntries.has(entry.id) ? 'Show less' : 'Read more'}
                                  </Button>
                                )}
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="flex flex-wrap gap-2">
                                  {entry.tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      variant="secondary"
                                      className="bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 text-xs"
                                    >
                                      #{tag}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    onClick={() => handlePreviewEntry(entry)}
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
                                  >
                                    <Eye className="w-4 h-4 mr-1" />
                                    Preview
                                  </Button>
                                  <Button 
                                    onClick={() => handleEditEntry(entry)}
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
                                  >
                                    <Edit3 className="w-4 h-4 mr-1" />
                                    Edit
                                  </Button>
                                  <Button 
                                    onClick={() => handleDeleteEntry(entry.id)}
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
                                    disabled={deleting === entry.id}
                                  >
                                    {deleting === entry.id ? (
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4 mr-1" />
                                    )}
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>

              {filteredEntries.length === 0 && searchQuery && (
                <motion.div
                  className="text-center py-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6 }}
                >
                  <BookOpen className="w-12 h-12 text-clay-300 dark:text-sand-600 mx-auto mb-4" />
                  <p className="text-clay-500 dark:text-sand-400 font-sans">
                    No entries found matching "{searchQuery}"
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewEntry && (
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
              <Button
                onClick={handleClosePreview}
                variant="ghost"
                size="sm"
                className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                <div>
                  <h1 className="text-3xl font-display font-medium text-clay-700 dark:text-sand-200 mb-4">
                    {previewEntry.title}
                  </h1>
                  
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex items-center gap-2 text-clay-500 dark:text-sand-400">
                      <Calendar className="w-5 h-5" />
                      <span className="text-lg">
                        {new Date(previewEntry.date).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {previewEntry.fruit && (
                        <span className="text-2xl">{previewEntry.fruit}</span>
                      )}
                      {previewEntry.mood && (
                        <Badge className={`text-sm border ${getMoodColor(previewEntry.mood)}`}>
                          {previewEntry.mood}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="prose prose-lg dark:prose-invert max-w-none">
                  <div className="text-clay-600 dark:text-sand-300 font-sans leading-relaxed text-lg whitespace-pre-wrap">
                    {previewEntry.content}
                  </div>
                </div>

                {previewEntry.tags.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-lg font-display font-medium text-clay-700 dark:text-sand-200 mb-3">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {previewEntry.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="bg-sage-100 dark:bg-gray-800 text-clay-600 dark:text-sand-300 text-sm px-3 py-1"
                        >
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex justify-between items-center text-sm text-clay-500 dark:text-sand-400">
                    <span>
                      Created: {new Date(previewEntry.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                    {previewEntry.updatedAt !== previewEntry.createdAt && (
                      <span>
                        Last updated: {new Date(previewEntry.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
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
                  handleClosePreview()
                  handleEditEntry(previewEntry)
                }}
                className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Entry
              </Button>
              <Button
                onClick={handleClosePreview}
                variant="outline"
              >
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
