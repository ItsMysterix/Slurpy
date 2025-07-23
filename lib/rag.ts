// lib/rag.ts
type RagResponse = {
  success: boolean;
  session_id: string;
  message: string;
  emotion: string;
  fruit: string;
};

export async function askRag(
  text: string,
  sessionId: string | undefined,
  clerkJwt: string,
): Promise<RagResponse> {
  const payload: Record<string, unknown> = { text };
  if (sessionId) payload.session_id = sessionId;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${clerkJwt}`,
  };

  // Optional internal key
  const apiKey = process.env.NEXT_PUBLIC_SLURPY_API_KEY;
  if (apiKey) headers["X-API-KEY"] = apiKey;

  const url = process.env.NEXT_PUBLIC_RAG_API ?? "http://127.0.0.1:8000/chat";

  console.log("[rag] POST →", url, payload);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  let maybeJson: any = null;
  try {
    maybeJson = await res.clone().json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(
      `[rag] backend error ${res.status}: ${
        maybeJson ? JSON.stringify(maybeJson) : "<<non‑JSON body>>"
      }`,
    );
  }

  return maybeJson as RagResponse;
}
