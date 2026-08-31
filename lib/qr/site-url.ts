export function getSiteUrl(): string {
  return process.env.SITE_URL ?? "https://eirnat.no";
}

export function getRedirectUrl(slug: string): string {
  return `${getSiteUrl()}/r/${slug}`;
}
