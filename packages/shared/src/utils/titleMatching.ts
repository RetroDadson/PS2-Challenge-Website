export function normalizeTitle(title: string | null | undefined): string {
  if (!title?.trim()) {
    return "";
  }

  return title
    .toLocaleLowerCase("en-GB")
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left?.trim() || !right?.trim()) {
    return false;
  }

  if (left.trim().localeCompare(right.trim(), "en-GB", { sensitivity: "accent" }) === 0) {
    return true;
  }

  return normalizeTitle(left) === normalizeTitle(right);
}

export function titleContains(title: string | null | undefined, searchTerm: string | null | undefined): boolean {
  if (!title) {
    return false;
  }

  if (!searchTerm?.trim()) {
    return true;
  }

  return title.toLocaleLowerCase("en-GB").includes(searchTerm.toLocaleLowerCase("en-GB"));
}
