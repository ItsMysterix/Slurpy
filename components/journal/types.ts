export interface JournalEntry {
  id: string;
  title: string;
  content: string;
  date: string;
  mood?: string;
  fruit?: string;
  tags: string[];
  userId: string;
  createdAt: string;
  updatedAt: string;
}
