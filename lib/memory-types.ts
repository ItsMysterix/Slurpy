// lib/memory-types.ts

export interface UserMemory {
  id: string;
  userId: string;
  summary: string;
  sourceType: "chat" | "journal";
  sourceId: string;
  sourceDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryRequest {
  summary: string;
  sourceType: "chat" | "journal";
  sourceId: string;
  sourceDate?: string;
}

export interface MemoryListResponse {
  memories: UserMemory[];
  total: number;
}

export interface MemoryResponse {
  success: boolean;
  message?: string;
  memory?: UserMemory;
}
