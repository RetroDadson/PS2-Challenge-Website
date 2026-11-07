import type { SubDrawDto, SubWheelSliceDto } from "@ps2-challenge/shared";
import { useEffect, useId, useMemo, useRef } from "react";
import { api } from "../api.js";
import { useAsync, useRealtime } from "../hooks.js";
import { formatOdds } from "../subPickLabels.js";
import {
  extraTurnsFor,
  labelLayout,
  restingRotation,
  sliceAngle,
  sliceColourIndex,
  sliceUnderPointer,
  spinRotation,
  spinTarget,
  tweenPositions,
  wheelPalette,
  type LabelLayout
} from "../wheelMath.js";

const shuffleDurationMs = 1200;

type ActiveSpin = { startRotation: number; targetRotation: number; startedAt: number; durationMs: number };
type ActiveTween = { from: number[]; to: number[]; startedAt: number };
type WheelState = { rotation: number; order: number[]; spin: ActiveSpin | null; spinKey: string | null; tween: ActiveTween | null; pointer: number };

export function useWheel() {
  const wheel = useAsync(() => api.subPickWheel(), []);
  const reload = () => void wheel.reload();
  useRealtime("/wheelHub", reload);
  const clockOffsetMs = useMemo(() => (wheel.data ? Date.parse(wheel.data.serverNow) - Date.now() : 0), [wheel.data]);
  const spin = wheel.data?.draw?.spin;
  const waitingForReveal = wheel.data?.draw?.state === "spinning" && spin ? Date.parse(spin.revealAt) - (Date.now() + clockOffsetMs) : null;

  useEffect(() => {
    if (waitingForReveal === null) return undefined;
    const timeout = globalThis.setTimeout(() => void wheel.reload(), Math.max(0, waitingForReveal) + 150);
    return () => globalThis.clearTimeout(timeout);
  }, [waitingForReveal, wheel]);

  return { ...wheel, clockOffsetMs };
}

export function Wheel({
  draw,
  clockOffsetMs,
  label,
  size = 720,
  onPointerChange
}: Readonly<{ draw: SubDrawDto; clockOffsetMs: number; label: string; size?: number; onPointerChange?: (sliceIndex: number) => void }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionId = useId();
  const state = useRef<WheelState>({ rotation: 0, order: [], spin: null, spinKey: null, tween: null, pointer: -1 });
  const pointerCallback = useRef(onPointerChange);
  pointerCallback.current = onPointerChange;
  const slices = draw.slices;

  useEffect(() => {
    const current = state.current;
    const now = Date.now() + clockOffsetMs;
    const order = slices.map((slice) => slice.entryId);
    const reducedMotion = prefersReducedMotion();
    const spin = draw.spin;
    const spinKey = spin ? `${draw.id}:${spin.spinNumber}` : null;

    if (spin && spinKey !== current.spinKey && (draw.state === "spinning" || draw.state === "awaiting_decision" || draw.state === "accepted")) {
      const elapsed = now - Date.parse(spin.startedAt);
      const startRotation = current.rotation;
      const targetRotation = spinTarget(startRotation, spin.sliceCount, spin.winningSliceIndex, spin.stopOffset, extraTurnsFor(spin.durationMs));
      current.spinKey = spinKey;
      current.tween = null;
      if (elapsed >= spin.durationMs) {
        current.spin = null;
        current.rotation = restingRotation(spin.sliceCount, spin.winningSliceIndex, spin.stopOffset);
      } else {
        current.spin = { startRotation, targetRotation, startedAt: Date.parse(spin.startedAt), durationMs: spin.durationMs };
      }
    } else if (draw.state === "ready" && current.order.length > 0 && current.order.join() !== order.join() && !reducedMotion) {
      current.tween = { from: current.order, to: order, startedAt: now };
    }
    current.order = order;
    current.pointer = -1;

    let frame = 0;
    const render = () => {
      const time = Date.now() + clockOffsetMs;
      const active = advance(current, time, reducedMotion);
      paint(canvasRef.current, slices, current, time, highlightIndex(draw));
      const pointer = current.tween ? -1 : sliceUnderPointer(current.rotation, slices.length);
      if (pointer !== current.pointer) {
        current.pointer = pointer;
        pointerCallback.current?.(pointer);
      }
      if (active) frame = globalThis.requestAnimationFrame(render);
    };
    render();
    return () => globalThis.cancelAnimationFrame(frame);
  }, [clockOffsetMs, draw, slices]);

  return (
    <figure className="sub-wheel-figure" aria-labelledby={captionId}>
      <canvas ref={canvasRef} className="sub-wheel-canvas" width={size} height={size} data-testid="sub-wheel" />
      <figcaption id={captionId} className="visually-hidden">{label}</figcaption>
    </figure>
  );
}

export function WheelReadout({ draw, sliceIndex }: Readonly<{ draw: SubDrawDto; sliceIndex: number }>) {
  const result = draw.state === "accepted" ? draw.winner : draw.spin?.result;
  const revealed = (draw.state === "awaiting_decision" || draw.state === "accepted") && result;
  const slice = revealed ? result : draw.slices[sliceIndex];
  let heading = "On the pointer";
  if (revealed) heading = "Winner";
  else if (draw.state === "spinning") heading = "Now passing";
  return (
    <div className={`sub-wheel-readout${revealed ? " is-winner" : ""}`} data-testid="wheel-readout">
      <span className="sub-wheel-readout-heading">{heading}</span>
      <strong>{slice?.gameTitle ?? (draw.slices.length ? " " : "Waiting for entries")}</strong>
      <span>{readoutDetail(slice, revealed ? result : null)}</span>
    </div>
  );
}

