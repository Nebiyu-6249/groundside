// The app's public base URL. Render sets RENDER_EXTERNAL_URL on every web service, so the
// hosted demo needs no APP_BASE_URL of its own.

export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.APP_BASE_URL || env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}
