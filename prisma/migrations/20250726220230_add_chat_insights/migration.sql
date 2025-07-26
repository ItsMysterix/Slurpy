-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emotion" TEXT,
    "intensity" DOUBLE PRECISION,
    "topics" TEXT[],

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_analysis" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dominantEmotion" TEXT NOT NULL,
    "emotionIntensity" DOUBLE PRECISION NOT NULL,
    "emotionBreakdown" JSONB NOT NULL,
    "topics" TEXT[],
    "insights" TEXT[],
    "moodScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_sessionId_key" ON "chat_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "chat_sessions_startTime_idx" ON "chat_sessions"("startTime");

-- CreateIndex
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_timestamp_idx" ON "chat_messages"("timestamp");

-- CreateIndex
CREATE INDEX "chat_messages_emotion_idx" ON "chat_messages"("emotion");

-- CreateIndex
CREATE UNIQUE INDEX "session_analysis_sessionId_key" ON "session_analysis"("sessionId");

-- CreateIndex
CREATE INDEX "session_analysis_userId_idx" ON "session_analysis"("userId");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_analysis" ADD CONSTRAINT "session_analysis_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
