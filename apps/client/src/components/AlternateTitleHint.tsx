import type { AlternateTitle } from "@ps2-challenge/shared";

export const EMPTY_ALTERNATE_TITLES: AlternateTitle[] = [];

export function AlternateTitleHint({ title, alternateTitles }: Readonly<{ title: string; alternateTitles: AlternateTitle[] }>) {
  if (!alternateTitles.length) {
    return <>{title}</>;
  }

  const titles = alternateTitles.map((alternateTitle) => alternateTitle.title).join("\n");
  return (
    <span className="alternate-title-hint" title={titles} aria-label={`${title}. Alternate titles: ${titles.replaceAll("\n", ", ")}`}>
      {title}
    </span>
  );
}
