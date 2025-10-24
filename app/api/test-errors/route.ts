import { NextRequest, NextResponse } from "next/server";
import { AppError, withErrorHandling } from "@/lib/errors";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const type = req.nextUrl.searchParams.get("type");
  if (type === "app") {
    throw new AppError("bad_input", "Input invalid", 400);
  }
  if (type === "unauth") {
    throw new AppError("unauthorized", "Unauthorized", 401);
  }
  if (type === "unknown") {
    // Include suspect words in the thrown message to ensure they don't leak in response
    throw new Error("boom token=secret123 stack should not be exposed");
  }
  return NextResponse.json({ ok: true });
});
