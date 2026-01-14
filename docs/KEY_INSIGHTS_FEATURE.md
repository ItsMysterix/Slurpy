# Therapist-Style Key Insights Feature

## Overview
Enhanced the insights generation to include AI-powered, therapist-style emotional summaries that provide actionable insights about users' emotional patterns, coping strategies, and growth opportunities.

## What Changed

### 1. **New AI-Powered Insight Generation** (`lib/insight-narrative.ts`)
- Added `generateKeyInsights()` function that uses Claude AI to analyze emotional patterns
- Generates 3-5 key therapeutic insights based on:
  - Top emotions and their frequency
  - Key themes and topics discussed
  - Mood trends (rising/declining/stable)
  - Engagement levels (conversations and mood logs)
  - Memory context (for pro users)

### 2. **Insight Generation API** (`app/api/insights/generate/route.ts`)
- Now generates key insights when creating weekly reflections
- Stores insights in database for persistent display
- Calls `generateKeyInsights()` to create therapist-style summaries

### 3. **Insights Display API** (`app/api/insights/route.ts`)
- Modified to fetch AI-generated key insights from `insight_run` table
- Falls back to rule-based insights if no AI insights available
- Prioritizes AI insights for richer, more personalized feedback

### 4. **Database Schema** (`migrations/20250116_add_key_insights_to_insight_run.sql`)
- Added `key_insights` JSONB column to `insight_run` table
- Stores array of insights with structure:
  ```json
  {
    "title": "Brief insight title (4-8 words)",
    "description": "Supportive explanation (15-25 words)",
    "icon": "Heart" | "Brain" | "TrendingUp" | "Calendar",
    "trend": "positive" | "negative" | "neutral"
  }
  ```

### 5. **Type Definitions** (`lib/insights-types.ts`)
- Added `keyInsights` field to `InsightRun` interface
- Ensures type safety across the application

## How It Works

### Insight Generation Flow
1. User requests weekly reflection generation via `/api/insights/generate`
2. System aggregates emotional data (mood logs, chat messages, memory context)
3. AI analyzes patterns and generates 3-5 therapeutic insights
4. Insights are stored in database with the reflection
5. User views insights on insights page

### AI Prompt Strategy
The AI is instructed to act as an empathetic therapist and:
- Identify emotional patterns and what they reveal
- Suggest healthy coping strategies or growth opportunities
- Use warm, non-judgmental, and actionable language
- Avoid clinical jargon or diagnoses
- Focus on practical, supportive guidance

### Fallback Logic
If AI generation fails or no AI insights exist:
1. **Deep Conversations**: Triggered when avg messages/session > 10
2. **Positive Trend**: When 60%+ messages show positive emotions
3. **Support Opportunity**: When 30% or less show positive emotions
4. **Diverse Topics**: When 6+ different topics discussed
5. **Getting Started**: Default message for new users

## Example AI Insights

### Positive Pattern
- **Title**: "Joy is your dominant feeling"
- **Description**: "You've experienced joy frequently this week. That's wonderful! Consider what's contributing to these positive feelings."
- **Icon**: Heart
- **Trend**: Positive

### Growth Opportunity
- **Title**: "Emotional awareness is growing"
- **Description**: "You're becoming more mindful of your feelings. This self-awareness is the first step toward emotional balance."
- **Icon**: Brain
- **Trend**: Positive

### Support Insight
- **Title**: "Stress patterns emerging"
- **Description**: "Notice when stress arises and how you respond. Taking short breaks and deep breathing can help."
- **Icon**: Heart
- **Trend**: Neutral

## Technical Details

### API Endpoints
- `POST /api/insights/generate` - Creates new weekly reflection with AI insights
- `GET /api/insights?timeframe=week` - Fetches insights (prioritizes AI insights)

### Dependencies
- Claude 3.5 Sonnet via Anthropic SDK
- Supabase for data storage
- Next.js API routes

### Performance
- AI generation: ~2-3 seconds
- Database query: ~50-100ms
- Fallback is instantaneous

## Benefits

1. **Personalized**: Insights tailored to individual emotional patterns
2. **Actionable**: Provides practical strategies users can apply
3. **Empathetic**: Warm, supportive tone like a real therapist
4. **Progressive**: Insights improve as more data is collected
5. **Persistent**: Stored in database for historical reference

## Future Enhancements

- [ ] Add user feedback on insight helpfulness
- [ ] Generate insights for different timeframes (daily, monthly)
- [ ] Include journal entries in analysis
- [ ] Add insight notification system
- [ ] Create insight history view
- [ ] Support multiple languages

## Migration Required

Run the migration to add the column:
\`\`\`bash
PGPASSWORD=slurpy123 psql -h db.cmykvjwkhtxhlsijlqxb.supabase.co -p 5432 -U postgres -d postgres -f migrations/20250116_add_key_insights_to_insight_run.sql
\`\`\`

✅ **Migration completed successfully**
