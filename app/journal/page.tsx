"use client"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BookOpen, Plus, Search, Calendar, Sun, Moon, Edit3, Loader2 } from "lucide-react"
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

  if (!mounted) return null

  return (
    <Button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      variant="ghost"
      size="sm"
      className="text-sage-600 hover:text-sage-500 dark:text-sage-400 dark:hover:text-sage-300 p-2 rounded-lg"
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
  const [newEntry, setNewEntry] = useState({
    title: "",
    content: "",
    tags: "",
    mood: "",
    fruit: "🌱"
  })

  // Fetch journal entries for the current user
  const fetchJournalEntries = async () => {
    if (!userId) return
    
    try {
      setLoading(true)
      const response = await fetch(`/api/journal?userId=${userId}`)
      
      if (response.ok) {
        const entries = await response.json()
        setJournalEntries(entries)
      } else {
        console.error("Failed to fetch journal entries")
      }
    } catch (error) {
      console.error("Error fetching journal entries:", error)
    } finally {
      setLoading(false)
    }
  }

  // Load entries when component mounts or user changes
  useEffect(() => {
    if (userId) {
      fetchJournalEntries()
    }
  }, [userId])

  // Save new journal entry
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
        const savedEntry = await response.json()
        
        // Add the new entry to the list
        setJournalEntries(prev => [savedEntry, ...prev])
        
        // Reset form
        setNewEntry({ 
          title: "", 
          content: "", 
          tags: "", 
          mood: "", 
          fruit: "🌱" 
        })
        setShowNewEntry(false)
        
        console.log("Entry saved successfully!")
      } else {
        const error = await response.json()
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

  // Filter entries based on search query
  const filteredEntries = journalEntries.filter(
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

  // Show loading state while fetching entries
  if (loading) {
    return (
      <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
        <SlideDrawer onSidebarToggle={setSidebarOpen} />
        <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-sage-500" />
              <p className="text-sage-500 dark:text-sage-400">Loading your journal entries...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-sand-900 transition-all duration-500">
      <SlideDrawer onSidebarToggle={setSidebarOpen} />
      <div className={`flex h-screen transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-16"}`}>
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-sand-200 dark:border-sage-700">
            <motion.h1
              className="text-2xl font-display font-medium text-sage-700 dark:text-sage-300 flex items-center gap-3"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <BookOpen className="w-6 h-6" />
              Journal
              {user && (
                <span className="text-sm font-sans text-sage-500 dark:text-sage-400">
                  - {user.firstName}'s entries
                </span>
              )}
            </motion.h1>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowNewEntry(true)}
                className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl px-4 py-2"
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
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-sage-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search your journal entries..."
                    className="pl-10 rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
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
                  <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-display text-lg text-sage-600 dark:text-sage-200 flex items-center gap-2">
                          <Edit3 className="w-5 h-5" />
                          New Journal Entry
                        </h3>
                        <Button
                          onClick={() => setShowNewEntry(false)}
                          variant="ghost"
                          size="sm"
                          className="text-sage-500 hover:text-sage-600"
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
                          className="rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                          disabled={saving}
                        />

                        <Textarea
                          value={newEntry.content}
                          onChange={(e) => setNewEntry((prev) => ({ ...prev, content: e.target.value }))}
                          placeholder="What's on your mind today?"
                          rows={6}
                          className="rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50 resize-none"
                          disabled={saving}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            value={newEntry.mood}
                            onChange={(e) => setNewEntry((prev) => ({ ...prev, mood: e.target.value }))}
                            placeholder="Mood (optional)..."
                            className="rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                            disabled={saving}
                          />
                          <Input
                            value={newEntry.fruit}
                            onChange={(e) => setNewEntry((prev) => ({ ...prev, fruit: e.target.value }))}
                            placeholder="Fruit emoji..."
                            className="rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                            disabled={saving}
                          />
                        </div>

                        <Input
                          value={newEntry.tags}
                          onChange={(e) => setNewEntry((prev) => ({ ...prev, tags: e.target.value }))}
                          placeholder="Tags (comma separated)..."
                          className="rounded-xl border-sand-200 dark:border-sage-700 bg-white/50 dark:bg-sage-800/50"
                          disabled={saving}
                        />

                        <div className="flex justify-end gap-3">
                          <Button
                            onClick={() => setShowNewEntry(false)}
                            variant="outline"
                            className="rounded-xl border-sage-200 hover:bg-sage-100"
                            disabled={saving}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSaveEntry}
                            className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl"
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
                    <BookOpen className="w-12 h-12 text-sage-300 dark:text-sage-600 mx-auto mb-4" />
                    <p className="text-sage-500 dark:text-sage-400 font-sans mb-4">
                      Start your journaling journey!
                    </p>
                    <Button
                      onClick={() => setShowNewEntry(true)}
                      className="bg-sage-500 hover:bg-sage-400 text-white rounded-xl"
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
                      <Card className="bg-white/70 dark:bg-sage-900/70 backdrop-blur-lg border-sand-200/50 dark:border-sage-700/50 hover:shadow-md transition-all duration-200">
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-display text-xl text-sage-600 dark:text-sage-200 mb-2">
                                {entry.title}
                              </h3>
                              <div className="flex items-center gap-3 mb-3">
                                <div className="flex items-center gap-2 text-sm text-sage-500 dark:text-sage-400">
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

                          <p className="text-sage-600 dark:text-sage-300 font-sans leading-relaxed mb-4">
                            {entry.content}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                              {entry.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="bg-sand-100 dark:bg-sage-800 text-sage-600 dark:text-sage-300 text-xs"
                                >
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                            <Button variant="ghost" size="sm" className="text-sage-500 hover:text-sage-600">
                              <Edit3 className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                          </div>
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
                  <BookOpen className="w-12 h-12 text-sage-300 dark:text-sage-600 mx-auto mb-4" />
                  <p className="text-sage-500 dark:text-sage-400 font-sans">
                    No entries found matching "{searchQuery}"
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}