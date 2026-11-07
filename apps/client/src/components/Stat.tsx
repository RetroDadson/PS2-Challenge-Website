import type { LucideIcon } from "lucide-react";

export function Stat({
  icon: Icon,
  label,
  progress,
  tone,
  value
}: Readonly<{
  icon: LucideIcon;
  label: string;
  progress?: number;
  tone: string;
  value: string | number;
}>) {
  return (
    <article className={`stat stat-${tone}`}>
      <div className="stat-icon" aria-hidden="true"><Icon /></div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <strong className="stat-value" data-testid="stat-value">{value}</strong>
        {progress === undefined ? null : (
          <div className="progress-bar-container" aria-hidden>
            <div className="progress-bar" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}
