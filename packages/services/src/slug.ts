export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug.length > 0 ? slug : "org";
}

export function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slugify(base)}-${suffix}`;
}
