type Position = [number, number];

type LineStringFeature = GeoJSON.Feature<GeoJSON.LineString>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const getVeglenkesekvensId = (feature: LineStringFeature): string | null => {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const candidate = props.veglenkesekvensid;
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return String(candidate);
  }
  return null;
};

export const getSegmentRoadId = (feature: LineStringFeature): string | null => {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const veglenkesekvensId = getVeglenkesekvensId(feature);
  if (!veglenkesekvensId) return null;
  const startposisjon = toNumber(props.startposisjon) ?? 0;
  return `${veglenkesekvensId}_${startposisjon}`;
};

const getSegmentPositionRange = (
  feature: LineStringFeature
): { start: number; end: number } | null => {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const start = toNumber(props.startposisjon);
  const end = toNumber(props.sluttposisjon);
  if (start === null || end === null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
};

const distanceSquared = (a: Position, b: Position): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

const closestPointOnSegment = (
  point: Position,
  a: Position,
  b: Position
): { point: Position; t: number } => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { point: a, t: 0 };
  }

  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    point: [a[0] + t * dx, a[1] + t * dy],
    t
  };
};

/** Project click onto segment geometry and interpolate position along veglenkesekvens. */
export const getPositionOnSegment = (
  clickLngLat: Position,
  segment: LineStringFeature
): { position: number; coordinates: Position } | null => {
  const range = getSegmentPositionRange(segment);
  if (!range) return null;

  const coordinates = segment.geometry.coordinates as Position[];
  if (coordinates.length < 2) return null;

  let bestPoint: Position = coordinates[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestT = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const closest = closestPointOnSegment(clickLngLat, start, end);
    const dist = distanceSquared(clickLngLat, closest.point);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestPoint = closest.point;
      bestT = closest.t;
    }
  }

  const span = range.end - range.start;
  const position = range.start + bestT * span;

  return { position, coordinates: bestPoint };
};

const rangesOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean => aStart <= bEnd && aEnd >= bStart;

export const selectSegmentsInRange = (
  cache: Iterable<LineStringFeature>,
  veglenkesekvensId: string,
  fromPos: number,
  toPos: number
): LineStringFeature[] => {
  const rangeStart = Math.min(fromPos, toPos);
  const rangeEnd = Math.max(fromPos, toPos);

  return Array.from(cache).filter((feature) => {
    if (getVeglenkesekvensId(feature) !== veglenkesekvensId) return false;
    const range = getSegmentPositionRange(feature);
    if (!range) return false;
    return rangesOverlap(range.start, range.end, rangeStart, rangeEnd);
  });
};

export const isAlreadyMarked = (
  segment: LineStringFeature,
  markedFeatures: LineStringFeature[]
): boolean => {
  const roadId = getSegmentRoadId(segment);
  if (!roadId) return false;

  return markedFeatures.some((marked) => {
    const props = (marked.properties ?? {}) as Record<string, unknown>;
    if (typeof props.roadId === 'string' && props.roadId === roadId) return true;
    return getSegmentRoadId(marked) === roadId;
  });
};
