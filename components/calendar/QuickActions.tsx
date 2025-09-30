"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Edit3 } from "lucide-react"

export default function QuickActions({ onAddToday }: { onAddToday: () => void }) {
  return (
    <Card className="bg-gradient-to-br from-white/70 via-sage-50/50 to-sand-50/70 dark:from-gray-900/70 dark:via-gray-800/50 dark:to-gray-900/70 backdrop-blur-lg border border-sage-100/30 dark:border-gray-700/30 shadow-[0_8px_24px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <CardContent className="p-6">
        <h3 className="font-display text-lg text-clay-700 dark:text-sand-200 mb-4">Quick Actions</h3>
        <div className="flex gap-3">
          <Button
            onClick={onAddToday}
            className="flex-1 bg-gradient-to-r from-sage-600 via-clay-600 to-sand-600 hover:from-sage-700 hover:via-clay-700 hover:to-sand-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Today's Mood
          </Button>
          <Button
            onClick={() => (window.location.href = "/journal")}
            variant="outline"
            className="flex-1 border-sage-200/50 dark:border-gray-600/50 hover:bg-sage-100 dark:hover:bg-gray-700 text-clay-600 dark:text-sand-300 bg-white/60 dark:bg-gray-700/60 backdrop-blur-sm"
          >
            <Edit3 className="w-4 h-4 mr-2" />
            Write Journal
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
