import type { LineDirection } from '@/lib/lineDirection';

type Position = [number, number];

export type ArrowPlacementDirection = Exclude<LineDirection, 'none'>;

export type LineArrowMarker = {
  id: string;
  coordinates: Position;
  bearing: number;
  direction: ArrowPlacementDirection;
  lineColor: string;
};

export type MarkedLine = {
  coordinates: Position[];
  lineColor: string;
};

export type SnapResult = {
  coordinates: Position;
  bearing: number;
  lineColor: string;
};

const LINE_COLOR_SUFFIX: Record<string, string> = {
  '#c33425': 'roed',
  '#eab436': 'oransje',
  '#0099ff': 'blaa',
  '#00b359': 'gronn'
};

const LEGACY_LINE_COLOR_SUFFIX: Record<string, string> = {
  '#e60000': 'roed',
  '#ff9900': 'oransje'
};

export const ARROW_ICON_PATHS: Record<string, string> = {
  'pil-en-roed': '/icons/pil-en-roed.svg',
  'pil-en-oransje': '/icons/pil-en-oransje.svg',
  'pil-en-blaa': '/icons/pil-en-blaa.svg',
  'pil-en-gronn': '/icons/pil-en-gronn.svg',
  'pil-dobbel-roed': '/icons/pil-dobbel-roed.svg',
  'pil-dobbel-oransje': '/icons/pil-dobbel-oransje.svg',
  'pil-dobbel-blaa': '/icons/pil-dobbel-blaa.svg',
  'pil-dobbel-gronn': '/icons/pil-dobbel-gronn.svg'
};

export const MARKED_LINE_SNAP_DISTANCE_PX = 15;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const segmentBearing = (from: Position, to: Position): number => {
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLng = toRadians(lng2 - lng1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
};

const closestPointOnSegment = (
  point: Position,
  start: Position,
  end: Position
): { point: Position; t: number } => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { point: start, t: 0 };
  }

  let t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    point: [start[0] + t * dx, start[1] + t * dy],
    t
  };
};

export const getColorSuffix = (lineColor: string): string | null => {
  const normalized = lineColor.toLowerCase();
  return LINE_COLOR_SUFFIX[normalized] ?? LEGACY_LINE_COLOR_SUFFIX[normalized] ?? null;
};

export const getArrowIconKind = (
  lineColor: string,
  direction: ArrowPlacementDirection
): string | null => {
  const suffix = getColorSuffix(lineColor);
  if (!suffix) return null;
  return direction === 'both' ? `pil-dobbel-${suffix}` : `pil-en-${suffix}`;
};

export const snapClickToMarkedLine = (
  clickLngLat: Position,
  markedLines: MarkedLine[],
  project: (position: Position) => { x: number; y: number },
  maxDistancePx = MARKED_LINE_SNAP_DISTANCE_PX
): SnapResult | null => {
  const clickPx = project(clickLngLat);
  let best: SnapResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const line of markedLines) {
    const coordinates = line.coordinates;
    if (coordinates.length < 2) continue;

    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const start = coordinates[index];
      const end = coordinates[index + 1];
      const closest = closestPointOnSegment(clickLngLat, start, end);
      const projected = project(closest.point);
      const distance = Math.hypot(projected.x - clickPx.x, projected.y - clickPx.y);
      if (distance > maxDistancePx || distance >= bestDistance) continue;

      bestDistance = distance;
      best = {
        coordinates: closest.point,
        bearing: segmentBearing(start, end),
        lineColor: line.lineColor
      };
    }
  }

  return best;
};

export const snapPositionToMarkedLine = (
  clickLngLat: Position,
  markedLines: MarkedLine[],
  project: (position: Position) => { x: number; y: number },
  maxDistancePx = MARKED_LINE_SNAP_DISTANCE_PX
): Position | null =>
  snapClickToMarkedLine(clickLngLat, markedLines, project, maxDistancePx)?.coordinates ?? null;

export const normalizeArrowPlacementDirection = (value: unknown): ArrowPlacementDirection | null => {
  if (value === 'forward' || value === 'reverse' || value === 'both') return value;
  return null;
};

export const normalizeLineArrows = (value: unknown): LineArrowMarker[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const arrow = item as {
      id?: unknown;
      coordinates?: unknown;
      bearing?: unknown;
      direction?: unknown;
      lineColor?: unknown;
    };
    if (!Array.isArray(arrow.coordinates) || arrow.coordinates.length < 2) return [];
    const lng = Number(arrow.coordinates[0]);
    const lat = Number(arrow.coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    const direction = normalizeArrowPlacementDirection(arrow.direction);
    if (!direction) return [];
    if (typeof arrow.lineColor !== 'string') return [];
    const bearing = Number(arrow.bearing);
    if (!Number.isFinite(bearing)) return [];

    return [{
      id: typeof arrow.id === 'string' && arrow.id.length > 0 ? arrow.id : crypto.randomUUID(),
      coordinates: [lng, lat],
      bearing,
      direction,
      lineColor: arrow.lineColor
    }];
  });
};
