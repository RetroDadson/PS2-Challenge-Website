import {
  Archive,
  Boxes,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Hourglass,
  LineChart as LineChartIcon,
  ListTodo,
  PackageOpen,
  Percent,
  PieChart,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameDto, GameProgressDto } from "@ps2-challenge/shared";
import { api } from "../api.js";
import { Empty, ErrorMessage, Loading } from "../components/Status.js";
import { useAsync } from "../hooks.js";

type YearlyStatistic = {
  year: number;
  gamesStarted: number;
  gamesCompleted: number;
  completionPercentage: number;
};

type OwnershipSlice = {
  label: string;
  value: number;
  percent: number;
  color: string;
  path: string;
};

type DurationRow = {
  progressId: number;
  label: string;
  gameTitle: string;
  completionDate: string;
  durationSeconds: number;
  durationHours: number;
};

type DurationPoint = {
  row: DurationRow;
  x: number;
  y: number;
  showLabel: boolean;
};

export function Statistics() {
  const progress = useAsync(() => api.progress(), []);
  const games = useAsync(() => api.games(), []);
  const ownedTypes = useAsync(() => api.ownedTypes(), []);

  const stats = useMemo(
    () => calculateStatistics(games.data ?? [], progress.data ?? [], ownedTypes.data ?? {}),
    [games.data, ownedTypes.data, progress.data]
  );

  if (progress.loading || games.loading || ownedTypes.loading) return <Loading />;
  if (progress.error || games.error || ownedTypes.error) return <ErrorMessage message={progress.error ?? games.error ?? ownedTypes.error ?? ""} />;

  return (
    <section className="page">
      <header className="page-header"><div><p>Insights</p><h1>Challenge Statistics</h1></div></header>

      <section className="panel" aria-labelledby="challenge-status-heading">
        <h2 id="challenge-status-heading">Challenge Status</h2>
        <div className="stats-grid">
          <Stat tone="completed" icon={CheckCircle2} label="Games Completed" value={stats.gamesCompletedCount} />
          <Stat tone="challenge" icon={Gamepad2} label="Games in Challenge" value={stats.gamesInChallengeCount} />
          <Stat tone="remaining-games" icon={ListTodo} label="Games Remaining" value={stats.gamesRemainingCount} />
          <Stat tone="progress" icon={LineChartIcon} label="Challenge Complete" value={`${stats.percentageComplete.toFixed(2)}%`} progress={stats.percentageComplete} />
          <Stat tone="duration" icon={Clock3} label="Average Game Duration" value={formatAverageDuration(stats.averageDurationSeconds)} />
          <Stat tone="remaining-time" icon={Hourglass} label="Estimated Time Remaining" value={formatEstimatedTimeRemaining(stats.estimatedRemainingSeconds)} />
        </div>
        {stats.durationRows.length ? <DurationChart rows={stats.durationRows} /> : <p className="muted">No completed games with duration data yet.</p>}
      </section>

      <section className="panel">
        <h2>Game Completion by Year</h2>
        {stats.yearlyStats.length ? (
          <table>
            <thead><tr><th>Year</th><th>Games Started</th><th>Games Completed</th><th>% of Challenge Completed</th></tr></thead>
            <tbody>
              {stats.yearlyStats.map((year) => (
                <tr key={year.year}>
                  <td><strong>{year.year}</strong></td>
                  <td>{year.gamesStarted}</td>
                  <td>{year.gamesCompleted}</td>
                  <td>{year.completionPercentage.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>{stats.yearlyStats.reduce((sum, year) => sum + year.gamesStarted, 0)}</strong></td>
                <td><strong>{stats.yearlyStats.reduce((sum, year) => sum + year.gamesCompleted, 0)}</strong></td>
                <td><strong>{stats.percentageComplete.toFixed(2)}%</strong></td>
              </tr>
            </tfoot>
          </table>
        ) : <Empty>No progress data available yet.</Empty>}
      </section>

      <section className="panel" aria-labelledby="collection-statistics-heading">
        <h2 id="collection-statistics-heading">Collection Statistics</h2>
        <div className="stats-grid">
          <Stat tone="collection" icon={PackageOpen} label="Games Collected in Challenge" value={stats.gamesCollectedInChallenge} />
          <Stat tone="excluded-collection" icon={Archive} label="Collected but Excluded" value={stats.gamesCollectedButExcluded} />
          <Stat tone="total-owned" icon={Boxes} label="Total Games Owned" value={stats.totalGamesOwned} />
          <Stat tone="collection-rate" icon={Percent} label="Challenge Collection Rate" value={`${stats.collectionPercentageInChallenge.toFixed(2)}%`} progress={stats.collectionPercentageInChallenge} />
          <Stat tone="total-collection-rate" icon={PieChart} label="Total Collection Rate" value={`${stats.collectionPercentageTotal.toFixed(2)}%`} progress={stats.collectionPercentageTotal} />
        </div>
        <div className="collection-visuals">
          <ThermometerCard
            title="Challenge Collection Progress"
            current={stats.gamesCollectedInChallenge}
            total={stats.gamesInChallengeCount}
            percentage={stats.collectionPercentageInChallenge}
          />
          <ThermometerCard
            title="Total Collection Progress"
            current={stats.totalGamesOwned}
            total={games.data?.length ?? 0}
            percentage={stats.collectionPercentageTotal}
          />
        </div>
      </section>

      <section className="panel ownership-breakdown">
        <h2>Ownership Type Distribution</h2>
        {stats.ownershipSlices.length ? (
          <>
            <svg className="pie-chart" viewBox="0 0 200 200" role="img" aria-label="Ownership type breakdown">
              <g transform="translate(100,100)">
                {stats.ownershipSlices.map((slice) => (
                  <path key={slice.label} d={slice.path} fill={slice.color} stroke="#ffffff" strokeWidth="0.6">
                    <title>{slice.label}: {slice.value} ({slice.percent.toFixed(1)}%)</title>
                  </path>
                ))}
                <circle cx="0" cy="0" r="36" fill="var(--surface)" />
              </g>
            </svg>
            <div className="pie-legend">
              {stats.ownershipSlices.map((slice) => (
                <div className="legend-item" key={slice.label}>
                  <span className="legend-swatch" style={{ background: slice.color }} />
                  <span className="legend-label">{slice.label}</span>
                  <span className="legend-value">{slice.value} ({slice.percent.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </>
        ) : <Empty>No ownership data available yet.</Empty>}
      </section>

      <section className="panel">
        <h2>More Statistics Coming Soon</h2>
        <p className="muted">Additional graphs and statistics will be added here in future updates.</p>
      </section>
    </section>
  );
}

function DurationChart({ rows }: Readonly<{ rows: DurationRow[] }>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [activeProgressId, setActiveProgressId] = useState<number | null>(null);
  const chart = buildDurationChart(rows, containerWidth, zoomLevel);
  const chartRenderWidth = zoomLevel <= 1 ? "100%" : `${chart.width}px`;
  const activePoint = chart.points.find((point) => point.row.progressId === activeProgressId);
  const activePointVisibleX = activePoint ? activePoint.x - scrollLeft : 0;
  const tooltipX = activePoint ? Math.max(12, Math.min(activePointVisibleX, containerWidth - 12)) : 0;
  const tooltipOnLeft = activePointVisibleX > containerWidth * 0.7;
  const tooltipBelow = activePoint ? activePoint.y < 132 : false;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateWidth = () => {
      const width = Math.floor(element.clientWidth);
      if (width > 0) {
        setContainerWidth(width);
      }
      setScrollLeft(element.scrollLeft);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      globalThis.addEventListener("resize", updateWidth);
      return () => globalThis.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resetZoom = () => {
    setZoomLevel(1);
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  };

  return (
    <section className="duration-chart-card">
      <header className="chart-heading-row">
        <h3>Game Duration (hours)</h3>
      </header>

      <div className="duration-chart-frame">
        <div className="duration-zoom-controls" aria-label="Duration chart zoom controls">
          <button className="icon-button" type="button" aria-label="Zoom out" title="Zoom out" disabled={zoomLevel <= 1} onClick={() => setZoomLevel((value) => Math.max(1, value - 0.5))}>
            <ZoomOut aria-hidden />
          </button>
          <button className="icon-button" type="button" aria-label="Reset Zoom" title="Reset Zoom" onClick={resetZoom}>
            <RotateCcw aria-hidden />
          </button>
          <button className="icon-button" type="button" aria-label="Zoom in" title="Zoom in" disabled={zoomLevel >= 3} onClick={() => setZoomLevel((value) => Math.min(3, value + 0.5))}>
            <ZoomIn aria-hidden />
          </button>
        </div>
        <div className="duration-chart-scroll" ref={scrollRef} onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
          <div className="duration-chart-plot" style={{ width: chartRenderWidth }}>
            <svg className="duration-line-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Game duration line chart" style={{ height: `${chart.height}px` }}>
              <defs>
                <linearGradient id="duration-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(233, 30, 99, .28)" />
                  <stop offset="100%" stopColor="rgba(233, 30, 99, 0)" />
                </linearGradient>
              </defs>
              {chart.yTicks.map((tick) => {
                const y = chart.yScale(tick);
                return (
                  <g key={tick}>
                    <line className="duration-grid-line" x1={chart.margin.left} x2={chart.width - chart.margin.right} y1={y} y2={y} />
                    <text className="duration-axis-label" x={chart.margin.left - 12} y={y + 4} textAnchor="end">{formatTickHours(tick)}</text>
                  </g>
                );
              })}
              <line className="duration-axis-line" x1={chart.margin.left} x2={chart.margin.left} y1={chart.margin.top} y2={chart.height - chart.margin.bottom} />
              <line className="duration-axis-line" x1={chart.margin.left} x2={chart.width - chart.margin.right} y1={chart.height - chart.margin.bottom} y2={chart.height - chart.margin.bottom} />
              <path className="duration-area" d={chart.areaPath} />
              <polyline className="duration-line" points={chart.linePoints} />
              {chart.points.map((point) => (
                <g key={point.row.progressId}>
                  <line className="duration-point-guide" x1={point.x} x2={point.x} y1={point.y} y2={chart.height - chart.margin.bottom} />
                  <circle
                    aria-label={`${point.row.label} ${point.row.gameTitle} duration ${formatDurationLong(point.row.durationSeconds)} completed ${point.row.completionDate}`}
                    className="duration-point"
                    cx={point.x}
                    cy={point.y}
                    r={activeProgressId === point.row.progressId ? 7 : 5}
                    tabIndex={0}
                    onBlur={() => setActiveProgressId(null)}
                    onFocus={() => setActiveProgressId(point.row.progressId)}
                    onMouseEnter={() => setActiveProgressId(point.row.progressId)}
                    onMouseLeave={() => setActiveProgressId(null)}
                  >
                    <title>{`${point.row.label}: ${point.row.gameTitle}\nDuration: ${formatDurationLong(point.row.durationSeconds)}\nCompleted: ${point.row.completionDate}`}</title>
                  </circle>
                  {point.showLabel ? (
                    <text className="duration-x-label" x={point.x} y={chart.height - chart.margin.bottom + 22} textAnchor="middle">{point.row.label.replace("Game ", "")}</text>
                  ) : null}
                </g>
              ))}
              <text className="duration-axis-title" x={chart.width / 2} y={chart.height - 12} textAnchor="middle">Game Completion Number</text>
              <text className="duration-axis-title" x={-chart.height / 2} y="18" textAnchor="middle" transform="rotate(-90)">Duration (hours)</text>
            </svg>
          </div>
        </div>
        {activePoint ? (
          <div
            className={[
              "duration-tooltip",
              tooltipOnLeft ? "duration-tooltip-left" : "",
              tooltipBelow ? "duration-tooltip-below" : ""
            ].filter(Boolean).join(" ")}
            role="tooltip"
            style={{ left: `${tooltipX}px`, top: `${activePoint.y}px` }}
          >
            <span>{activePoint.row.label}</span>
            <strong>{activePoint.row.gameTitle}</strong>
            <span>{formatDurationLong(activePoint.row.durationSeconds)}</span>
            <span>Completed: {activePoint.row.completionDate}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Stat({
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

function ThermometerCard({
  title,
  current,
  total,
  percentage
}: Readonly<{
  title: string;
  current: number;
  total: number;
  percentage: number;
}>) {
  return (
    <article className="thermometer-card" aria-label={title}>
      <h3>{title}</h3>
      <div className="thermometer" aria-hidden>
        <div className="thermometer-fill" style={{ height: `${Math.max(0, Math.min(100, percentage))}%` }} />
      </div>
      <div className="thermometer-stats">
        <span>{current} / {total} games</span>
        <strong>{percentage.toFixed(1)}%</strong>
      </div>
    </article>
  );
}

function calculateStatistics(games: GameDto[], progress: GameProgressDto[], ownedTypes: Record<string, string>) {
  const gamesInChallengeCount = games.filter((game) => !game.isExcluded).length;
  const gamesCompletedCount = progress.filter((game) => !!game.dateFinished).length;
  const gamesRemainingCount = gamesInChallengeCount - gamesCompletedCount;
  const percentageComplete = gamesInChallengeCount > 0 ? (gamesCompletedCount / gamesInChallengeCount) * 100 : 0;

  const durations = progress
    .filter((game) => !!game.dateFinished)
    .map((game) => ({ progress: game, seconds: parseDurationSeconds(game.completionTime) }))
    .filter((entry): entry is { progress: GameProgressDto; seconds: number } => entry.seconds !== null);
  const averageDurationSeconds = durations.length ? durations.reduce((sum, entry) => sum + entry.seconds, 0) / durations.length : null;
  const estimatedRemainingSeconds = averageDurationSeconds === null ? null : averageDurationSeconds * Math.max(0, gamesRemainingCount);

  const totalGamesOwned = games.filter((game) => game.isOwned).length;
  const gamesCollectedInChallenge = games.filter((game) => game.isOwned && !game.isExcluded).length;
  const gamesCollectedButExcluded = games.filter((game) => game.isOwned && game.isExcluded).length;
  const collectionPercentageInChallenge = gamesInChallengeCount > 0 ? (gamesCollectedInChallenge / gamesInChallengeCount) * 100 : 0;
  const collectionPercentageTotal = games.length > 0 ? (totalGamesOwned / games.length) * 100 : 0;

  const yearlyStats = calculateYearlyStatistics(progress, gamesInChallengeCount);
  const sortedDurations = [...durations].sort((left, right) => left.progress.progressId - right.progress.progressId);
  const durationRows = sortedDurations.map((entry, index) => ({
    progressId: entry.progress.progressId,
    label: `Game #${index + 1}`,
    gameTitle: entry.progress.gameTitle,
    completionDate: entry.progress.dateFinished ?? "",
    durationSeconds: entry.seconds,
    durationHours: Math.round((entry.seconds / 3600) * 100) / 100
  }));

  return {
    gamesInChallengeCount,
    gamesCompletedCount,
    gamesRemainingCount,
    percentageComplete,
    averageDurationSeconds,
    estimatedRemainingSeconds,
    totalGamesOwned,
    gamesCollectedInChallenge,
    gamesCollectedButExcluded,
    collectionPercentageInChallenge,
    collectionPercentageTotal,
    yearlyStats,
    durationRows,
    ownershipSlices: buildOwnershipSlices(ownedTypes)
  };
}

function calculateYearlyStatistics(progress: GameProgressDto[], gamesInChallengeCount: number): YearlyStatistic[] {
  const started = new Map<number, number>();
  const completed = new Map<number, number>();
  for (const game of progress) {
    const startedYear = Number.parseInt(game.dateStarted.slice(0, 4), 10);
    if (!Number.isNaN(startedYear)) {
      started.set(startedYear, (started.get(startedYear) ?? 0) + 1);
    }
    if (game.dateFinished) {
      const finishedYear = Number.parseInt(game.dateFinished.slice(0, 4), 10);
      if (!Number.isNaN(finishedYear)) {
        completed.set(finishedYear, (completed.get(finishedYear) ?? 0) + 1);
      }
    }
  }

  const years = [...new Set([...started.keys(), ...completed.keys()])].sort((left, right) => right - left);
  return years.map((year) => ({
    year,
    gamesStarted: started.get(year) ?? 0,
    gamesCompleted: completed.get(year) ?? 0,
    completionPercentage: gamesInChallengeCount > 0 ? ((completed.get(year) ?? 0) / gamesInChallengeCount) * 100 : 0
  }));
}

function parseDurationSeconds(value?: string | null): number | null {
  if (!value) return null;
  const [dayPart, timePart] = value.includes(".") ? value.split(".") : [null, value];
  const [hours = "0", minutes = "0", seconds = "0"] = (timePart ?? value).split(":");
  return (Number.parseInt(dayPart ?? "0", 10) * 24 + Number.parseInt(hours, 10)) * 3600
    + Number.parseInt(minutes, 10) * 60
    + Number.parseInt(seconds, 10);
}

function formatAverageDuration(seconds: number | null) {
  if (seconds === null) return "N/A";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function formatDurationLong(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

function buildDurationChart(rows: DurationRow[], containerWidth: number, zoomLevel: number) {
  const margin = { top: 24, right: 32, bottom: 64, left: 68 };
  const baseWidth = Math.max(280, Math.floor(containerWidth) - 16);
  const width = Math.round(baseWidth * zoomLevel);
  const height = Math.round(Math.min(520, Math.max(360, baseWidth * 0.24)));
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxHours = Math.max(1, ...rows.map((row) => row.durationHours));
  const yMax = niceDurationCeiling(maxHours);
  const yScale = (hours: number) => margin.top + (1 - hours / yMax) * plotHeight;
  const xScale = (index: number) => margin.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const labelStep = Math.max(1, Math.ceil(rows.length / 18));
  const points = rows.map((row, index) => {
    const x = xScale(index);
    const y = yScale(row.durationHours);
    return {
      row,
      x,
      y,
      showLabel: index === 0 || index === rows.length - 1 || index % labelStep === 0
    };
  });
  const linePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const baseline = height - margin.bottom;
  const areaPath = durationAreaPath(points, baseline);
  const yTicks = buildDurationTicks(yMax);

  return { areaPath, height, linePoints, margin, points, width, yScale, yTicks };
}

function durationAreaPath(points: DurationPoint[], baseline: number) {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  if (!firstPoint || !lastPoint) {
    return "";
  }

  const peakPoints = points.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" L ");
  return `M ${firstPoint.x.toFixed(2)} ${baseline} L ${peakPoints} L ${lastPoint.x.toFixed(2)} ${baseline} Z`;
}

function niceDurationCeiling(maxHours: number) {
  if (maxHours <= 5) return 5;
  if (maxHours <= 10) return 10;
  if (maxHours <= 12) return 12;
  if (maxHours <= 24) return 24;
  if (maxHours <= 50) return Math.ceil(maxHours / 10) * 10;
  const magnitude = 10 ** Math.floor(Math.log10(maxHours));
  return Math.ceil(maxHours / magnitude) * magnitude;
}

function buildDurationTicks(maxHours: number) {
  const tickCount = 5;
  return Array.from({ length: tickCount + 1 }, (_, index) => (maxHours / tickCount) * index);
}

function formatTickHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function formatEstimatedTimeRemaining(seconds: number | null) {
  if (seconds === null) return "N/A";
  if (seconds === 0) return "Complete!";
  let remaining = Math.floor(seconds);
  const days = Math.floor(remaining / 86_400);
  remaining -= days * 86_400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining - minutes * 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

function buildOwnershipSlices(ownedTypes: Record<string, string>): OwnershipSlice[] {
  const counts = Object.values(ownedTypes).reduce<Record<string, number>>((acc, type) => {
    const key = type.trim() || "Not Specified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];

  const colors = ["#e91e63", "#9c27b0", "#9146ff", "#ff9800", "#4caf50", "#2196f3", "#f44336", "#ffc107", "#795548", "#9e9e9e"];
  let startAngle = -90;
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en-GB"))
    .map(([label, value], index) => {
      const percent = (value / total) * 100;
      const endAngle = startAngle + (value / total) * 360;
      const path = sectorPath(startAngle, endAngle, 70);
      startAngle = endAngle;
      return { label, value, percent, color: colors[index % colors.length]!, path };
    });
}

function sectorPath(startAngle: number, endAngle: number, radius: number) {
  const start = angleToPoint(startAngle, radius);
  const end = angleToPoint(endAngle, radius);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M 0 0 L ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)} Z`;
}

function angleToPoint(angle: number, radius: number) {
  const radians = (Math.PI / 180) * angle;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}
