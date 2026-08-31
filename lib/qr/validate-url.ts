export function validateTargetUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Ugyldig URL-adresse.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Kun https://-adresser er tillatt.");
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "eirnat.no" || host.endsWith(".eirnat.no")) {
    if (parsed.pathname.startsWith("/r/")) {
      throw new Error("Måladresse kan ikke peke til redirect-endepunktet på eirnat.no.");
    }
  }

  return parsed.toString();
}
