"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Heart, BookOpen, MessageCircle } from "lucide-react"

export default function LegendCard() {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">Activity Legend</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sage-400 to-clay-500 flex items-center justify-center">
              <Heart className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Mood tracked</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-clay-400 to-sand-500 flex items-center justify-center">
              <BookOpen className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Journal entries</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-sand-400 to-sage-500 flex items-center justify-center">
              <MessageCircle className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm text-clay-600 dark:text-sand-300 font-sans">Chat sessions</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-sage-200/50 dark:border-gray-700/50">
          <p className="text-xs text-clay-500 dark:text-sand-400">Click on any day to view details and add activities</p>
        </div>
      </CardContent>
    </Card>
  )
}
