export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function hasInsecureProdBypass(): boolean {
  return isProductionRuntime() && process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true";
}

export function isE2EBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "true" && !isProductionRuntime();
}
