import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// GET /api/journal - Fetch user's journal entries
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get userId from query params for additional validation
    const url = new URL(req.url)
    const requestedUserId = url.searchParams.get("userId")
    
    // Ensure user can only access their own entries
    if (requestedUserId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch entries from Supabase
    const userEntries = await prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(userEntries)
    
  } catch (error) {
    console.error("Error fetching journal entries:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// POST /api/journal - Create new journal entry
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { title, content, mood, fruit, tags } = body

    // Validation
    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" }, 
        { status: 400 }
      )
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: "Title must be less than 200 characters" }, 
        { status: 400 }
      )
    }

    if (content.length > 10000) {
      return NextResponse.json(
        { error: "Content must be less than 10,000 characters" }, 
        { status: 400 }
      )
    }

    // Create new journal entry in Supabase
    const newEntry = await prisma.journalEntry.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
        mood: mood?.trim() || undefined,
        fruit: fruit || "🌱",
        tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
        userId
      }
    })

    console.log(`New journal entry created for user ${userId}:`, newEntry.title)

    return NextResponse.json(newEntry, { status: 201 })
    
  } catch (error) {
    console.error("Error creating journal entry:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// PUT /api/journal - Update journal entry
export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { id, title, content, mood, fruit, tags } = body

    if (!id) {
      return NextResponse.json(
        { error: "Entry ID is required" }, 
        { status: 400 }
      )
    }

    // Check if entry exists and belongs to user
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, userId }
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Entry not found or access denied" }, 
        { status: 404 }
      )
    }

    // Update entry
    const updatedEntry = await prisma.journalEntry.update({
      where: { id },
      data: {
        title: title.trim(),
        content: content.trim(),
        mood: mood?.trim() || undefined,
        fruit: fruit || "🌱",
        tags: Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
        updatedAt: new Date()
      }
    })

    return NextResponse.json(updatedEntry)
    
  } catch (error) {
    console.error("Error updating journal entry:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}

// DELETE /api/journal - Delete journal entry
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { error: "Entry ID is required" }, 
        { status: 400 }
      )
    }

    // Check if entry exists and belongs to user
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, userId }
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: "Entry not found or access denied" }, 
        { status: 404 }
      )
    }

    // Delete entry
    await prisma.journalEntry.delete({
      where: { id }
    })

    return NextResponse.json({ message: "Entry deleted successfully" })
    
  } catch (error) {
    console.error("Error deleting journal entry:", error)
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    )
  }
}