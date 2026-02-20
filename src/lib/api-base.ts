export function getApiBaseUrl(): string {
  // Default to '' (empty string) so callers use relative URLs via Next.js route
  // handlers at /api/v1/... when NEXT_PUBLIC_API_URL is not set.
  return (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
}
