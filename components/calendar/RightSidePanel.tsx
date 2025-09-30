// components/calendar/RightSidePanel.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BookOpen, Edit3, MessageCircle, Heart, X, Calendar as CalendarIcon, MapPin, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { iconForEmotion } from "@/lib/insights-types";

type DailyMoodData = {
  emotion: string;
  intensity: number;
  fruit?: string;   // kept for back-compat, not required now that we map by emotion
  notes?: string | null;
}

type ChatSession = {
  id: string;
  duration: string;
  messagesCount: number;
  dominantEmotion: string;
  timestamp: string;
}

type JournalEntry = {
  id: string;
  title?: string;
  mood?: string;
  tags: string[];
  preview: string;
}

type CalendarData = {
  mood?: DailyMoodData;
  journals?: JournalEntry[];
  chatSessions?: ChatSession[];
  events?: Array<{
    id: string;
    title: string;
    location?: string;
    emotion?: string;
    intensity?: number;
    notes?: string | null;
  }>;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  dayData: CalendarData | null;
  onDataUpdate: () => void;
};

const EMOTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "happy", label: "Happy" },
  { value: "joy", label: "Joyful" },
  { value: "excited", label: "Excited" },
  { value: "content", label: "Content" },
  { value: "calm", label: "Calm" },
  { value: "peaceful", label: "Peaceful" },
  { value: "relaxed", label: "Relaxed" },
  { value: "neutral", label: "Neutral" },
  { value: "okay", label: "Okay" },
  { value: "tired", label: "Tired" },
  { value: "stressed", label: "Stressed" },
  { value: "anxious", label: "Anxious" },
  { value: "worried", label: "Worried" },
  { value: "sad", label: "Sad" },
  { value: "frustrated", label: "Frustrated" },
  { value: "angry", label: "Angry" },
];

