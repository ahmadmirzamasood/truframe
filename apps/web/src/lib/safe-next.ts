/** Only same-site relative paths are allowed as post-sign-in destinations (no open redirect). */
export function safeNext(value: string | string[] | undefined, fallback = "/dashboard"): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v?.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  return v;
}
