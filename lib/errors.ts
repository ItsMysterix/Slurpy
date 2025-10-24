import { NextResponse } from "next/server";

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

// Lightweight capture bridge. We avoid importing Sentry on every edge path to keep size small.
// sentry.server/client.config will set up global capturing; here we call a global if present.
function captureException(err: unknown) {
  try {
    // @ts-ignore
    const S = (global as any)?.__SENTRY__?.captureException || (global as any)?.Sentry?.captureException;
    if (typeof S === "function") S(err);
  } catch {}
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    const body = { error: err.code, message: err.message };
    return NextResponse.json(body, { status: err.status });
  }
  // Known auth mapping: treat Unauthorized as 401 if provided as shape
  // You can throw new AppError("unauthorized", "Unauthorized", 401) to hit the branch above.
  // Any other error => generic internal_error without stack
  captureException(err);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

// Helper wrapper to unify error handling in routes
export function withErrorHandling<Args extends any[], Ret>(
  handler: (...args: Args) => Promise<Ret>
) {
  return async (...args: Args): Promise<any> => {
    try {
      return await handler(...args);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}