export default function RightSidePanel({
  isOpen,
  onClose,
  selectedDate,
  dayData,
  onDataUpdate,
}: Props) {
  const [activeTab, setActiveTab] = useState<"mood" | "journal" | "chat" | "events">("mood");
  const [isLoading, setIsLoading] = useState(false);

  // ---------- Mood form ----------
  const [emotion, setEmotion] = useState(dayData?.mood?.emotion || "");
  const [intensity, setIntensity] = useState((dayData?.mood?.intensity ?? 5).toString());
  const [notes, setNotes] = useState(dayData?.mood?.notes || "");

  // ---------- Events form ----------
  const [eventTitle, setEventTitle] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventEmotion, setEventEmotion] = useState("");
  const [eventIntensity, setEventIntensity] = useState("5");
  const [eventNotes, setEventNotes] = useState("");
  const [showCheckupPrompt, setShowCheckupPrompt] = useState(false);

  // sync when selected day changes
  useEffect(() => {
    if (dayData?.mood) {
      setEmotion(dayData.mood.emotion);
      setIntensity(String(dayData.mood.intensity ?? 5));
      setNotes(dayData.mood.notes || "");
    } else {
      setEmotion("");
      setIntensity("5");
      setNotes("");
    }
    // reset events form on day change
    setEventTitle("");
    setEventLocation("");
    setEventEmotion("");
    setEventIntensity("5");
    setEventNotes("");
    setShowCheckupPrompt(false);
  }, [dayData]);

  const selectedEmotionIcon = useMemo(() => iconForEmotion(emotion), [emotion]);
  const selectedEventEmotionIcon = useMemo(() => iconForEmotion(eventEmotion), [eventEmotion]);

  const handleSaveMood = async () => {
    if (!selectedDate || !emotion || !intensity) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate.toISOString(),
          emotion,
          intensity: parseInt(intensity, 10),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save mood");
      toast.success("Mood saved");
      onDataUpdate();
    } catch (e) {
      toast.error("Failed to save mood");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMood = async () => {
    if (!selectedDate) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/calendar?date=${selectedDate.toISOString()}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete mood");
      toast.success("Mood deleted");
      onDataUpdate();
      setEmotion("");
      setIntensity("5");
      setNotes("");
    } catch (e) {
      toast.error("Failed to delete mood");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveEvent = async () => {
    if (!selectedDate || !eventTitle.trim()) {
      toast.error("Please add a title");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate.toISOString(),
          title: eventTitle.trim(),
          location: eventLocation.trim() || null,
          emotion: eventEmotion || null,
          intensity: eventEmotion ? parseInt(eventIntensity, 10) : null,
          notes: eventNotes.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save event");
      toast.success("Event saved");
      // clear form
      setEventTitle("");
      setEventLocation("");
      setEventEmotion("");
      setEventIntensity("5");
      setEventNotes("");
      onDataUpdate();

      // ✅ Show gentle prompt: “I’ll keep checking up on you.”
      setShowCheckupPrompt(true);
      window.setTimeout(() => setShowCheckupPrompt(false), 5000);
    } catch (e) {
      toast.error("Failed to save event");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !selectedDate) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="calendar-right-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed right-0 top-0 h-full w-96 bg-gradient-to-br from-white/95 via-sage-50/90 to-sand-50/95 dark:from-gray-900/95 dark:via-gray-800/90 dark:to-gray-900/95 backdrop-blur-xl border-l border-sage-100/50 dark:border-gray-700/50 shadow-2xl z-50"
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-sage-100/50 dark:border-gray-700/50">
            <div>
              <h3 className="font-display text-lg text-clay-700 dark:text-sand-200">
                {selectedDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
              <p className="text-sm text-clay-500 dark:text-sand-400">{selectedDate.getFullYear()}</p>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
              className="text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* ✅ Check-up prompt after saving an event */}
          <AnimatePresence>
            {showCheckupPrompt && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mx-4 mt-3 rounded-xl border border-sage-200/60 dark:border-gray-700/60 bg-white/70 dark:bg-gray-800/70 backdrop-blur p-3 text-sm text-clay-700 dark:text-sand-200"
              >
                <em>I’ll keep checking up on you.</em>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tabs */}
          <div className="mt-2 flex border-b border-sage-100/50 dark:border-gray-700/50">
            {([
              { id: "mood", label: "Mood", Icon: Heart },
              { id: "journal", label: "Journal", Icon: BookOpen },
              { id: "chat", label: "Chat", Icon: MessageCircle },
              { id: "events", label: "Events", Icon: CalendarIcon },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                  activeTab === t.id
                    ? "text-clay-700 dark:text-sand-200 border-b-2 border-sage-500"
                    : "text-clay-500 dark:text-sand-400 hover:text-clay-600 dark:hover:text-sand-300"
                }`}
              >
                <t.Icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Mood tab */}
            {activeTab === "mood" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">How are you feeling?</Label>
                  <Select value={emotion} onValueChange={setEmotion}>
                    <SelectTrigger className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm">
                      <SelectValue placeholder="Select your mood">
                        {emotion && (
                          <span className="flex items-center gap-2">
                            <span className="relative inline-block w-5 h-5">
                              <Image
                                src={selectedEmotionIcon}
                                alt={emotion}
                                fill
                                sizes="20px"
                                className="rounded"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/Slurpy.ico";
                                }}
                              />
                            </span>
                            <span className="capitalize">{emotion}</span>
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {EMOTION_OPTIONS.map((emo) => (
                        <SelectItem key={emo.value} value={emo.value}>
                          <span className="flex items-center gap-2">
                            <span className="relative inline-block w-4 h-4">
                              <Image
                                src={iconForEmotion(emo.value)}
                                alt={emo.label}
                                fill
                                sizes="16px"
                                className="rounded"
                              />
                            </span>
                            <span>{emo.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">Intensity (1–10)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value)}
                    placeholder="5"
                    className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm"
                  />
                </div>

                <div>
                  <Label className="text-clay-600 dark:text-sand-300 text-sm font-medium">Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="How was your day? Any thoughts or reflections..."
                    rows={4}
                    className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSaveMood}
                    disabled={isLoading || !emotion}
                    className="flex-1 bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                  >
                    {isLoading ? "Saving..." : dayData?.mood ? "Update Mood" : "Save Mood"}
                  </Button>
                  {dayData?.mood && (
                    <Button
                      variant="outline"
                      onClick={handleDeleteMood}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700"
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Journal tab */}
            {activeTab === "journal" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {dayData?.journals?.length ? (
                  <>
                    <h4 className="font-medium text-clay-700 dark:text-sand-200">Journal Entries</h4>
                    <div className="space-y-3">
                      {dayData.journals.map((j) => (
                        <Card
                          key={j.id}
                          className="bg-white/50 dark:bg-gray-800/50 border-sage-200/50 dark:border-gray-600/50"
                        >
                          <CardContent className="p-3">
                            <h5 className="font-medium text-clay-700 dark:text-sand-200 text-sm mb-1">
                              {j.title || "Untitled Entry"}
                            </h5>
                            <p className="text-xs text-clay-600 dark:text-sand-300 mb-2">{j.preview}</p>
                            <div className="flex flex-wrap gap-1">
                              {j.tags.map((tag) => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  #{tag}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <BookOpen className="w-8 h-8 text-clay-300 dark:text-sand-600 mx-auto mb-2" />
                    <p className="text-sm text-clay-500 dark:text-sand-400 mb-3">No journal entries for this day</p>
                    <Button
                      onClick={() => (window.location.href = "/journal")}
                      size="sm"
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Write Entry
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Chat tab */}
            {activeTab === "chat" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {dayData?.chatSessions?.length ? (
                  <>
                    <h4 className="font-medium text-clay-700 dark:text-sand-200">Chat Sessions</h4>
                    <div className="space-y-3">
                      {dayData.chatSessions.map((s) => (
                        <Card
                          key={s.id}
                          className="bg-white/50 dark:bg-gray-800/50 border-sage-200/50 dark:border-gray-600/50"
                        >
                          <CardContent className="p-3">
                            <div className="flex justify-between items-start mb-2">
                              <h5 className="font-medium text-clay-700 dark:text-sand-200 text-sm">Chat Session</h5>
                              <span className="text-xs text-clay-500 dark:text-sand-400">{s.duration}</span>
                            </div>
                            <div className="flex justify-between text-xs text-clay-600 dark:text-sand-300">
                              <span>{s.messagesCount} messages</span>
                              <span className="capitalize flex items-center gap-1">
                                <span className="relative inline-block w-4 h-4">
                                  <Image
                                    src={iconForEmotion(s.dominantEmotion)}
                                    alt={s.dominantEmotion}
                                    fill
                                    sizes="16px"
                                    className="rounded"
                                  />
                                </span>
                                {s.dominantEmotion}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <MessageCircle className="w-8 h-8 text-clay-300 dark:text-sand-600 mx-auto mb-2" />
                    <p className="text-sm text-clay-500 dark:text-sand-400 mb-3">No chat sessions for this day</p>
                    <Button
                      onClick={() => (window.location.href = "/chat")}
                      size="sm"
                      className="bg-gradient-to-r from-sage-500 via-clay-500 to-sand-500 hover:from-sage-600 hover:via-clay-600 hover:to-sand-600 text-white"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Start Chat
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ✅ Events tab */}
            {activeTab === "events" && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <Label className="text-sm text-clay-600 dark:text-sand-300">Event title</Label>
                    <Input
                      value={eventTitle}
                      onChange={(e) => setEventTitle(e.target.value)}
                      placeholder="e.g., Coffee with Sam"
                      className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-clay-600 dark:text-sand-300">Location</Label>
                    <div className="mt-2 relative">
                      <Input
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="Add location"
                        className="pl-9 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60"
                      />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-clay-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-clay-600 dark:text-sand-300">How do you feel?</Label>
                      <Select value={eventEmotion} onValueChange={setEventEmotion}>
                        <SelectTrigger className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60">
                          <SelectValue placeholder="Select emotion">
                            {eventEmotion && (
                              <span className="flex items-center gap-2">
                                <span className="relative inline-block w-4 h-4">
                                  <Image
                                    src={selectedEventEmotionIcon}
                                    alt={eventEmotion}
                                    fill
                                    sizes="16px"
                                    className="rounded"
                                  />
                                </span>
                                <span className="capitalize">{eventEmotion}</span>
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {EMOTION_OPTIONS.map((emo) => (
                            <SelectItem key={emo.value} value={emo.value}>
                              <span className="flex items-center gap-2">
                                <span className="relative inline-block w-4 h-4">
                                  <Image
                                    src={iconForEmotion(emo.value)}
                                    alt={emo.label}
                                    fill
                                    sizes="16px"
                                    className="rounded"
                                  />
                                </span>
                                <span>{emo.label}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm text-clay-600 dark:text-sand-300">Intensity (1–10)</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={eventIntensity}
                        onChange={(e) => setEventIntensity(e.target.value)}
                        placeholder="5"
                        className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60"
                        disabled={!eventEmotion}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-clay-600 dark:text-sand-300">Notes (optional)</Label>
                    <Textarea
                      value={eventNotes}
                      onChange={(e) => setEventNotes(e.target.value)}
                      placeholder="Any details or expectations…"
                      rows={3}
                      className="mt-2 rounded-xl border-sage-200/50 dark:border-gray-600/50 bg-white/60 dark:bg-gray-700/60 resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSaveEvent}
                    disabled={isLoading || !eventTitle.trim()}
                    className="flex-1 bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 hover:from-sage-700 hover:via-clay-700 hover:to-sand-700 text-white"
                  >
                    {isLoading ? "Saving…" : "Save Event"}
                  </Button>
                </div>

                {/* Existing events list for that day (if provided) */}
                {!!dayData?.events?.length && (
                  <div className="pt-3">
                    <h4 className="font-medium text-clay-700 dark:text-sand-200 mb-2">Saved events</h4>
                    <div className="space-y-2">
                      {dayData.events.map((ev) => (
                        <Card
                          key={ev.id}
                          className="bg-white/50 dark:bg-gray-800/50 border-sage-200/50 dark:border-gray-600/50"
                        >
                          <CardContent className="p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-clay-500" />
                                <span className="font-medium text-clay-700 dark:text-sand-200">{ev.title}</span>
                              </div>
                              {ev.location && (
                                <span className="flex items-center gap-1 text-xs text-clay-500 dark:text-sand-400">
                                  <MapPin className="w-3 h-3" />
                                  {ev.location}
                                </span>
                              )}
                            </div>
                            {(ev.emotion || ev.notes) && (
                              <div className="mt-2 flex items-center gap-2 text-clay-600 dark:text-sand-300">
                                {ev.emotion && (
                                  <>
                                    <span className="relative inline-block w-4 h-4">
                                      <Image
                                        src={iconForEmotion(ev.emotion)}
                                        alt={ev.emotion}
                                        fill
                                        sizes="16px"
                                        className="rounded"
                                      />
                                    </span>
                                    <span className="capitalize">{ev.emotion}</span>
                                    {typeof ev.intensity === "number" && (
                                      <Badge variant="secondary" className="ml-1">
                                        {ev.intensity}/10
                                      </Badge>
                                    )}
                                  </>
                                )}
                                {ev.notes && <span className="opacity-80">— {ev.notes}</span>}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
