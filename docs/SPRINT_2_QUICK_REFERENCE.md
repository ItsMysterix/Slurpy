# Sprint 2: Quick Reference Guide

## What Was Built?

A complete **weekly reflection system** that generates AI-powered summaries of a user's emotional wellbeing based on 7 days of mood, chat, and memory data.

## User Journey

1. User navigates to `/insights` page
2. Sees "Weekly Reflection" card with latest reflection (or prompt to generate one)
3. Clicks "Generate weekly reflection" button
4. System aggregates past 7 days of data
5. OpenAI generates thoughtful, supportive narrative
6. Insight is stored and displayed
7. User can view previous reflections and delete insights

## Key Features

- **7-day rolling window**: Always uses the last 7 days (not calendar-based)
- **AI-generated narrative**: 5-7 sentences, warm tone, non-clinical
- **Mood trend tracking**: Is their mood improving, declining, or stable?
- **Resilience comparison**: vs. their previous insight
- **Memory context**: Pro/Elite users get personalized context from their notes
- **User control**: Can generate, view, and delete reflections
- **Safety first**: No clinical language, no scores, no predictions

## API Reference

### Generate Insight
```bash
POST /api/insights/generate
Authorization: Bearer {token}
Content-Type: application/json

# Body: empty (uses 7-day window)
```

### List Insights
```bash
GET /api/insights/list?limit=10&offset=0
Authorization: Bearer {token}
```

### Delete Insight
```bash
POST /api/insights/delete
Authorization: Bearer {token}
Content-Type: application/json

{
  "insightId": "uuid-of-insight"
}
```

## Database

**New table**: `insight_run`
- Append-only (no updates)
- User-deletable (users only delete their own)
- RLS policies enforce user isolation
- Stores narrative, emotions, themes, trends

```sql
-- Migration file: migrations/20250115_create_insight_run_table.sql
-- Run this to create the table and RLS policies
```

## How Data Flows

```
User clicks "Generate"
    ↓
GET /api/insights/generate
    ↓
Aggregate data:
  - Mood entries from last 7 days
  - All chat sessions from last 7 days
  - Memory context (if pro/elite user)
    ↓
Calculate:
  - Emotion frequencies
  - Topic frequencies
  - Mood trend (rising/declining/stable)
  - Resilience delta (improving/stable/strained)
    ↓
Call OpenAI to generate narrative
    ↓
Store InsightRun record
    ↓
Display to user
```

## For Developers

### Finding Code

- **Types**: `types/index.ts` - InsightRun, AggregatedInsightData
- **Aggregation**: `lib/insight-aggregation.ts` - Data fetching & processing
- **Narrative**: `lib/insight-narrative.ts` - OpenAI integration
- **API**: `app/api/insights/{generate|list|delete}/route.ts`
- **UI**: `components/insights/WeeklyReflection.tsx`
- **Page**: `app/insights/ClientPage.tsx` (integrated WeeklyReflection)

### Making Changes

**To modify data sources** (add journal, calendar, etc.):
1. Update `aggregateInsightData()` in `lib/insight-aggregation.ts`
2. Add new fetch functions
3. Update `AggregatedInsightData` type in `types/index.ts`

**To change narrative style**:
1. Edit system prompt in `generateNarrativeSummary()` in `lib/insight-narrative.ts`
2. Adjust max_tokens if needed (currently 300)

**To add new metrics**:
1. Update `InsightRun` table schema (add column)
2. Update `InsightRun` type
3. Calculate metric in aggregation
4. Include in API responses & UI

**To customize trends**:
1. Modify `calculateMoodTrend()` logic
2. Adjust `calculateResilienceDelta()` heuristic
3. Update UI to display new trends

### Testing

#### Manual Test Data
```typescript
// Create test mood entries
const moodData = [
  { emotion: 'joy', intensity: 0.8, date: 'today' },
  { emotion: 'calm', intensity: 0.6, date: 'yesterday' },
  // ... etc
];

// Create test chat sessions
const chatData = [
  { dominantEmotion: 'happy', topics: ['work', 'family'] },
  // ... etc
];
```

#### Test Coverage
- Free user (no memory access)
- Pro user (memory access)
- First insight (no previous for resilience delta)
- Second insight (has previous for comparison)
- Minimal data (1-2 entries)
- Zero data (should error gracefully)
- Duplicate generation (should error)

### Common Tasks

**Debug aggregation**:
```typescript
// In insight-aggregation.ts, add logging
console.log('[aggregateInsightData] moodEntries:', moodEntries.length);
console.log('[aggregateInsightData] sessions:', sessions.length);
console.log('[aggregateInsightData] emotionFreq:', emotionFrequency);
```

**Check what OpenAI is receiving**:
```typescript
// In insight-narrative.ts, log the prompt
console.log('[generateNarrativeSummary] userPrompt:', userPrompt);
```

**Verify RLS policies**:
```sql
-- Query to test RLS
SELECT * FROM insight_run 
WHERE user_id = auth.uid(); -- Should only show own insights
```

## Deployment

1. Run migration: `migrations/20250115_create_insight_run_table.sql`
2. Set env var: `OPENAI_API_KEY`
3. Deploy code
4. Test: Click "Generate weekly reflection"
5. Monitor: Check error logs for aggregation failures

## Notes for Product Team

- ✅ No schema changes to existing tables
- ✅ Backward compatible (can deploy safely)
- ✅ Uses existing data sources (mood, chat)
- ✅ Pro feature control via `plan_id` (memory context)
- ✅ User has full control (generate, view, delete)
- ⚠️ OpenAI API cost: Monitor usage monthly
- ⚠️ Narrative tone: Validate with users in beta

## Known Limitations & Future Work

**Current**:
- Topic extraction is simple keyword matching (no NLP)
- Memory context is just concatenated summaries
- No scheduled/automatic generation (manual trigger only)
- No email delivery

**Planned**:
- Advanced NLP for better topics
- Trend visualization (multiple insights comparison)
- Scheduled weekly generation
- Email digest delivery
- User-customizable narrative style
- Journal entry integration

## Questions?

See [docs/SPRINT_2_SUMMARY.md](SPRINT_2_SUMMARY.md) for full technical documentation.