function readoutDetail(slice: SubWheelSliceDto | undefined, result: SubDrawDto["winner"]): string {
  const picker = slice?.twitchDisplayName ? `Picked by ${slice.twitchDisplayName}` : "";
  if (!result) return picker || " ";
  return [picker, `${formatOdds(result.odds)} chance`].filter(Boolean).join(" · ");
}

function advance(current: WheelState, time: number, reducedMotion: boolean): boolean {
  let active = false;
  if (current.spin) {
    const elapsed = time - current.spin.startedAt;
    if (elapsed >= current.spin.durationMs) {
      current.rotation = current.spin.targetRotation;
      current.spin = null;
    } else if (reducedMotion) {
      active = true;
    } else {
      current.rotation = spinRotation(current.spin.startRotation, current.spin.targetRotation, elapsed, current.spin.durationMs);
      active = true;
    }
  }
  if (current.tween) {
    if (time - current.tween.startedAt >= shuffleDurationMs) current.tween = null;
    else active = true;
  }
  return active;
}

function highlightIndex(draw: SubDrawDto): number | null {
  const revealed = draw.state === "awaiting_decision" || draw.state === "accepted";
  return revealed && draw.spin?.result ? draw.slices.findIndex((slice) => slice.entryId === draw.spin?.result?.entryId) : null;
}

function paint(canvas: HTMLCanvasElement | null, slices: readonly SubWheelSliceDto[], current: WheelState, time: number, highlight: number | null): void {
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;
  const size = canvas.width;
  const radius = size / 2 - size / 30;
  const angle = sliceAngle(slices.length);
  const progress = current.tween ? (time - current.tween.startedAt) / shuffleDurationMs : 1;
  const positions = current.tween ? tweenPositions(current.tween.from, current.tween.to, progress) : null;
  const labels = labelLayout(slices.length, radius);
  const separators = angle * radius >= 6;

  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(size / 2, size / 2);
  context.beginPath();
  context.arc(0, 0, radius + size / 60, 0, Math.PI * 2);
  context.fillStyle = "#14101f";
  context.fill();

  slices.forEach((slice, index) => {
    const position = positions?.get(slice.entryId) ?? index;
    const start = current.rotation + position * angle - Math.PI / 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, start, start + angle);
    context.closePath();
    context.fillStyle = wheelPalette[sliceColourIndex(position, slices.length, wheelPalette.length)]!;
    context.fill();
    if (separators) {
      context.strokeStyle = "rgba(10, 6, 20, 0.6)";
      context.lineWidth = Math.max(1, size / 480);
      context.stroke();
    }
    if (labels) drawLabel(context, slice, start + angle / 2, labels);
  });

  if (highlight !== null && highlight >= 0 && !current.spin) {
    const start = current.rotation + highlight * angle - Math.PI / 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.arc(0, 0, radius, start, start + angle);
    context.closePath();
    context.strokeStyle = "#ffffff";
    context.lineWidth = size / 120;
    context.stroke();
  }

  context.beginPath();
  context.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
  context.fillStyle = "#1a1a2e";
  context.fill();
  context.lineWidth = size / 90;
  context.strokeStyle = "#e91e63";
  context.stroke();
  context.restore();

  const pointerWidth = size / 30;
  context.beginPath();
  context.moveTo(size / 2 - pointerWidth, size / 180);
  context.lineTo(size / 2 + pointerWidth, size / 180);
  context.lineTo(size / 2, pointerWidth * 2.2);
  context.closePath();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#e91e63";
  context.lineWidth = size / 180;
  context.fill();
  context.stroke();
}

function drawLabel(context: CanvasRenderingContext2D, slice: SubWheelSliceDto, middle: number, layout: LabelLayout): void {
  const pointsLeft = Math.cos(middle) < 0;
  const maxWidth = layout.outerRadius - layout.innerRadius;
  const edge = pointsLeft ? -layout.outerRadius : layout.outerRadius;
  const picker = layout.showPicker ? slice.twitchDisplayName : null;
  context.save();
  context.rotate(pointsLeft ? middle + Math.PI : middle);
  context.textAlign = pointsLeft ? "left" : "right";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.55)";
  context.shadowBlur = 3;
  context.font = `700 ${layout.fontSize}px "Segoe UI", system-ui, sans-serif`;
  context.fillText(fitText(context, slice.gameTitle, maxWidth), edge, picker ? -layout.fontSize * 0.5 : 0);
  if (picker) {
    context.font = `500 ${layout.fontSize * 0.72}px "Segoe UI", system-ui, sans-serif`;
    context.fillStyle = "rgba(255, 255, 255, 0.85)";
    context.fillText(fitText(context, picker, maxWidth), edge, layout.fontSize * 0.62);
  }
  context.restore();
}

const fittedText = new Map<string, string>();

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const key = `${context.font}|${maxWidth}|${text}`;
  const cached = fittedText.get(key);
  if (cached !== undefined) return cached;
  let fitted = text;
  if (context.measureText(text).width > maxWidth) {
    let end = text.length;
    while (end > 1 && context.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end--;
    fitted = `${text.slice(0, end).trimEnd()}…`;
  }
  fittedText.set(key, fitted);
  return fitted;
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function wheelLabel(draw: SubDrawDto): string {
  const games = draw.odds.length;
  return `Sub pick wheel for game ${draw.gameNumber}: ${draw.slices.length} ${draw.slices.length === 1 ? "entry" : "entries"} across ${games} ${games === 1 ? "game" : "games"}`;
}
