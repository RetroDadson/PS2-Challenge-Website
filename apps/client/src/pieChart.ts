export const PIE_CHART_COLORS = [
  "#e91e63",
  "#9c27b0",
  "#9146ff",
  "#ff9800",
  "#4caf50",
  "#2196f3",
  "#f44336",
  "#ffc107",
  "#795548",
  "#9e9e9e"
];

export function angleToPoint(angleDeg: number, radius: number) {
  const radians = (Math.PI / 180) * angleDeg;
  return { x: radius * Math.cos(radians), y: radius * Math.sin(radians) };
}

export function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

export function sectorPath(startAngleDeg: number, endAngleDeg: number, radius: number) {
  const start = angleToPoint(startAngleDeg, radius);
  const end = angleToPoint(endAngleDeg, radius);
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M 0 0 L ${formatPathNumber(start.x)} ${formatPathNumber(start.y)} A ${radius} ${radius} 0 ${largeArc} 1 ${formatPathNumber(end.x)} ${formatPathNumber(end.y)} Z`;
}

export function fullCirclePath(radius: number) {
  return `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} A ${radius} ${radius} 0 0 1 0 ${-radius} Z`;
}
