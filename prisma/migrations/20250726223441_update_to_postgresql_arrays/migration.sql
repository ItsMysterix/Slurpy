/*
  Warnings:

  - The `topics` column on the `ChatMessage` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "topics",
ADD COLUMN     "topics" TEXT[];
