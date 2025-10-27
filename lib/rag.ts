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
  authJwt: string,
  tenantId?: string,
): Promise<RagResponse> {
  // Use BACKEND_URL for server-side calls from Next.js API routes
  // This is set via Fly.io environment variables
  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  
  // Backend expects query params, not JSON body for /rag/rag/chat endpoint
  const params = new URLSearchParams({
    msg: text,
    mode: "default",
  });
  if (sessionId) params.append("session_id", sessionId);
  
  const url = `${backendUrl}/rag/rag/chat?${params.toString()}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authJwt}`,
  };

  // Optional internal key
  const apiKey = process.env.NEXT_PUBLIC_SLURPY_API_KEY;
  if (apiKey) headers["X-API-KEY"] = apiKey;

  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  console.log("[rag] GET →", url, { tenant_id: tenantId ? "<set>" : undefined });

  const res = await fetch(url, {
    method: "GET",
    headers,
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

  // Map backend response format to our expected format
  return {
    success: maybeJson?.reply ? true : false,
    session_id: sessionId || "",
    message: maybeJson?.reply || maybeJson?.message || "",
    emotion: maybeJson?.emotion || "neutral",
    fruit: maybeJson?.fruit || "",
  };
}
