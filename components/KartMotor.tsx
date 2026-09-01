"use client";
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildKartStyle, PLACE_LABEL_LAYER_IDS, ROAD_LABEL_LAYER_IDS } from '@/lib/mapStyle';
import { type LineDirection } from '@/lib/lineDirection';
import {
  ARROW_ICON_PATHS,
  getArrowIconKind,
  normalizeLineArrows,
  snapClickToMarkedLine,
  snapPositionToMarkedLine,
  type ArrowPlacementDirection,
  type LineArrowMarker,
  type MarkedLine
} from '@/lib/lineArrowPlacement';
import {
  getPositionOnSegment,
  getSegmentRoadId,
  getVeglenkesekvensId,
  isAlreadyMarked,
  selectSegmentsInRange
} from '@/lib/roadStretchSelection';
import {
  getArrowIconScale,
  getSignIconScale,
  SIGN_BASE_HEIGHT
} from '@/lib/mapExport/constants';
import { runMapExport } from '@/lib/mapExport/runMapExport';
import type { ExportOptions, ExportVectorData } from '@/lib/mapExport/types';

export type { LineDirection };
export type { ExportFormat, ExportOptions, ExportResolution } from '@/lib/mapExport/types';

const SVV_COLORS = {
  closedRoad: "#C33425", // SVV Rød
  closedRoadOutline: "#7F1F14", // Mork rod casing
  reducedRoad: "#EAB436", // SVV Oransje
  reducedRoadOutline: "#9C7411", // Mork oransje casing
  pedestrian: "#0099FF", // Lys bla
  pedestrianOutline: "#005999", // Morkere bla casing
  detour: "#00B359",     // SVV Grønn
  detourOutline: "#005c31", // Mork gronn casing
  background: "#F5F5F5"
};

/** Farger fra tidligere paletter, slik at eldre prosjektfiler tegnes med dagens farger. */
const LEGACY_COLOR_ALIASES: Record<string, string> = {
  '#e60000': SVV_COLORS.closedRoad,
  '#ff9900': SVV_COLORS.reducedRoad
};

const toCurrentPaletteColor = (color: string): string =>
  LEGACY_COLOR_ALIASES[color.toLowerCase()] ?? color;

export type ActiveTool =
  | 'none'
  | 'closed'
  | 'reduced'
  | 'pedestrian'
  | 'detour'
  | 'sign'
  | 'traffic-light'
  | 'road-work'
  | 'queue'
  | 'text';

type KartMotorProps = {
  showPlaceLabels: boolean;
  showRoadLabels: boolean;
  activeTool: ActiveTool;
  manualModeEnabled: boolean;
  stretchSelectEnabled: boolean;
  onClear: number;
  onUndo: number;
  editingAnnotation: { id: string; text: string; size: number; rotation: number; coordinates: Position; backgroundStyle: AnnotationBackgroundStyle } | null;
  onEditingAnnotationChange: (annotation: { id: string; text: string; size: number; rotation: number; coordinates: Position; backgroundStyle: AnnotationBackgroundStyle } | null) => void;
  showLegend: boolean;
  lineDirection: LineDirection;
  onTextAnnotationCreated: () => void;
  exportPreviewMode: boolean;
};

export type KartMotorHandle = {
  exportMap: (options: ExportOptions) => Promise<void>;
  exportMapData: () => void;
  openProject: () => void;
};

type Position = [number, number];
export type AnnotationBackgroundStyle = 'none' | 'white' | 'green';
type Annotation = {
  id: string;
  text: string;
  size: number;
  rotation: number;
  coordinates: Position;
  backgroundStyle: AnnotationBackgroundStyle;
};
type SignKind = 'stengt-skilt' | 'lyskryss-skilt' | 'veiarbeid-skilt' | 'ko-skilt';
type SignPlacement = { id: string; coordinates: Position; kind: SignKind };
type LegendId = 'closed' | 'reduced' | 'pedestrian' | 'detour';
type LegendRow = {
  id: LegendId;
  label: string;
  casingColor: string;
  mainColor: string;
};
type ManualLine = { id: string; color: string; points: Position[] };
type SegmentToolCategory =
  | 'closed-segment'
  | 'reduced-segment'
  | 'pedestrian-segment'
  | 'detour-segment';
type StretchAnchor = {
  veglenkesekvensId: string;
  position: number;
  coordinates: Position;
};
type ActionCategory =
  | 'closed-segment'
  | 'reduced-segment'
  | 'pedestrian-segment'
  | 'closed-sign'
  | 'detour-segment'
  | 'manual-line'
  | 'line-arrow'
  | 'annotation';
type ActionHistoryItem =
  | { type: 'add'; category: Exclude<ActionCategory, 'manual-line'> }
  | { type: 'add'; category: 'manual-line'; id: string }
  | { type: 'add-batch'; category: SegmentToolCategory; uuids: string[] }
  | { type: 'delete'; category: 'closed-sign'; data: SignPlacement }
  | { type: 'delete'; category: 'line-arrow'; data: LineArrowMarker }
  | { type: 'delete'; category: 'closed-segment'; data: GeoJSON.Feature<GeoJSON.LineString> }
  | { type: 'delete'; category: 'reduced-segment'; data: GeoJSON.Feature<GeoJSON.LineString> }
  | { type: 'delete'; category: 'pedestrian-segment'; data: GeoJSON.Feature<GeoJSON.LineString> }
  | { type: 'delete'; category: 'detour-segment'; data: GeoJSON.Feature<GeoJSON.LineString> }
  | { type: 'delete'; category: 'manual-line'; data: ManualLine };

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry>;
type MapProjectData = {
  version: 1;
  savedAt: string;
  view: {
    center: Position;
    zoom: number;
  } | null;
  closedSigns: SignPlacement[];
  closedRoadFeatures: GeoJSON.Feature<GeoJSON.LineString>[];
  reducedRoadFeatures: GeoJSON.Feature<GeoJSON.LineString>[];
  pedestrianFeatures: GeoJSON.Feature<GeoJSON.LineString>[];
  detourFeatures: GeoJSON.Feature<GeoJSON.LineString>[];
  manualLines?: ManualLine[];
  /** Legacy project format fallback. */
  closedManualSegments?: Position[][];
  reducedManualSegments?: Position[][];
  pedestrianManualSegments?: Position[][];
  detourManualSegments?: Position[][];
  detourPoints?: Position[];
  annotations: Annotation[];
  legendLabels?: Partial<Record<LegendId, string>>;
  lineArrows?: LineArrowMarker[];
};

const DEFAULT_LEGEND_LABELS: Record<LegendId, string> = {
  closed: 'Stengt veg',
  reduced: 'Redusert fremkommelighet',
  pedestrian: 'Fotgjengere/syklister',
  detour: 'Alternativ rute'
};

const emptyFeatureCollection = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: []
});

/** NVDB-vegnett vises og hentes kun ved zoom >= dette nivået. */
const NVDB_MIN_ZOOM = 14;
const NVDB_BASE_URL = 'https://nvdbapiles.atlas.vegvesen.no';

const SIGN_ASSET_PATHS: Record<SignKind, string> = {
  'stengt-skilt': '/icons/stengtvei.svg',
  'lyskryss-skilt': '/icons/lyskryss.svg',
  'veiarbeid-skilt': '/icons/veiarbeid.svg',
  'ko-skilt': '/icons/trafikkork.svg'
};

const LEGEND_ROW_META: Array<Omit<LegendRow, 'label'>> = [
  { id: 'closed', casingColor: SVV_COLORS.closedRoadOutline, mainColor: SVV_COLORS.closedRoad },
  { id: 'reduced', casingColor: SVV_COLORS.reducedRoadOutline, mainColor: SVV_COLORS.reducedRoad },
  { id: 'pedestrian', casingColor: SVV_COLORS.pedestrianOutline, mainColor: SVV_COLORS.pedestrian },
  { id: 'detour', casingColor: SVV_COLORS.detourOutline, mainColor: SVV_COLORS.detour }
];

const getActiveLegendRows = (
  hasClosed: boolean,
  hasReduced: boolean,
  hasPedestrian: boolean,
  hasDetour: boolean,
  legendLabels: Record<LegendId, string>
): LegendRow[] => {
  const visibility: Record<LegendId, boolean> = {
    closed: hasClosed,
    reduced: hasReduced,
    pedestrian: hasPedestrian,
    detour: hasDetour
  };

  return LEGEND_ROW_META.filter((row) => visibility[row.id]).map((row) => ({
    ...row,
    label: legendLabels[row.id]
  }));
};

/** Samme som normalisert bredde/høyde i loadSignAssets (px). */
const CLOSED_SIGN_PNG_BASE_SIZE = 128;
const SNAP_ENDPOINT_DISTANCE_PX = 20;

function drawAnnotationBackgroundBox() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const radius = 6;
    const x = 1;
    const y = 1;
    const w = size - 2;
    const h = size - 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return ctx?.getImageData(0, 0, size, size) ?? null;
}

const ANNOTATION_EURO_GREEN = '#00965e';

/** Grønn «Europavei»-boks til MapLibre (mindre radius enn hvit boks). */
function drawGreenBox() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const radius = 2;
    const x = 1;
    const y = 1;
    const w = size - 2;
    const h = size - 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fillStyle = ANNOTATION_EURO_GREEN;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  return ctx?.getImageData(0, 0, size, size) ?? null;
}

const getOutlineColorForLineColor = (color: string): string => {
  if (color === SVV_COLORS.closedRoad) return SVV_COLORS.closedRoadOutline;
  if (color === SVV_COLORS.reducedRoad) return SVV_COLORS.reducedRoadOutline;
  if (color === SVV_COLORS.pedestrian) return SVV_COLORS.pedestrianOutline;
  if (color === SVV_COLORS.detour) return SVV_COLORS.detourOutline;
  return '#374151';
};

const parseWktLineString = (wkt: string): Position[] => {
  const normalized = wkt.trim();
  if (!normalized.toUpperCase().startsWith('LINESTRING')) return [];

  const start = normalized.indexOf('(');
  const end = normalized.lastIndexOf(')');
  if (start === -1 || end === -1 || end <= start) return [];

  return normalized
    .slice(start + 1, end)
    .split(',')
    .map((pair) => pair.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => [Number(parts[0]), Number(parts[1])] as Position)
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
};

const toGeoJsonFeatureCollection = (payload: unknown): FeatureCollection => {
  if (
    payload &&
    typeof payload === 'object' &&
    'type' in payload &&
    (payload as { type?: string }).type === 'FeatureCollection' &&
    Array.isArray((payload as { features?: unknown[] }).features)
  ) {
    return payload as FeatureCollection;
  }

  const objects =
    payload && typeof payload === 'object'
      ? (
          (payload as { objekter?: unknown[]; veglenkesekvenser?: unknown[] }).objekter ??
          (payload as { objekter?: unknown[]; veglenkesekvenser?: unknown[] }).veglenkesekvenser ??
          []
        )
      : [];

  const features: GeoJSON.Feature[] = [];

  for (const object of objects) {
    const row = object as {
      geometri?: {
        geojson?: GeoJSON.Geometry;
        wkt?: string;
        koordinater?: Position[];
      };
      geometry?: GeoJSON.Geometry;
    };

    let geometry: GeoJSON.Geometry | null = null;

    if (row.geometri?.geojson) {
      geometry = row.geometri.geojson;
    } else if (row.geometry) {
      geometry = row.geometry;
    } else if (typeof row.geometri?.wkt === 'string') {
      const coordinates = parseWktLineString(row.geometri.wkt);
      if (coordinates.length >= 2) geometry = { type: 'LineString', coordinates };
    } else if (Array.isArray(row.geometri?.koordinater) && row.geometri.koordinater.length >= 2) {
      geometry = { type: 'LineString', coordinates: row.geometri.koordinater };
    }

    if (!geometry) continue;

    features.push({
      type: 'Feature',
      properties: row as GeoJSON.GeoJsonProperties,
      geometry
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
};

const isRoadSegmentTool = (
  tool: ActiveTool
): tool is 'closed' | 'reduced' | 'pedestrian' | 'detour' =>
  tool === 'closed' || tool === 'reduced' || tool === 'pedestrian' || tool === 'detour';

type SignTool = 'sign' | 'traffic-light' | 'road-work' | 'queue';

const SIGN_TOOL_ICON: Record<SignTool, SignKind> = {
  sign: 'stengt-skilt',
  'traffic-light': 'lyskryss-skilt',
  'road-work': 'veiarbeid-skilt',
  queue: 'ko-skilt'
};

const isSignTool = (tool: ActiveTool): tool is SignTool =>
  tool === 'sign' || tool === 'traffic-light' || tool === 'road-work' || tool === 'queue';

const MARKED_LINE_LAYERS = new Set([
  'manual-line-fill',
  'closed-road-fill',
  'reduced-road-fill',
  'pedestrian-road-fill',
  'detour-road-layer'
]);

const KartMotor = React.forwardRef<KartMotorHandle, KartMotorProps>(function KartMotor(
  {
    showPlaceLabels,
    showRoadLabels,
    activeTool,
    manualModeEnabled,
    stretchSelectEnabled,
    onClear,
    onUndo,
    editingAnnotation,
    onEditingAnnotationChange,
    showLegend,
    lineDirection,
    onTextAnnotationCreated,
    exportPreviewMode
  },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const activeToolRef = useRef<ActiveTool>('none');
  const manualLinesRef = useRef<ManualLine[]>([]);
  const activeManualLineIdRef = useRef<string | null>(null);
  const isManualModeRef = useRef(false);
  const stretchSelectEnabledRef = useRef(false);
  const stretchAnchorRef = useRef<StretchAnchor | null>(null);
  const stretchErrorTimeoutRef = useRef<number | null>(null);
  const detourFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const closedRoadFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const reducedRoadFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const pedestrianFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const roadCacheRef = useRef<Map<string, GeoJSON.Feature<GeoJSON.LineString>>>(new Map());
  const isFetchingRef = useRef(false);
  /** Manuelt plasserte skilt (no-entry), i kartets lng/lat */
  const closedSignsRef = useRef<SignPlacement[]>([]);
  const lineArrowsRef = useRef<LineArrowMarker[]>([]);
  const lastFetchedBboxRef = useRef<string | null>(null);
  const moveDebounceRef = useRef<number | null>(null);
  const skipNextMapClickRef = useRef(false);
  const actionHistoryRef = useRef<ActionHistoryItem[]>([]);
  const draggingAnnotationIdRef = useRef<string | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const annotationPopupRef = useRef<maplibregl.Popup | null>(null);
  const signImageCacheRef = useRef<Partial<Record<SignKind, HTMLImageElement>>>({});
  const lastEditingAnnotationSentRef = useRef<{
    id: string;
    text: string;
    size: number;
    rotation: number;
    coordinates: Position;
    backgroundStyle: AnnotationBackgroundStyle;
  } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const [stretchError, setStretchError] = useState<string | null>(null);
  const [legendRenderVersion, setLegendRenderVersion] = useState(0);
  const [legendLabels, setLegendLabels] = useState<Record<LegendId, string>>(DEFAULT_LEGEND_LABELS);
  const lineDirectionRef = useRef<LineDirection>('none');
  const legendLabelsRef = useRef(legendLabels);
  legendLabelsRef.current = legendLabels;
  const editingAnnotationIdRef = useRef<string | null>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const annotationIdsKey = useMemo(
    () => annotations.map((annotation) => annotation.id).sort().join('|'),
    [annotations]
  );
  const showPlaceLabelsRef = useRef(showPlaceLabels);
  showPlaceLabelsRef.current = showPlaceLabels;
  const showRoadLabelsRef = useRef(showRoadLabels);
  showRoadLabelsRef.current = showRoadLabels;

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    lineDirectionRef.current = lineDirection;
  }, [lineDirection]);

  useEffect(() => {
    if (!map.current) return;
    const frame = requestAnimationFrame(() => {
      map.current?.resize();
    });
    return () => cancelAnimationFrame(frame);
  }, [exportPreviewMode]);

  useEffect(() => {
    isManualModeRef.current = manualModeEnabled;
  }, [manualModeEnabled]);

  useEffect(() => {
    const styleId = 'kartmotor-popup-zindex-style';
    if (document.getElementById(styleId)) return;
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
      .maplibregl-popup {
        z-index: 9999 !important;
        pointer-events: auto;
      }
      .maplibregl-popup-content {
        pointer-events: auto;
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, []);

  useEffect(() => {
    editingAnnotationIdRef.current = editingAnnotationId;
  }, [editingAnnotationId]);

  useEffect(() => {
    if (!map.current) return;
    clearAllDrawings();
  }, [onClear]);

  useEffect(() => {
    if (!map.current) return;
    undoLastAction();
  }, [onUndo]);

  const getFeatureRoadId = (feature: GeoJSON.Feature<GeoJSON.LineString>) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const candidate =
      props.roadId ??
      props.veglenkesekvensid ??
      props.id ??
      props.objectid ??
      props.veglenkeid;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      return String(candidate);
    }
    return null;
  };

  const getManualColorForTool = (tool: ActiveTool): string | null => {
    if (tool === 'closed') return SVV_COLORS.closedRoad;
    if (tool === 'reduced') return SVV_COLORS.reducedRoad;
    if (tool === 'pedestrian') return SVV_COLORS.pedestrian;
    if (tool === 'detour') return SVV_COLORS.detour;
    return null;
  };

  const getMarkedLines = (): MarkedLine[] => {
    const lines: MarkedLine[] = [];

    const addFeatures = (
      features: GeoJSON.Feature<GeoJSON.LineString>[],
      lineColor: string
    ) => {
      for (const feature of features) {
        const coordinates = feature.geometry.coordinates as Position[];
        if (coordinates.length >= 2) {
          lines.push({ coordinates, lineColor });
        }
      }
    };

    addFeatures(closedRoadFeaturesRef.current, SVV_COLORS.closedRoad);
    addFeatures(reducedRoadFeaturesRef.current, SVV_COLORS.reducedRoad);
    addFeatures(pedestrianFeaturesRef.current, SVV_COLORS.pedestrian);
    addFeatures(detourFeaturesRef.current, SVV_COLORS.detour);

    for (const line of manualLinesRef.current) {
      if (line.points.length >= 2) {
        lines.push({ coordinates: line.points, lineColor: line.color });
      }
    }

    return lines;
  };

  const syncLineArrowsSource = () => {
    const features: GeoJSON.Feature<GeoJSON.Point>[] = lineArrowsRef.current.flatMap((arrow) => {
      const iconKind = getArrowIconKind(arrow.lineColor, arrow.direction);
      if (!iconKind) return [];
      return [{
        type: 'Feature',
        properties: {
          id: arrow.id,
          iconKind,
          bearing: arrow.bearing,
          direction: arrow.direction,
          lineColor: arrow.lineColor
        },
        geometry: {
          type: 'Point',
          coordinates: arrow.coordinates
        }
      }];
    });

    updateSourceData('line-arrows-source', {
      type: 'FeatureCollection',
      features
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  const addLineArrowAtClick = (clickLngLat: Position): boolean => {
    const mapInstance = map.current;
    const direction = lineDirectionRef.current;
    if (!mapInstance || direction === 'none' || !isRoadSegmentTool(activeToolRef.current)) {
      return false;
    }

    const activeColor = getManualColorForTool(activeToolRef.current);
    if (!activeColor) return false;

    const snap = snapClickToMarkedLine(
      clickLngLat,
      getMarkedLines(),
      (position) => mapInstance.project(position)
    );
    if (!snap || snap.lineColor !== activeColor) return false;

    const marker: LineArrowMarker = {
      id: crypto.randomUUID(),
      coordinates: snap.coordinates,
      bearing: snap.bearing,
      direction,
      lineColor: snap.lineColor
    };
    lineArrowsRef.current = [...lineArrowsRef.current, marker];
    actionHistoryRef.current.push({ type: 'add', category: 'line-arrow' });
    syncLineArrowsSource();
    return true;
  };

  const getSnappedSignPosition = (clickLngLat: Position): Position => {
    const mapInstance = map.current;
    if (!mapInstance) return clickLngLat;

    const snapped = snapPositionToMarkedLine(
      clickLngLat,
      getMarkedLines(),
      (position) => mapInstance.project(position)
    );
    return snapped ?? clickLngLat;
  };

  const placeSignFromClick = (clickLngLat: Position) => {
    const tool = activeToolRef.current;
    if (!isSignTool(tool)) return;

    closedSignsRef.current = [
      ...closedSignsRef.current,
      {
        id: crypto.randomUUID(),
        coordinates: getSnappedSignPosition(clickLngLat),
        kind: SIGN_TOOL_ICON[tool]
      }
    ];
    actionHistoryRef.current.push({ type: 'add', category: 'closed-sign' });
    syncClosedSources();
  };

  const finishActiveManualLine = () => {
    activeManualLineIdRef.current = null;
  };

  const getSnappedPoint = (clickedPosition: Position): Position => {
    const mapInstance = map.current;
    if (!mapInstance) return clickedPosition;

    const clickedPx = mapInstance.project(clickedPosition);
    let bestPoint: Position | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const tryEndpoint = (endpoint: Position) => {
      const endpointPx = mapInstance.project(endpoint);
      const distance = Math.hypot(endpointPx.x - clickedPx.x, endpointPx.y - clickedPx.y);
      if (distance > SNAP_ENDPOINT_DISTANCE_PX) return;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPoint = endpoint;
      }
    };

    const tryFeatureEndpoints = (feature: GeoJSON.Feature<GeoJSON.LineString> | null | undefined) => {
      if (!feature) return;
      const coordinates = feature.geometry.coordinates as Position[];
      if (coordinates.length === 0) return;
      tryEndpoint(coordinates[0]);
      if (coordinates.length > 1) {
        tryEndpoint(coordinates[coordinates.length - 1]);
      }
    };

    const tryManualLine = (line: ManualLine) => {
      if (line.points.length === 0) return;
      tryEndpoint(line.points[0]);
      if (line.points.length > 1) {
        tryEndpoint(line.points[line.points.length - 1]);
      }
    };

    Array.from(roadCacheRef.current.values()).forEach(tryFeatureEndpoints);
    closedRoadFeaturesRef.current.forEach(tryFeatureEndpoints);
    reducedRoadFeaturesRef.current.forEach(tryFeatureEndpoints);
    pedestrianFeaturesRef.current.forEach(tryFeatureEndpoints);
    detourFeaturesRef.current.forEach(tryFeatureEndpoints);
    manualLinesRef.current.forEach(tryManualLine);

    if (!bestPoint) return clickedPosition;
    return [bestPoint[0], bestPoint[1]];
  };

  const getOrCreateActiveManualLine = (color: string, startPoint: Position): ManualLine => {
    const activeId = activeManualLineIdRef.current;
    if (activeId) {
      const existing = manualLinesRef.current.find((line) => line.id === activeId);
      if (existing) return existing;
    }

    const nextLine: ManualLine = {
      id: crypto.randomUUID(),
      color,
      points: [startPoint]
    };
    manualLinesRef.current = [...manualLinesRef.current, nextLine];
    activeManualLineIdRef.current = nextLine.id;
    return nextLine;
  };

  const appendPointToActiveManualLine = (point: Position, color: string): string => {
    const activeLine = getOrCreateActiveManualLine(color, point);
    const nextLines = manualLinesRef.current.map((line) => {
      if (line.id !== activeLine.id) return line;
      // Avoid duplicate points when snapping to same endpoint repeatedly.
      const lastPoint = line.points[line.points.length - 1];
      if (lastPoint && lastPoint[0] === point[0] && lastPoint[1] === point[1]) {
        return line;
      }
      return { ...line, points: [...line.points, point] };
    });
    manualLinesRef.current = nextLines;
    return activeLine.id;
  };

  const syncManualLinesSource = () => {
    const manualFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = manualLinesRef.current
      .filter((line) => line.points.length >= 2)
      .map((line) => ({
        type: 'Feature',
        properties: {
          id: line.id,
          color: line.color,
          kind: 'manual-line'
        },
        geometry: {
          type: 'LineString',
          coordinates: line.points
        }
      }));

    updateSourceData('manual-lines-source', {
      type: 'FeatureCollection',
      features: manualFeatures
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  const removeManualLineById = (lineId: string): ManualLine | null => {
    const line = manualLinesRef.current.find((item) => item.id === lineId) ?? null;
    if (!line) return null;
    manualLinesRef.current = manualLinesRef.current.filter((item) => item.id !== lineId);
    if (activeManualLineIdRef.current === lineId) {
      activeManualLineIdRef.current = null;
    }
    return line;
  };

  const undoManualLineAdd = (lineId: string) => {
    const line = manualLinesRef.current.find((item) => item.id === lineId);
    if (!line) return;

    const isLineActive = activeManualLineIdRef.current === lineId;
    if (!isLineActive) {
      manualLinesRef.current = manualLinesRef.current.filter((item) => item.id !== lineId);
      return;
    }

    if (line.points.length <= 1) {
      manualLinesRef.current = manualLinesRef.current.filter((item) => item.id !== lineId);
      activeManualLineIdRef.current = null;
      return;
    }

    manualLinesRef.current = manualLinesRef.current.map((item) =>
      item.id === lineId ? { ...item, points: item.points.slice(0, -1) } : item
    );
  };

  const updateSourceData = (sourceId: string, data: FeatureCollection) => {
    const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
  };

  const loadArrowAssets = async (mapInstance: maplibregl.Map) => {
    await Promise.all(
      Object.entries(ARROW_ICON_PATHS).map(([iconId, assetPath]) => {
        return new Promise<void>((resolve) => {
          if (mapInstance.hasImage(iconId)) {
            resolve();
            return;
          }

          const img = new Image();
          img.src = assetPath;
          img.crossOrigin = 'anonymous';

          img.onload = () => {
            if (!mapInstance.hasImage(iconId)) {
              mapInstance.addImage(iconId, img);
            }
            resolve();
          };

          img.onerror = () => {
            console.error('Klarte ikke laste pil-ikon:', assetPath);
            resolve();
          };
        });
      })
    );
  };

  const loadSignAssets = async (mapInstance: maplibregl.Map) => {
    const entries = Object.entries(SIGN_ASSET_PATHS) as Array<[SignKind, string]>;

    await Promise.all(
      entries.map(([signId, assetPath]) => {
        return new Promise<void>((resolve) => {
          if (mapInstance.hasImage(signId)) {
            resolve();
            return;
          }

          const img = new Image();
          img.src = assetPath;
          img.crossOrigin = 'anonymous';

          img.onload = () => {
            const targetHeight = CLOSED_SIGN_PNG_BASE_SIZE;
            const nw = img.naturalWidth || 1;
            const nh = img.naturalHeight || 1;
            const aspectRatio = nw / nh;
            img.width = targetHeight * aspectRatio;
            img.height = targetHeight;

            signImageCacheRef.current[signId] = img;
            if (!mapInstance.hasImage(signId)) {
              mapInstance.addImage(signId, img);
            }
            resolve();
          };

          img.onerror = () => {
            console.error('Klarte ikke laste bilde-filen:', assetPath);
            resolve();
          };
        });
      })
    );
  };

  const removeAllAnnotationMarkers = () => {
    for (const marker of Object.values(markersRef.current)) {
      marker.remove();
    }
    markersRef.current = {};
  };

  const syncAnnotationMarkersById = (nextAnnotations: Annotation[]) => {
    if (!map.current) return;
    const markerMap = markersRef.current;
    const nextIds = new Set(nextAnnotations.map((annotation) => annotation.id));

    for (const [id, marker] of Object.entries(markerMap)) {
      if (!nextIds.has(id)) {
        marker.remove();
        delete markerMap[id];
      }
    }

    for (const annotation of nextAnnotations) {
      if (markerMap[annotation.id]) continue;
      let dragOccurred = false;
      let suppressClickUntil = 0;
      const box = document.createElement('div');
      box.dataset.annotationId = annotation.id;
      box.style.position = 'relative';
      const wrapTextLines = (text: string, maxCharsPerLine = 30): string[] => {
        const paragraphs = text.split('\n');
        const wrapped: string[] = [];
        for (const paragraph of paragraphs) {
          const words = paragraph.trim().length > 0 ? paragraph.trim().split(/\s+/) : [''];
          let currentLine = '';
          for (const word of words) {
            if (!currentLine) {
              currentLine = word;
              continue;
            }
            const candidate = `${currentLine} ${word}`;
            if (candidate.length <= maxCharsPerLine) {
              currentLine = candidate;
            } else {
              wrapped.push(currentLine);
              currentLine = word;
            }
          }
          wrapped.push(currentLine);
        }
        return wrapped.length > 0 ? wrapped : [''];
      };
      const wrappedLines = wrapTextLines(annotation.text, 30);
      const textBody = document.createElement('div');
      textBody.dataset.role = 'annotation-text-body';
      textBody.textContent = wrappedLines.join('\n');
      textBody.style.whiteSpace = 'pre-wrap';
      textBody.style.textAlign = 'center';
      textBody.style.lineHeight = '1';
      textBody.style.width = '100%';
      textBody.style.height = '100%';

      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'center';
      box.style.maxWidth = `${Math.max(250, annotation.size * 15)}px`;
      box.style.background = 'transparent';
      box.style.border = 'none';
      box.style.borderRadius = '0';
      box.style.padding = '0';
      box.style.pointerEvents = 'auto';
      box.style.cursor = 'move';
      box.style.userSelect = 'none';
      box.style.width = 'fit-content';
      box.style.height = 'fit-content';
      box.style.zIndex = '100';
      box.appendChild(textBody);

      const marker = new maplibregl.Marker({
        element: box,
        draggable: true,
        anchor: 'center',
        rotationAlignment: 'viewport',
        rotation: annotation.rotation
      })
        .setLngLat(annotation.coordinates)
        .addTo(map.current);

      box.addEventListener('click', (event) => {
        if (dragOccurred) return;
        if (Date.now() < suppressClickUntil) return;
        if (map.current?.isEasing()) return;
        event.stopPropagation();
        skipNextMapClickRef.current = true;
        setEditingAnnotationId(null);
        window.setTimeout(() => {
          setEditingAnnotationId(annotation.id);
        }, 0);
      });

      marker.on('dragstart', () => {
        dragOccurred = true;
        suppressClickUntil = Date.now() + 10000;
        map.current?.dragPan.disable();
        draggingAnnotationIdRef.current = annotation.id;
        closeAnnotationPopup();
        if (map.current) map.current.getCanvas().style.cursor = 'grabbing';
      });

      marker.on('dragend', () => {
        map.current?.dragPan.enable();
        draggingAnnotationIdRef.current = null;
        suppressClickUntil = Date.now() + 250;
        const dragged = marker.getLngLat();
        const coordinates: Position = [dragged.lng, dragged.lat];
        setAnnotations((prev) =>
          prev.map((item) =>
            item.id === annotation.id
              ? { ...item, coordinates }
              : item
          )
        );
        const current = annotationsRef.current.find((item) => item.id === annotation.id);
        if (current) {
          onEditingAnnotationChange({
            ...current,
            coordinates
          });
        }
        if (map.current) {
          map.current.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
        }
        window.setTimeout(() => {
          dragOccurred = false;
        }, 200);
      });

      markerMap[annotation.id] = marker;
    }
  };

  const updateAnnotationMarkers = (nextAnnotations: Annotation[]) => {
    const wrapTextLines = (text: string, maxCharsPerLine = 30): string[] => {
      const paragraphs = text.split('\n');
      const wrapped: string[] = [];
      for (const paragraph of paragraphs) {
        const words = paragraph.trim().length > 0 ? paragraph.trim().split(/\s+/) : [''];
        let currentLine = '';
        for (const word of words) {
          if (!currentLine) {
            currentLine = word;
            continue;
          }
          const candidate = `${currentLine} ${word}`;
          if (candidate.length <= maxCharsPerLine) {
            currentLine = candidate;
          } else {
            wrapped.push(currentLine);
            currentLine = word;
          }
        }
        wrapped.push(currentLine);
      }
      return wrapped.length > 0 ? wrapped : [''];
    };

    for (const annotation of nextAnnotations) {
      const marker = markersRef.current[annotation.id];
      if (!marker) continue;
      const box = marker.getElement();
      const textBody = box.querySelector('[data-role="annotation-text-body"]') as HTMLDivElement | null;
      if (textBody) {
        textBody.textContent = wrapTextLines(annotation.text, 30).join('\n');
      }
      box.style.fontSize = `${annotation.size}px`;
      box.style.fontFamily = 'Arial, sans-serif';
      box.style.fontWeight = annotation.backgroundStyle === 'white' ? 'normal' : 'bold';
      box.style.maxWidth = `${Math.max(250, annotation.size * 15)}px`;
      marker.setRotation(annotation.rotation);
      if (annotation.backgroundStyle === 'white') {
        box.style.background = '#ffffff';
        box.style.border = '2px solid #000000';
        box.style.borderRadius = '6px';
        box.style.padding = '5px 10px';
        box.style.color = '#111827';
      } else if (annotation.backgroundStyle === 'green') {
        box.style.background = ANNOTATION_EURO_GREEN;
        box.style.border = '1px solid #ffffff';
        box.style.borderRadius = '2px';
        box.style.padding = '5px 10px';
        box.style.color = '#ffffff';
      } else {
        box.style.background = 'transparent';
        box.style.border = 'none';
        box.style.borderRadius = '0';
        box.style.padding = '0';
        box.style.color = '#111827';
      }
      if (draggingAnnotationIdRef.current !== annotation.id) {
        marker.setLngLat(annotation.coordinates);
      }
    }
  };

  const closeAnnotationPopup = () => {
    annotationPopupRef.current?.remove();
    annotationPopupRef.current = null;
  };

  const getPopupPlacement = (coordinates: Position): { anchor: 'bottom' | 'top'; offset: [number, number] } => {
    const mapInstance = map.current;
    if (!mapInstance) return { anchor: 'bottom', offset: [0, -80] };
    const projected = mapInstance.project(coordinates);
    const mapHeight = mapInstance.getContainer().clientHeight;
    if (projected.y > mapHeight / 2) {
      return { anchor: 'bottom', offset: [0, -80] };
    }
    return { anchor: 'top', offset: [0, 80] };
  };

  const clearAllDrawings = () => {
    manualLinesRef.current = [];
    activeManualLineIdRef.current = null;
    detourFeaturesRef.current = [];
    closedRoadFeaturesRef.current = [];
    reducedRoadFeaturesRef.current = [];
    pedestrianFeaturesRef.current = [];
    closedSignsRef.current = [];
    lineArrowsRef.current = [];
    actionHistoryRef.current = [];
    lastEditingAnnotationSentRef.current = null;
    setEditingAnnotationId(null);
    setAnnotations([]);
    updateSourceData('closed-road', emptyFeatureCollection());
    updateSourceData('reduced-road', emptyFeatureCollection());
    updateSourceData('pedestrian-road', emptyFeatureCollection());
    updateSourceData('detour-road', emptyFeatureCollection());
    updateSourceData('manual-lines-source', emptyFeatureCollection());
    updateSourceData('closed-signs', emptyFeatureCollection());
    updateSourceData('line-arrows-source', emptyFeatureCollection());
    updateSourceData('annotations-source', emptyFeatureCollection());
    removeAllAnnotationMarkers();
    closeAnnotationPopup();
    clearStretchSelection();
    setLegendLabels(DEFAULT_LEGEND_LABELS);
    setLegendRenderVersion((prev) => prev + 1);
  };

  const syncStretchPreview = (features: GeoJSON.Feature<GeoJSON.LineString>[]) => {
    if (!map.current?.getSource('stretch-preview-source')) return;
    updateSourceData('stretch-preview-source', {
      type: 'FeatureCollection',
      features
    });
  };

  const syncStretchAnchorMarker = (anchor: StretchAnchor | null) => {
    if (!map.current?.getSource('stretch-anchor-source')) return;
    updateSourceData('stretch-anchor-source', {
      type: 'FeatureCollection',
      features: anchor
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Point',
                coordinates: anchor.coordinates
              }
            }
          ]
        : []
    });
  };

  const showStretchError = (message: string) => {
    setStretchError(message);
    if (stretchErrorTimeoutRef.current) {
      window.clearTimeout(stretchErrorTimeoutRef.current);
    }
    stretchErrorTimeoutRef.current = window.setTimeout(() => {
      setStretchError(null);
      stretchErrorTimeoutRef.current = null;
    }, 4000);
  };

  const clearStretchSelection = () => {
    stretchAnchorRef.current = null;
    setStretchError(null);
    if (stretchErrorTimeoutRef.current) {
      window.clearTimeout(stretchErrorTimeoutRef.current);
      stretchErrorTimeoutRef.current = null;
    }
    syncStretchPreview([]);
    syncStretchAnchorMarker(null);
    const mapInstance = map.current;
    if (mapInstance?.getLayer('nvdb-hover-layer')) {
      mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0);
    }
  };

  const getMarkedFeaturesForTool = (
    tool: 'closed' | 'reduced' | 'pedestrian' | 'detour'
  ): GeoJSON.Feature<GeoJSON.LineString>[] => {
    if (tool === 'closed') return closedRoadFeaturesRef.current;
    if (tool === 'reduced') return reducedRoadFeaturesRef.current;
    if (tool === 'pedestrian') return pedestrianFeaturesRef.current;
    return detourFeaturesRef.current;
  };

  const getRoadLabel = (properties: GeoJSON.GeoJsonProperties | null | undefined) => {
    if (!properties) return 'Ukjent veg';
    const props = properties as Record<string, unknown>;

    if (typeof props.vegkategori === 'string' && typeof props.nummer === 'number') {
      return `${props.vegkategori} ${props.nummer}`;
    }

    if (typeof props.vegsystemreferanse === 'string') return props.vegsystemreferanse;

    if (props.vegsystemreferanse && typeof props.vegsystemreferanse === 'object') {
      const ref = props.vegsystemreferanse as Record<string, unknown>;
      if (typeof ref.kortform === 'string') return ref.kortform;
    }

    if (typeof props.vegnummer === 'string') return props.vegnummer;
    return 'Ukjent veg';
  };

  const addRoadSegmentsBatch = (
    segments: GeoJSON.Feature<GeoJSON.LineString>[],
    tool: 'closed' | 'reduced' | 'pedestrian' | 'detour'
  ): number => {
    const markedFeatures = getMarkedFeaturesForTool(tool);
    const kind =
      tool === 'closed'
        ? 'closed-road'
        : tool === 'reduced'
          ? 'reduced-road'
          : tool === 'pedestrian'
            ? 'pedestrian-road'
            : 'detour-road';
    const category: SegmentToolCategory =
      tool === 'closed'
        ? 'closed-segment'
        : tool === 'reduced'
          ? 'reduced-segment'
          : tool === 'pedestrian'
            ? 'pedestrian-segment'
            : 'detour-segment';

    const newFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    const uuids: string[] = [];

    for (const segment of segments) {
      if (isAlreadyMarked(segment, markedFeatures)) continue;
      const coordinates = segment.geometry.coordinates as Position[];
      if (coordinates.length < 2) continue;

      const roadLabel = getRoadLabel(segment.properties);
      const roadId = getSegmentRoadId(segment) ?? getFeatureRoadId(segment);
      const uuid = crypto.randomUUID();
      uuids.push(uuid);
      newFeatures.push({
        type: 'Feature',
        properties: {
          kind,
          roadLabel,
          roadId,
          uuid
        },
        geometry: { type: 'LineString', coordinates }
      });
    }

    if (newFeatures.length === 0) return 0;

    if (tool === 'closed') {
      closedRoadFeaturesRef.current = [...closedRoadFeaturesRef.current, ...newFeatures];
      actionHistoryRef.current.push({ type: 'add-batch', category, uuids });
      syncClosedSources();
    } else if (tool === 'reduced') {
      reducedRoadFeaturesRef.current = [...reducedRoadFeaturesRef.current, ...newFeatures];
      actionHistoryRef.current.push({ type: 'add-batch', category, uuids });
      syncReducedSource();
    } else if (tool === 'pedestrian') {
      pedestrianFeaturesRef.current = [...pedestrianFeaturesRef.current, ...newFeatures];
      actionHistoryRef.current.push({ type: 'add-batch', category, uuids });
      syncPedestrianSource();
    } else {
      detourFeaturesRef.current = [...detourFeaturesRef.current, ...newFeatures];
      actionHistoryRef.current.push({ type: 'add-batch', category, uuids });
      syncDetourSource();
    }

    return newFeatures.length;
  };

  const handleStretchSelectClick = (
    clickedFeature: GeoJSON.Feature<GeoJSON.LineString>,
    clickLngLat: Position
  ): boolean => {
    const tool = activeToolRef.current;
    if (!isRoadSegmentTool(tool)) return false;

    const veglenkesekvensId = getVeglenkesekvensId(clickedFeature);
    const positionResult = getPositionOnSegment(clickLngLat, clickedFeature);
    if (!veglenkesekvensId || !positionResult) return false;

    const anchor: StretchAnchor = {
      veglenkesekvensId,
      position: positionResult.position,
      coordinates: positionResult.coordinates
    };

    const existingAnchor = stretchAnchorRef.current;
    if (!existingAnchor) {
      stretchAnchorRef.current = anchor;
      syncStretchAnchorMarker(anchor);
      return true;
    }

    if (existingAnchor.veglenkesekvensId !== veglenkesekvensId) {
      showStretchError('Velg et punkt på samme vei som startpunktet.');
      clearStretchSelection();
      return true;
    }

    const segments = selectSegmentsInRange(
      roadCacheRef.current.values(),
      veglenkesekvensId,
      existingAnchor.position,
      anchor.position
    );
    addRoadSegmentsBatch(segments, tool);
    clearStretchSelection();
    return true;
  };

  useEffect(() => {
    stretchSelectEnabledRef.current = stretchSelectEnabled;
    if (!stretchSelectEnabled) {
      clearStretchSelection();
    }
  }, [stretchSelectEnabled]);

  useEffect(() => {
    if (!isRoadSegmentTool(activeTool)) {
      clearStretchSelection();
    }
  }, [activeTool]);

  const syncDetourSource = () => {
    updateSourceData('detour-road', {
      type: 'FeatureCollection',
      features: detourFeaturesRef.current
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  const syncClosedSources = () => {
    const signFeatures: GeoJSON.Feature<GeoJSON.Point>[] = closedSignsRef.current.map((s) => ({
      type: 'Feature',
      properties: { id: s.id, kind: s.kind } as GeoJSON.GeoJsonProperties,
      geometry: { type: 'Point', coordinates: s.coordinates }
    })) as GeoJSON.Feature<GeoJSON.Point>[];

    updateSourceData('closed-road', {
      type: 'FeatureCollection',
      features: closedRoadFeaturesRef.current
    });
    updateSourceData('closed-signs', {
      type: 'FeatureCollection',
      features: signFeatures
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  const syncReducedSource = () => {
    updateSourceData('reduced-road', {
      type: 'FeatureCollection',
      features: reducedRoadFeaturesRef.current
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  const syncPedestrianSource = () => {
    updateSourceData('pedestrian-road', {
      type: 'FeatureCollection',
      features: pedestrianFeaturesRef.current
    });
    setLegendRenderVersion((prev) => prev + 1);
  };

  /** Oppdater alle egne GeoJSON-kilder fra refs / annotasjons-state (etter ny stil). */
  const syncAllData = () => {
    syncClosedSources();
    syncReducedSource();
    syncPedestrianSource();
    syncDetourSource();
    syncManualLinesSource();
    syncLineArrowsSource();
    if (roadCacheRef.current.size > 0) {
      updateSourceData('nvdb-source', {
        type: 'FeatureCollection',
        features: Array.from(roadCacheRef.current.values())
      });
    }
    const annotationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = annotationsRef.current.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        text: annotation.text,
        size: annotation.size,
        rotation: annotation.rotation,
        backgroundStyle: annotation.backgroundStyle
      },
      geometry: {
        type: 'Point',
        coordinates: annotation.coordinates
      }
    }));
    updateSourceData('annotations-source', {
      type: 'FeatureCollection',
      features: annotationFeatures
    });
  };

  /**
   * Slår tekst og symboler i bakgrunnskartet av og på. Endrer bare synligheten
   * på eksisterende lag, slik at tegninger og NVDB-data blir stående urørt.
   */
  const applyLabelVisibility = (mapInstance: maplibregl.Map) => {
    const groups: Array<[string[], boolean]> = [
      [PLACE_LABEL_LAYER_IDS, showPlaceLabelsRef.current],
      [ROAD_LABEL_LAYER_IDS, showRoadLabelsRef.current]
    ];

    for (const [layerIds, visible] of groups) {
      for (const layerId of layerIds) {
        if (!mapInstance.getLayer(layerId)) continue;
        mapInstance.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
  };

  const initializeMapLayers = async (mapInstance: maplibregl.Map) => {
    const overlayLayerIds = [
      'annotations-bg-white',
      'annotations-bg-green',
      'annotations-layer',
      'closed-sign-layer',
      'line-arrows-layer',
      'manual-line-fill',
      'manual-line-outline',
      'detour-road-layer',
      'detour-road-casing-layer',
      'pedestrian-road-fill',
      'pedestrian-road-outline',
      'reduced-road-fill',
      'reduced-road-outline',
      'closed-road-fill',
      'closed-road-outline',
      'nvdb-hover-layer',
      'stretch-preview-layer',
      'stretch-anchor-layer',
      'nvdb-hitbox',
      'nvdb-layer'
    ];
    const overlaySourceIds = [
      'annotations-source',
      'closed-signs',
      'detour-road',
      'pedestrian-road',
      'reduced-road',
      'closed-road',
      'manual-lines-source',
      'line-arrows-source',
      'stretch-preview-source',
      'stretch-anchor-source',
      'nvdb-source'
    ];

    for (const id of overlayLayerIds) {
      if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    }
    for (const sid of overlaySourceIds) {
      if (mapInstance.getSource(sid)) mapInstance.removeSource(sid);
    }
    if (mapInstance.hasImage('stengt-skilt')) mapInstance.removeImage('stengt-skilt');
    if (mapInstance.hasImage('lyskryss-skilt')) mapInstance.removeImage('lyskryss-skilt');
    if (mapInstance.hasImage('veiarbeid-skilt')) mapInstance.removeImage('veiarbeid-skilt');
    if (mapInstance.hasImage('ko-skilt')) mapInstance.removeImage('ko-skilt');
    if (mapInstance.hasImage('annotation-bg-box')) mapInstance.removeImage('annotation-bg-box');
    if (mapInstance.hasImage('annotation-green-box')) mapInstance.removeImage('annotation-green-box');
    if (mapInstance.hasImage('annotation-bg-green')) mapInstance.removeImage('annotation-bg-green');
    for (const iconId of Object.keys(ARROW_ICON_PATHS)) {
      if (mapInstance.hasImage(iconId)) mapInstance.removeImage(iconId);
    }

    await loadSignAssets(mapInstance);
    await loadArrowAssets(mapInstance);
    const annotationBgImage = drawAnnotationBackgroundBox();
    if (annotationBgImage) mapInstance.addImage('annotation-bg-box', annotationBgImage);
    const annotationGreenBoxImage = drawGreenBox();
    if (annotationGreenBoxImage) mapInstance.addImage('annotation-green-box', annotationGreenBoxImage);

    mapInstance.addSource('closed-road', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('nvdb-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('detour-road', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('reduced-road', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('pedestrian-road', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('closed-signs', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('annotations-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('manual-lines-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('line-arrows-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('stretch-preview-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('stretch-anchor-source', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addLayer({
      id: 'nvdb-layer',
      type: 'line',
      source: 'nvdb-source',
      minzoom: NVDB_MIN_ZOOM,
      paint: {
        'line-color': '#94a3b8',
        'line-width': 2,
        'line-opacity': 0.6
      }
    });

    mapInstance.addLayer({
      id: 'nvdb-hitbox',
      type: 'line',
      source: 'nvdb-source',
      minzoom: NVDB_MIN_ZOOM,
      paint: {
        'line-color': '#000000',
        'line-width': 20,
        'line-opacity': 0
      }
    });

    mapInstance.addLayer({
      id: 'nvdb-hover-layer',
      type: 'line',
      source: 'nvdb-source',
      minzoom: NVDB_MIN_ZOOM,
      paint: {
        'line-color': '#64748b',
        'line-width': 6,
        'line-opacity': 0
      },
      filter: ['==', ['id'], '']
    });

    mapInstance.setLayerZoomRange('nvdb-hover-layer', NVDB_MIN_ZOOM, 24);
    mapInstance.moveLayer('nvdb-hitbox');

    mapInstance.on('mousemove', 'nvdb-hitbox', (event) => {
      const feature = event.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
      if (!feature || feature.geometry.type !== 'LineString') return;

      const anchor = stretchAnchorRef.current;
      if (anchor && stretchSelectEnabledRef.current && isRoadSegmentTool(activeToolRef.current)) {
        const hoverLngLat: Position = [event.lngLat.lng, event.lngLat.lat];
        const veglenkesekvensId = getVeglenkesekvensId(feature);
        const positionResult = getPositionOnSegment(hoverLngLat, feature);

        if (
          veglenkesekvensId &&
          positionResult &&
          veglenkesekvensId === anchor.veglenkesekvensId
        ) {
          const previewSegments = selectSegmentsInRange(
            roadCacheRef.current.values(),
            veglenkesekvensId,
            anchor.position,
            positionResult.position
          );
          syncStretchPreview(previewSegments);
        } else {
          syncStretchPreview([]);
        }

        mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0);
        return;
      }

      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const hoverId =
        props.roadId ??
        props.veglenkesekvensid ??
        props.id ??
        props.objectid ??
        props.veglenkeid;

      if (hoverId === undefined || hoverId === null) {
        mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0);
      } else {
        mapInstance.setFilter('nvdb-hover-layer', ['==', ['to-string', ['get', 'veglenkesekvensid']], String(hoverId)]);
        mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0.95);
      }
    });

    mapInstance.addLayer({
      id: 'stretch-preview-layer',
      type: 'line',
      source: 'stretch-preview-source',
      minzoom: NVDB_MIN_ZOOM,
      paint: {
        'line-color': '#2563eb',
        'line-width': 8,
        'line-opacity': 0.55
      }
    });

    mapInstance.addLayer({
      id: 'stretch-anchor-layer',
      type: 'circle',
      source: 'stretch-anchor-source',
      minzoom: NVDB_MIN_ZOOM,
      paint: {
        'circle-radius': 7,
        'circle-color': '#2563eb',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2
      }
    });

    mapInstance.addLayer({
      id: 'closed-road-outline',
      type: 'line',
      source: 'closed-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.closedRoadOutline,
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'reduced-road-outline',
      type: 'line',
      source: 'reduced-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.reducedRoadOutline,
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'pedestrian-road-outline',
      type: 'line',
      source: 'pedestrian-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.pedestrianOutline,
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'detour-road-casing-layer',
      type: 'line',
      source: 'detour-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.detourOutline,
        'line-width': 9,
        'line-opacity': 0.9
      }
    });

    mapInstance.addLayer({
      id: 'manual-line-outline',
      type: 'line',
      source: 'manual-lines-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': [
          'match',
          ['get', 'color'],
          SVV_COLORS.closedRoad,
          SVV_COLORS.closedRoadOutline,
          SVV_COLORS.reducedRoad,
          SVV_COLORS.reducedRoadOutline,
          SVV_COLORS.pedestrian,
          SVV_COLORS.pedestrianOutline,
          SVV_COLORS.detour,
          SVV_COLORS.detourOutline,
          '#374151'
        ],
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'closed-road-fill',
      type: 'line',
      source: 'closed-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.closedRoad,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'reduced-road-fill',
      type: 'line',
      source: 'reduced-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.reducedRoad,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'pedestrian-road-fill',
      type: 'line',
      source: 'pedestrian-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.pedestrian,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'detour-road-layer',
      type: 'line',
      source: 'detour-road',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': SVV_COLORS.detour,
        'line-width': 5
      }
    });

    mapInstance.addLayer({
      id: 'manual-line-fill',
      type: 'line',
      source: 'manual-lines-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#111111'],
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'line-arrows-layer',
      type: 'symbol',
      source: 'line-arrows-source',
      layout: {
        'icon-image': ['get', 'iconKind'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.1, 16, 0.16, 19, 0.22],
        'icon-rotate': [
          'case',
          ['==', ['get', 'direction'], 'reverse'],
          ['+', ['coalesce', ['get', 'bearing'], 0], 180],
          ['coalesce', ['get', 'bearing'], 0]
        ],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });

    mapInstance.addLayer({
      id: 'annotations-layer',
      type: 'symbol',
      source: 'annotations-source',
      layout: {
        'text-field': ['get', 'text'],
        'text-font': [
          'case',
          ['==', ['get', 'backgroundStyle'], 'white'],
          ['literal', ['Arial Unicode MS Regular']],
          ['literal', ['Arial Unicode MS Bold']]
        ],
        'text-size': ['get', 'size'],
        'text-rotate': ['get', 'rotation'],
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.5,
        'text-justify': 'auto',
        'text-line-height': 1
      },
      paint: {
        'text-color': [
          'case',
          ['==', ['get', 'backgroundStyle'], 'green'],
          '#ffffff',
          '#111827'
        ],
        'text-halo-color': '#ffffff',
        'text-halo-width': ['case', ['==', ['get', 'backgroundStyle'], 'green'], 0, 2],
        'text-halo-blur': ['case', ['==', ['get', 'backgroundStyle'], 'green'], 0, 0.5]
      }
    });
    mapInstance.addLayer({
      id: 'annotations-bg-green',
      type: 'symbol',
      source: 'annotations-source',
      filter: ['==', ['get', 'backgroundStyle'], 'green'],
      layout: {
        'icon-image': 'annotation-green-box',
        'icon-size': 1,
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [8, 12, 8, 12],
        'icon-allow-overlap': true,
        'icon-rotate': ['get', 'rotation'],
        'text-field': ['get', 'text'],
        'text-size': ['get', 'size'],
        'text-font': ['literal', ['Arial Unicode MS Bold']],
        'text-rotate': ['get', 'rotation'],
        'text-max-width': 100,
        'text-line-height': 1,
        'text-allow-overlap': true
      },
      paint: {
        'text-opacity': 0
      }
    }, 'annotations-layer');
    mapInstance.addLayer({
      id: 'annotations-bg-white',
      type: 'symbol',
      source: 'annotations-source',
      filter: ['==', ['get', 'backgroundStyle'], 'white'],
      layout: {
        'icon-image': 'annotation-bg-box',
        'icon-size': 1,
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [4, 10, 4, 10],
        'icon-allow-overlap': true,
        'icon-rotate': ['get', 'rotation'],
        'text-field': ['get', 'text'],
        'text-size': ['get', 'size'],
        'text-font': ['literal', ['Arial Unicode MS Regular']],
        'text-rotate': ['get', 'rotation'],
        'text-max-width': 100,
        'text-line-height': 1,
        'text-allow-overlap': true
      },
      paint: {
        'text-opacity': 0
      }
    }, 'annotations-layer');
    mapInstance.setLayoutProperty('annotations-layer', 'visibility', 'none');
    mapInstance.setLayoutProperty('annotations-bg-white', 'visibility', 'none');
    mapInstance.setLayoutProperty('annotations-bg-green', 'visibility', 'none');

    mapInstance.addLayer({
      id: 'closed-sign-layer',
      type: 'symbol',
      source: 'closed-signs',
      layout: {
        'icon-image': ['get', 'kind'],
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, 0.20,
          16, 0.35,
          19, 0.55
        ],
        'icon-pitch-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      },
      paint: {
        'icon-halo-color': '#ffffff',
        'icon-halo-width': 1
      }
    });

    mapInstance.on('mouseleave', 'nvdb-hitbox', () => {
      mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0);
      if (stretchAnchorRef.current) {
        syncStretchPreview([]);
      }
    });
  };

  const undoLastAction = () => {
    const lastAction = actionHistoryRef.current.pop();
    if (!lastAction) return;

    if (lastAction.type === 'add') {
      if (lastAction.category === 'closed-segment') {
        closedRoadFeaturesRef.current = closedRoadFeaturesRef.current.slice(0, -1);
        syncClosedSources();
        return;
      }

      if (lastAction.category === 'closed-sign') {
        closedSignsRef.current = closedSignsRef.current.slice(0, -1);
        syncClosedSources();
        return;
      }

      if (lastAction.category === 'detour-segment') {
        detourFeaturesRef.current = detourFeaturesRef.current.slice(0, -1);
        syncDetourSource();
        return;
      }

      if (lastAction.category === 'manual-line') {
        undoManualLineAdd(lastAction.id);
        syncManualLinesSource();
        return;
      }

      if (lastAction.category === 'reduced-segment') {
        reducedRoadFeaturesRef.current = reducedRoadFeaturesRef.current.slice(0, -1);
        syncReducedSource();
        return;
      }

      if (lastAction.category === 'pedestrian-segment') {
        pedestrianFeaturesRef.current = pedestrianFeaturesRef.current.slice(0, -1);
        syncPedestrianSource();
        return;
      }

      if (lastAction.category === 'annotation') {
        setAnnotations((prev) => {
          const next = prev.slice(0, -1);
          if (editingAnnotationId && !next.some((item) => item.id === editingAnnotationId)) {
            setEditingAnnotationId(null);
          }
          return next;
        });
        return;
      }

      if (lastAction.category === 'line-arrow') {
        lineArrowsRef.current = lineArrowsRef.current.slice(0, -1);
        syncLineArrowsSource();
        return;
      }
    }

    if (lastAction.type === 'add-batch') {
      const removeByUuids = (features: GeoJSON.Feature<GeoJSON.LineString>[]) =>
        features.filter(
          (feature) =>
            !lastAction.uuids.includes(
              String((feature.properties as Record<string, unknown> | null | undefined)?.uuid ?? '')
            )
        );

      if (lastAction.category === 'closed-segment') {
        closedRoadFeaturesRef.current = removeByUuids(closedRoadFeaturesRef.current);
        syncClosedSources();
        return;
      }

      if (lastAction.category === 'reduced-segment') {
        reducedRoadFeaturesRef.current = removeByUuids(reducedRoadFeaturesRef.current);
        syncReducedSource();
        return;
      }

      if (lastAction.category === 'pedestrian-segment') {
        pedestrianFeaturesRef.current = removeByUuids(pedestrianFeaturesRef.current);
        syncPedestrianSource();
        return;
      }

      if (lastAction.category === 'detour-segment') {
        detourFeaturesRef.current = removeByUuids(detourFeaturesRef.current);
        syncDetourSource();
      }
    }

    if (lastAction.type === 'delete') {
      if (lastAction.category === 'closed-sign') {
        closedSignsRef.current = [...closedSignsRef.current, lastAction.data];
        syncClosedSources();
        return;
      }

      if (lastAction.category === 'closed-segment') {
        closedRoadFeaturesRef.current = [...closedRoadFeaturesRef.current, lastAction.data];
        syncClosedSources();
        return;
      }

      if (lastAction.category === 'reduced-segment') {
        reducedRoadFeaturesRef.current = [...reducedRoadFeaturesRef.current, lastAction.data];
        syncReducedSource();
        return;
      }

      if (lastAction.category === 'pedestrian-segment') {
        pedestrianFeaturesRef.current = [...pedestrianFeaturesRef.current, lastAction.data];
        syncPedestrianSource();
        return;
      }

      if (lastAction.category === 'detour-segment') {
        detourFeaturesRef.current = [...detourFeaturesRef.current, lastAction.data];
        syncDetourSource();
        return;
      }

      if (lastAction.category === 'manual-line') {
        manualLinesRef.current = [...manualLinesRef.current, lastAction.data];
        syncManualLinesSource();
        return;
      }

      if (lastAction.category === 'line-arrow') {
        lineArrowsRef.current = [...lineArrowsRef.current, lastAction.data];
        syncLineArrowsSource();
      }
    }
  };

  const fetchNvdbRoadNetwork = async () => {
    if (!map.current) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const zoom = map.current.getZoom();
      setShowZoomHint(zoom < NVDB_MIN_ZOOM);
      if (zoom < NVDB_MIN_ZOOM) {
        updateSourceData('nvdb-source', emptyFeatureCollection());
        lastFetchedBboxRef.current = null;
        return;
      }

      const bounds = map.current.getBounds();
      const bbox = [
        bounds.getWest().toFixed(5),
        bounds.getSouth().toFixed(5),
        bounds.getEast().toFixed(5),
        bounds.getNorth().toFixed(5)
      ].join(',');
      if (bbox === lastFetchedBboxRef.current) return;
      lastFetchedBboxRef.current = bbox;

      const url = `${NVDB_BASE_URL}/vegnett/veglenkesekvenser/segmentert?kartutsnitt=${bbox}&srid=4326&antall=1500`;
      const response = await fetch(url, {
        headers: {
          'X-Client': 'eirnat-kartverktøy-frontend',
          'Accept': 'application/vnd.vegvesen.nvdb-v4+json',
          'Access-Control-Request-Private-Network': 'true'
        }
      });

      if (!response.ok) return;
      const payload = await response.json();
      const data = toGeoJsonFeatureCollection(payload);

      let addedAny = false;
      data.features.forEach((feature) => {
        if (feature.geometry.type !== 'LineString') return;
        const props = (feature.properties as Record<string, unknown> | null | undefined) ?? {};
        const roadId = `${String(props.veglenkesekvensid ?? feature.id ?? 'unknown')}_${String(props.startposisjon ?? '0')}`;
        if (roadCacheRef.current.has(roadId)) return;

        addedAny = true;
        const correctedFeature: GeoJSON.Feature<GeoJSON.LineString> = {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: feature.geometry.coordinates.map((coordinate) => {
              const pair = coordinate as [number, number];
              return [pair[1], pair[0]];
            })
          }
        };
        roadCacheRef.current.set(roadId, correctedFeature);
      });

      if (addedAny) {
        updateSourceData('nvdb-source', {
          type: 'FeatureCollection',
          features: Array.from(roadCacheRef.current.values())
        });
      }
    } catch (error) {
      console.error('Frontend NVDB feil:', error);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const isPosition = (value: unknown): value is Position => {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      Number.isFinite(Number(value[0])) &&
      Number.isFinite(Number(value[1]))
    );
  };

  const normalizeLineFeatures = (
    value: unknown,
    kind: 'closed-road' | 'reduced-road' | 'pedestrian-road' | 'detour-road'
  ): GeoJSON.Feature<GeoJSON.LineString>[] => {
    if (!Array.isArray(value)) return [];
    const normalized: GeoJSON.Feature<GeoJSON.LineString>[] = [];

    for (const item of value) {
      const feature = item as {
        type?: string;
        properties?: Record<string, unknown> | null;
        geometry?: { type?: string; coordinates?: unknown[] };
      };
      if (feature?.type !== 'Feature') continue;
      if (feature.geometry?.type !== 'LineString' || !Array.isArray(feature.geometry.coordinates)) continue;

      const coordinates = feature.geometry.coordinates
        .filter((coordinate): coordinate is Position => isPosition(coordinate))
        .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])] as Position);
      if (coordinates.length < 2) continue;

      const properties = feature.properties && typeof feature.properties === 'object'
        ? feature.properties
        : {};

      normalized.push({
        type: 'Feature',
        properties: {
          ...properties,
          kind,
          uuid:
            typeof properties.uuid === 'string' && properties.uuid.length > 0
              ? properties.uuid
              : crypto.randomUUID()
        },
        geometry: {
          type: 'LineString',
          coordinates
        }
      });
    }
    return normalized;
  };

  const normalizeSigns = (value: unknown): SignPlacement[] => {
    if (!Array.isArray(value)) return [];
    const validKinds: SignKind[] = ['stengt-skilt', 'lyskryss-skilt', 'veiarbeid-skilt', 'ko-skilt'];
    return value.flatMap((item) => {
      const sign = item as { id?: unknown; coordinates?: unknown; kind?: unknown };
      if (!isPosition(sign?.coordinates)) return [];
      if (typeof sign?.kind !== 'string' || !validKinds.includes(sign.kind as SignKind)) return [];
      return [{
        id: typeof sign.id === 'string' && sign.id.length > 0 ? sign.id : crypto.randomUUID(),
        coordinates: [Number(sign.coordinates[0]), Number(sign.coordinates[1])] as Position,
        kind: sign.kind as SignKind
      }];
    });
  };

  const normalizeAnnotations = (value: unknown): Annotation[] => {
    if (!Array.isArray(value)) return [];
    const validStyles: AnnotationBackgroundStyle[] = ['none', 'white', 'green'];
    return value.flatMap((item) => {
      const annotation = item as Partial<Annotation>;
      if (typeof annotation?.text !== 'string') return [];
      if (!isPosition(annotation.coordinates)) return [];
      const rawSize = Number(annotation.size);
      const size = Number.isFinite(rawSize) ? rawSize : 25;
      const rotation = Number(annotation.rotation);
      if (!Number.isFinite(rotation)) return [];
      const backgroundStyle =
        typeof annotation.backgroundStyle === 'string' && validStyles.includes(annotation.backgroundStyle)
          ? annotation.backgroundStyle
          : 'white';

      return [{
        id: typeof annotation.id === 'string' && annotation.id.length > 0 ? annotation.id : crypto.randomUUID(),
        text: annotation.text,
        size,
        rotation,
        coordinates: [Number(annotation.coordinates[0]), Number(annotation.coordinates[1])] as Position,
        backgroundStyle
      }];
    });
  };

  const normalizeManualLinePoints = (value: unknown): Position[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((coordinate): coordinate is Position => isPosition(coordinate))
      .map((coordinate) => [Number(coordinate[0]), Number(coordinate[1])] as Position);
  };

  const normalizeManualLines = (value: unknown): ManualLine[] => {
    if (!Array.isArray(value)) return [];
    const normalized: ManualLine[] = [];
    value.forEach((item) => {
      const line = item as { id?: unknown; color?: unknown; points?: unknown };
      if (typeof line?.color !== 'string') return;
      const points = normalizeManualLinePoints(line.points);
      if (points.length === 0) return;
      normalized.push({
        id: typeof line.id === 'string' && line.id.length > 0 ? line.id : crypto.randomUUID(),
        color: toCurrentPaletteColor(line.color),
        points
      });
    });
    return normalized;
  };

  const normalizeLegacyPointsAsSingleSegment = (value: unknown): Position[] => {
    if (!Array.isArray(value)) return [];
    return value
      .filter((point): point is Position => isPosition(point))
      .map((point) => [Number(point[0]), Number(point[1])] as Position);
  };

  const legacySegmentsToManualLines = (segments: Position[][], color: string): ManualLine[] => {
    return segments
      .filter((segment) => segment.length > 0)
      .map((segment) => ({
        id: crypto.randomUUID(),
        color,
        points: segment
      }));
  };

  const exportMapData = () => {
    const mapInstance = map.current;
    const center = mapInstance?.getCenter();
    const projectData: MapProjectData = {
      version: 1,
      savedAt: new Date().toISOString(),
      view: center
        ? {
            center: [center.lng, center.lat],
            zoom: mapInstance?.getZoom() ?? 9.5
          }
        : null,
      closedSigns: closedSignsRef.current,
      closedRoadFeatures: closedRoadFeaturesRef.current,
      reducedRoadFeatures: reducedRoadFeaturesRef.current,
      pedestrianFeatures: pedestrianFeaturesRef.current,
      detourFeatures: detourFeaturesRef.current,
      manualLines: manualLinesRef.current,
      annotations: annotationsRef.current,
      legendLabels: legendLabelsRef.current,
      lineArrows: lineArrowsRef.current
    };

    const fileDate = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `veiarbeidskart_${fileDate}.json`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const importMapData = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as Partial<MapProjectData> & Record<string, unknown>;

      const nextClosedSigns = normalizeSigns(parsed.closedSigns);
      const nextClosedRoadFeatures = normalizeLineFeatures(parsed.closedRoadFeatures, 'closed-road');
      const nextReducedRoadFeatures = normalizeLineFeatures(parsed.reducedRoadFeatures, 'reduced-road');
      const nextPedestrianFeatures = normalizeLineFeatures(parsed.pedestrianFeatures, 'pedestrian-road');
      const nextDetourFeatures = normalizeLineFeatures(parsed.detourFeatures, 'detour-road');
      const nextManualLines = normalizeManualLines(parsed.manualLines);
      const closedLegacySegments = Array.isArray(parsed.closedManualSegments)
        ? parsed.closedManualSegments.map((segment) => normalizeManualLinePoints(segment))
        : [];
      const reducedLegacySegments = Array.isArray(parsed.reducedManualSegments)
        ? parsed.reducedManualSegments.map((segment) => normalizeManualLinePoints(segment))
        : [];
      const pedestrianLegacySegments = Array.isArray(parsed.pedestrianManualSegments)
        ? parsed.pedestrianManualSegments.map((segment) => normalizeManualLinePoints(segment))
        : [];
      const detourLegacySegments = Array.isArray(parsed.detourManualSegments)
        ? parsed.detourManualSegments.map((segment) => normalizeManualLinePoints(segment))
        : [];
      const detourLegacyPoints = normalizeLegacyPointsAsSingleSegment(parsed.detourPoints);
      const nextAnnotations = normalizeAnnotations(parsed.annotations);
      const parsedLegendLabels = parsed.legendLabels;
      const nextLegendLabels: Record<LegendId, string> = {
        ...DEFAULT_LEGEND_LABELS,
        ...(parsedLegendLabels && typeof parsedLegendLabels === 'object'
          ? Object.fromEntries(
              (Object.keys(DEFAULT_LEGEND_LABELS) as LegendId[])
                .filter(
                  (id) =>
                    typeof parsedLegendLabels[id] === 'string' &&
                    parsedLegendLabels[id]!.trim().length > 0
                )
                .map((id) => [id, parsedLegendLabels[id]!.trim()])
            )
          : {})
      };

      closedSignsRef.current = nextClosedSigns;
      closedRoadFeaturesRef.current = nextClosedRoadFeatures;
      reducedRoadFeaturesRef.current = nextReducedRoadFeatures;
      pedestrianFeaturesRef.current = nextPedestrianFeatures;
      detourFeaturesRef.current = nextDetourFeatures;
      lineArrowsRef.current = normalizeLineArrows(parsed.lineArrows);
      manualLinesRef.current =
        nextManualLines.length > 0
          ? nextManualLines
          : [
              ...legacySegmentsToManualLines(closedLegacySegments, SVV_COLORS.closedRoad),
              ...legacySegmentsToManualLines(reducedLegacySegments, SVV_COLORS.reducedRoad),
              ...legacySegmentsToManualLines(pedestrianLegacySegments, SVV_COLORS.pedestrian),
              ...legacySegmentsToManualLines(detourLegacySegments, SVV_COLORS.detour),
              ...(detourLegacyPoints.length > 0
                ? [{ id: crypto.randomUUID(), color: SVV_COLORS.detour, points: detourLegacyPoints }]
                : [])
            ];
      activeManualLineIdRef.current = null;
      actionHistoryRef.current = [];
      lastEditingAnnotationSentRef.current = null;
      setEditingAnnotationId(null);
      onEditingAnnotationChange(null);
      setAnnotations(nextAnnotations);
      setLegendLabels(nextLegendLabels);

      syncClosedSources();
      syncReducedSource();
      syncPedestrianSource();
      syncDetourSource();
      syncManualLinesSource();
      syncLineArrowsSource();

      const view = parsed.view as { center?: unknown; zoom?: unknown } | undefined;
      if (view && isPosition(view.center) && Number.isFinite(Number(view.zoom)) && map.current) {
        map.current.flyTo({
          center: [Number(view.center[0]), Number(view.center[1])],
          zoom: Number(view.zoom),
          essential: true
        });
      }
    } catch {
      window.alert('Klarte ikke å åpne prosjektfilen. Kontroller at filen er gyldig JSON.');
    }
  };

  const handleProjectFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void importMapData(file);
    event.target.value = '';
  };

  const hideAnnotationMarkers = () => {
    for (const marker of Object.values(markersRef.current)) {
      marker.getElement().style.visibility = 'hidden';
    }
  };

  const showAnnotationMarkers = () => {
    for (const marker of Object.values(markersRef.current)) {
      marker.getElement().style.visibility = '';
    }
  };

  const buildExportVectorData = (): ExportVectorData => {
    const mapInstance = map.current;
    const zoom = mapInstance?.getZoom() ?? 16;
    const signScale = getSignIconScale(zoom);
    const arrowScale = getArrowIconScale(zoom);

    const addFeatureLines = (
      features: GeoJSON.Feature<GeoJSON.LineString>[],
      color: string
    ) =>
      features.map((feature) => ({
        coordinates: feature.geometry.coordinates as [number, number][],
        color,
        outlineColor: getOutlineColorForLineColor(color)
      }));

    const lines = [
      ...addFeatureLines(closedRoadFeaturesRef.current, SVV_COLORS.closedRoad),
      ...addFeatureLines(reducedRoadFeaturesRef.current, SVV_COLORS.reducedRoad),
      ...addFeatureLines(pedestrianFeaturesRef.current, SVV_COLORS.pedestrian),
      ...addFeatureLines(detourFeaturesRef.current, SVV_COLORS.detour),
      ...manualLinesRef.current
        .filter((line) => line.points.length >= 2)
        .map((line) => ({
          coordinates: line.points,
          color: line.color,
          outlineColor: getOutlineColorForLineColor(line.color)
        }))
    ];

    const signs = closedSignsRef.current.map((sign) => {
      const cached = signImageCacheRef.current[sign.kind];
      const naturalWidth = cached?.naturalWidth || SIGN_BASE_HEIGHT;
      const naturalHeight = cached?.naturalHeight || SIGN_BASE_HEIGHT;
      const aspectRatio = naturalWidth / naturalHeight;
      const height = SIGN_BASE_HEIGHT * signScale;
      return {
        coordinates: sign.coordinates,
        assetPath: SIGN_ASSET_PATHS[sign.kind],
        width: height * aspectRatio,
        height
      };
    });

    const arrows = lineArrowsRef.current.map((arrow) => {
      const iconKind = getArrowIconKind(arrow.lineColor, arrow.direction);
      const assetPath = iconKind ? ARROW_ICON_PATHS[iconKind] : ARROW_ICON_PATHS['pil-en-roed'];
      const size = SIGN_BASE_HEIGHT * arrowScale;
      return {
        coordinates: arrow.coordinates,
        bearing: arrow.direction === 'reverse' ? arrow.bearing + 180 : arrow.bearing,
        assetPath,
        width: size,
        height: size
      };
    });

    const hasClosed =
      closedRoadFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.closedRoad && line.points.length >= 2);
    const hasReduced =
      reducedRoadFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.reducedRoad && line.points.length >= 2);
    const hasPedestrian =
      pedestrianFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.pedestrian && line.points.length >= 2);
    const hasDetour =
      detourFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.detour && line.points.length >= 2);

    const legendRows = getActiveLegendRows(
      hasClosed,
      hasReduced,
      hasPedestrian,
      hasDetour,
      legendLabelsRef.current
    );

    return {
      lines,
      signs,
      arrows,
      annotations: annotationsRef.current.map((annotation) => ({
        text: annotation.text,
        size: annotation.size,
        rotation: annotation.rotation,
        coordinates: annotation.coordinates,
        backgroundStyle: annotation.backgroundStyle
      })),
      legendRows,
      showLegend
    };
  };

  useImperativeHandle(ref, () => ({
    exportMap: async (options: ExportOptions) => {
      const mapInstance = map.current;
      const container = mapContainer.current;
      if (!mapInstance || !container) return;

      await runMapExport({
        mapInstance,
        mapContainer: container,
        vectorData: buildExportVectorData(),
        options,
        onPrepare: fetchNvdbRoadNetwork,
        hideAnnotationMarkers,
        showAnnotationMarkers
      });
    },
    exportMapData,
    openProject: () => {
      projectFileInputRef.current?.click();
    }
  }));

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const mapOptions = {
      container: mapContainer.current,
      style: buildKartStyle(process.env.NEXT_PUBLIC_MAPTILER_KEY ?? ''),
      center: [5.32, 60.39], // Bergen
      zoom: 9.5,
      preserveDrawingBuffer: true,
      crossOrigin: 'anonymous',
      canvasContextAttributes: {
        preserveDrawingBuffer: true
      }
    } as maplibregl.MapOptions & {
      preserveDrawingBuffer?: boolean;
      crossOrigin?: string;
    };

    map.current = new maplibregl.Map(mapOptions);
    map.current.on('style.load', () => {
      if (!map.current) return;
      applyLabelVisibility(map.current);
    });

    const geocodingControl = new GeocodingControl({
      apiKey: process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '',
      language: 'no',
      country: 'no'
    });
    map.current.addControl(geocodingControl, 'top-left');

    map.current.on('click', (event) => {
      if (skipNextMapClickRef.current) {
        skipNextMapClickRef.current = false;
        return;
      }
      const mapInstance = map.current;
      if (!mapInstance) return;

      if (editingAnnotationIdRef.current) {
        setEditingAnnotationId(null);
      }

      const clickLngLat: Position = [event.lngLat.lng, event.lngLat.lat];

      const slettbareLag = [
        'line-arrows-layer',
        'closed-sign-layer',
        'closed-road-fill',
        'reduced-road-fill',
        'pedestrian-road-fill',
        'detour-road-layer',
        'manual-line-fill'
      ];
      const eksisterendeLag = slettbareLag.filter((id) => mapInstance.getLayer(id));
      const features =
        eksisterendeLag.length > 0
          ? mapInstance.queryRenderedFeatures(event.point, { layers: eksisterendeLag })
          : [];

      if (features.length > 0) {
        const feature = features[0];
        const layerId = feature.layer.id;
        const properties = (feature.properties ?? {}) as Record<string, unknown>;

        if (layerId === 'line-arrows-layer') {
          const targetId = typeof properties.id === 'string' ? properties.id : null;
          if (targetId) {
            const deletedArrow = lineArrowsRef.current.find((arrow) => arrow.id === targetId);
            if (deletedArrow) {
              actionHistoryRef.current.push({
                type: 'delete',
                category: 'line-arrow',
                data: deletedArrow
              });
            }
            lineArrowsRef.current = lineArrowsRef.current.filter((arrow) => arrow.id !== targetId);
            syncLineArrowsSource();
          }
          return;
        }

        if (layerId === 'closed-sign-layer') {
          const targetId = typeof properties.id === 'string' ? properties.id : null;
          if (targetId) {
            const deletedSign = closedSignsRef.current.find((sign) => sign.id === targetId);
            if (deletedSign) {
              actionHistoryRef.current.push({ type: 'delete', category: 'closed-sign', data: deletedSign });
            }
            closedSignsRef.current = closedSignsRef.current.filter((sign) => sign.id !== targetId);
            syncClosedSources();
          }
          return;
        }

        if (isSignTool(activeToolRef.current) && MARKED_LINE_LAYERS.has(layerId)) {
          placeSignFromClick(clickLngLat);
          return;
        } else if (lineDirectionRef.current !== 'none' && addLineArrowAtClick(clickLngLat)) {
          return;
        } else if (layerId === 'manual-line-fill') {
          const manualLineId = typeof properties.id === 'string' ? properties.id : null;
          if (manualLineId) {
            const deletedManualLine = removeManualLineById(manualLineId);
            if (deletedManualLine) {
              actionHistoryRef.current.push({
                type: 'delete',
                category: 'manual-line',
                data: deletedManualLine
              });
              syncManualLinesSource();
            }
          }
        } else {
          const targetUuid = typeof properties.uuid === 'string' ? properties.uuid : null;
          if (targetUuid) {
            if (layerId === 'closed-road-fill') {
              const deletedSegment = closedRoadFeaturesRef.current.find(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid === targetUuid
              );
              if (deletedSegment) {
                actionHistoryRef.current.push({
                  type: 'delete',
                  category: 'closed-segment',
                  data: deletedSegment
                });
              }
              closedRoadFeaturesRef.current = closedRoadFeaturesRef.current.filter(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid !== targetUuid
              );
              syncClosedSources();
            } else if (layerId === 'reduced-road-fill') {
              const deletedSegment = reducedRoadFeaturesRef.current.find(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid === targetUuid
              );
              if (deletedSegment) {
                actionHistoryRef.current.push({
                  type: 'delete',
                  category: 'reduced-segment',
                  data: deletedSegment
                });
              }
              reducedRoadFeaturesRef.current = reducedRoadFeaturesRef.current.filter(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid !== targetUuid
              );
              syncReducedSource();
            } else if (layerId === 'pedestrian-road-fill') {
              const deletedSegment = pedestrianFeaturesRef.current.find(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid === targetUuid
              );
              if (deletedSegment) {
                actionHistoryRef.current.push({
                  type: 'delete',
                  category: 'pedestrian-segment',
                  data: deletedSegment
                });
              }
              pedestrianFeaturesRef.current = pedestrianFeaturesRef.current.filter(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid !== targetUuid
              );
              syncPedestrianSource();
            } else if (layerId === 'detour-road-layer') {
              const deletedSegment = detourFeaturesRef.current.find(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid === targetUuid
              );
              if (deletedSegment) {
                actionHistoryRef.current.push({
                  type: 'delete',
                  category: 'detour-segment',
                  data: deletedSegment
                });
              }
              detourFeaturesRef.current = detourFeaturesRef.current.filter(
                (feat) => (feat.properties as Record<string, unknown> | null | undefined)?.uuid !== targetUuid
              );
              syncDetourSource();
            }
          }
        }
        console.log('Element slettet');
        return;
      }

      if (addLineArrowAtClick(clickLngLat)) return;

      const nvdbLag = ['nvdb-hitbox'].filter((id) => mapInstance.getLayer(id));
      const nvdbFeatures =
        nvdbLag.length > 0
          ? mapInstance.queryRenderedFeatures(event.point, { layers: nvdbLag })
          : [];
      const roadToolActive = isRoadSegmentTool(activeToolRef.current);

      if (
        stretchSelectEnabledRef.current &&
        !isManualModeRef.current &&
        roadToolActive
      ) {
        if (nvdbFeatures.length > 0) {
          const clickedFeature = nvdbFeatures[0] as GeoJSON.Feature<GeoJSON.LineString>;
          if (clickedFeature.geometry.type === 'LineString') {
            handleStretchSelectClick(clickedFeature, clickLngLat);
          }
        } else if (stretchAnchorRef.current) {
          clearStretchSelection();
        }
        return;
      }

      if (
        nvdbFeatures.length > 0 &&
        !isManualModeRef.current &&
        roadToolActive
      ) {
        const clickedFeature = nvdbFeatures[0] as GeoJSON.Feature<GeoJSON.LineString>;
        if (clickedFeature.geometry.type !== 'LineString') return;

        const coordinates = clickedFeature.geometry.coordinates as Position[];
        if (coordinates.length < 2) return;

        const roadLabel = getRoadLabel(clickedFeature.properties);
        const roadId = getFeatureRoadId(clickedFeature);
        const uuid = crypto.randomUUID();

        if (activeToolRef.current === 'closed') {
          closedRoadFeaturesRef.current = [
            ...closedRoadFeaturesRef.current,
            {
              type: 'Feature',
              properties: {
                kind: 'closed-road',
                roadLabel,
                roadId,
                uuid
              },
              geometry: { type: 'LineString', coordinates }
            }
          ];
          actionHistoryRef.current.push({ type: 'add', category: 'closed-segment' });
          syncClosedSources();
          return;
        }

        if (activeToolRef.current === 'reduced') {
          reducedRoadFeaturesRef.current = [
            ...reducedRoadFeaturesRef.current,
            {
              type: 'Feature',
              properties: {
                kind: 'reduced-road',
                roadLabel,
                roadId,
                uuid
              },
              geometry: { type: 'LineString', coordinates }
            }
          ];
          actionHistoryRef.current.push({ type: 'add', category: 'reduced-segment' });
          syncReducedSource();
          return;
        }

        if (activeToolRef.current === 'pedestrian') {
          pedestrianFeaturesRef.current = [
            ...pedestrianFeaturesRef.current,
            {
              type: 'Feature',
              properties: {
                kind: 'pedestrian-road',
                roadLabel,
                roadId,
                uuid
              },
              geometry: { type: 'LineString', coordinates }
            }
          ];
          actionHistoryRef.current.push({ type: 'add', category: 'pedestrian-segment' });
          syncPedestrianSource();
          return;
        }

        detourFeaturesRef.current = [
          ...detourFeaturesRef.current,
          {
            type: 'Feature',
            properties: {
              kind: 'detour-road',
              roadLabel,
              roadId,
              uuid
            },
            geometry: { type: 'LineString', coordinates }
          }
        ];
        actionHistoryRef.current.push({ type: 'add', category: 'detour-segment' });
        syncDetourSource();
        return;
      }

      const clickedPosition: Position = [event.lngLat.lng, event.lngLat.lat];
      console.log('Map click:', event.lngLat);
      console.log('Klikk registrert på kart med verktøy:', activeToolRef.current);

      if (activeToolRef.current === 'text') {
        const newId = crypto.randomUUID();
        actionHistoryRef.current.push({ type: 'add', category: 'annotation' });
        setAnnotations((prev) => [
          ...prev,
          {
            id: newId,
            text: 'Ny tekst',
            size: 25,
            rotation: 0,
            coordinates: clickedPosition,
            backgroundStyle: 'white'
          }
        ]);
        setEditingAnnotationId(newId);
        onTextAnnotationCreated();
        return;
      }

      if (isSignTool(activeToolRef.current)) {
        placeSignFromClick(clickedPosition);
        return;
      }

      if (isManualModeRef.current) {
        const selectedColor = getManualColorForTool(activeToolRef.current);
        if (!selectedColor) return;

        const snappedPosition = getSnappedPoint(clickedPosition);
        const activeManualLine = activeManualLineIdRef.current
          ? manualLinesRef.current.find((line) => line.id === activeManualLineIdRef.current)
          : null;

        if (!activeManualLine || activeManualLine.color !== selectedColor) {
          finishActiveManualLine();
        }

        const lineId = appendPointToActiveManualLine(snappedPosition, selectedColor);
        actionHistoryRef.current.push({ type: 'add', category: 'manual-line', id: lineId });
        syncManualLinesSource();
      }
    });

    map.current.on('mousemove', (event) => {
      const mapInstance = map.current;
      if (!mapInstance) return;
      const slettbareLag = [
        'line-arrows-layer',
        'closed-sign-layer',
        'closed-road-fill',
        'reduced-road-fill',
        'pedestrian-road-fill',
        'detour-road-layer',
        'manual-line-fill'
      ];
      const eksisterendeLag = slettbareLag.filter((id) => mapInstance.getLayer(id));
      const features =
        eksisterendeLag.length > 0
          ? mapInstance.queryRenderedFeatures(event.point, { layers: eksisterendeLag })
          : [];
      if (features.length > 0) {
        mapInstance.getCanvas().style.cursor = 'pointer';
        return;
      }
      mapInstance.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
    });

    map.current.once('load', async () => {
      if (!map.current) return;
      map.current.on('styleimagemissing', async (e) => {
        const id = e.id;
        if (!(id in SIGN_ASSET_PATHS) && !(id in ARROW_ICON_PATHS)) return;
        const m = map.current;
        if (!m) return;
        await loadSignAssets(m);
        await loadArrowAssets(m);
        m.triggerRepaint();
      });
      await initializeMapLayers(map.current);
      syncAllData();
      void fetchNvdbRoadNetwork();
    });

    map.current.on('moveend', () => {
      if (moveDebounceRef.current) window.clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = window.setTimeout(() => {
        void fetchNvdbRoadNetwork();
      }, 500);
    });

    const handleEscapeResetManualSegments = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      finishActiveManualLine();
      if (stretchAnchorRef.current) {
        clearStretchSelection();
      }
    };
    window.addEventListener('keydown', handleEscapeResetManualSegments);

    return () => {
      if (moveDebounceRef.current) window.clearTimeout(moveDebounceRef.current);
      window.removeEventListener('keydown', handleEscapeResetManualSegments);
      closeAnnotationPopup();
      removeAllAnnotationMarkers();
      map.current?.removeControl(geocodingControl);
      map.current?.remove();
      map.current = null;
    };
    // Kart instansieres én gang.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stilen bygges lokalt og endres ikke
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    applyLabelVisibility(instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leser gjeldende verdier via refs
  }, [showPlaceLabels, showRoadLabels]);

  useEffect(() => {
    if (!map.current) return;
    const cursor = activeTool === 'none' ? '' : 'crosshair';
    map.current.getCanvas().style.cursor = cursor;
  }, [activeTool]);

  useEffect(() => {
    if (!map.current) return;
    if (!editingAnnotationId) {
      closeAnnotationPopup();
      return;
    }

    const selected = annotationsRef.current.find((annotation) => annotation.id === editingAnnotationId);
    if (!selected) {
      closeAnnotationPopup();
      return;
    }

    const container = document.createElement('div');
    container.style.minWidth = '230px';
    container.style.backgroundColor = '#ffffff';
    container.style.borderRadius = '12px';
    container.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.18)';
    container.style.padding = '12px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.style.color = '#1f2937';
    container.style.pointerEvents = 'auto';
    container.addEventListener('mousedown', (event) => event.stopPropagation());
    container.addEventListener('click', (event) => event.stopPropagation());
    container.addEventListener('wheel', (event) => event.stopPropagation());

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = selected.text;
    textInput.placeholder = 'Skriv tekst...';
    textInput.style.width = '100%';
    textInput.style.border = '1px solid #cbd5e1';
    textInput.style.borderRadius = '8px';
    textInput.style.padding = '8px 10px';
    textInput.style.fontSize = '14px';
    textInput.style.marginBottom = '10px';
    textInput.style.outline = 'none';
    textInput.style.fontFamily = 'Arial, sans-serif';
    textInput.addEventListener('focus', () => {
      textInput.select();
    });
    textInput.addEventListener('input', () => {
      const nextText = textInput.value;
      setAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.id === selected.id
            ? { ...annotation, text: nextText }
            : annotation
        )
      );
    });
    container.appendChild(textInput);

    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = `Størrelse: ${selected.size}`;
    sizeLabel.style.display = 'block';
    sizeLabel.style.fontSize = '12px';
    sizeLabel.style.marginBottom = '4px';
    container.appendChild(sizeLabel);

    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = '10';
    sizeInput.max = '40';
    sizeInput.value = String(selected.size);
    sizeInput.style.width = '100%';
    sizeInput.style.marginBottom = '10px';
    sizeInput.addEventListener('input', () => {
      const nextSize = Number(sizeInput.value);
      sizeLabel.textContent = `Størrelse: ${nextSize}`;
      setAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.id === selected.id
            ? { ...annotation, size: nextSize }
            : annotation
        )
      );
    });
    container.appendChild(sizeInput);

    const backgroundTitle = document.createElement('div');
    backgroundTitle.textContent = 'Bakgrunn';
    backgroundTitle.style.fontSize = '12px';
    backgroundTitle.style.fontWeight = '600';
    backgroundTitle.style.marginBottom = '6px';
    container.appendChild(backgroundTitle);

    const styleRow = document.createElement('div');
    styleRow.style.display = 'flex';
    styleRow.style.flexWrap = 'wrap';
    styleRow.style.gap = '6px';
    styleRow.style.marginBottom = '10px';

    const styleOptions: { key: AnnotationBackgroundStyle; label: string }[] = [
      { key: 'none', label: 'Ingen' },
      { key: 'white', label: 'Hvit boks' },
      { key: 'green', label: 'Europavei (Grønn)' }
    ];

    const styleButtons = new Map<AnnotationBackgroundStyle, HTMLButtonElement>();

    const applyStyleButtonChrome = (active: AnnotationBackgroundStyle) => {
      for (const { key } of styleOptions) {
        const btn = styleButtons.get(key);
        if (!btn) continue;
        const isOn = key === active;
        btn.style.border = isOn ? '2px solid #2563eb' : '1px solid #cbd5e1';
        btn.style.background = isOn ? '#eff6ff' : '#ffffff';
      }
    };
    for (const { key, label } of styleOptions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.flex = '1';
      btn.style.minWidth = '72px';
      btn.style.fontSize = '11px';
      btn.style.lineHeight = '1.2';
      btn.style.padding = '6px 6px';
      btn.style.borderRadius = '6px';
      btn.style.cursor = 'pointer';
      btn.style.fontFamily = 'Arial, sans-serif';
      btn.addEventListener('click', () => {
        setAnnotations((prev) =>
          prev.map((annotation) =>
            annotation.id === selected.id ? { ...annotation, backgroundStyle: key } : annotation
          )
        );
        applyStyleButtonChrome(key);
      });
      styleButtons.set(key, btn);
      styleRow.appendChild(btn);
    }
    applyStyleButtonChrome(selected.backgroundStyle);
    container.appendChild(styleRow);

    const rotationLabel = document.createElement('label');
    rotationLabel.textContent = `Rotasjon: ${selected.rotation}°`;
    rotationLabel.style.display = 'block';
    rotationLabel.style.fontSize = '12px';
    rotationLabel.style.marginBottom = '4px';
    container.appendChild(rotationLabel);

    const rotationInput = document.createElement('input');
    rotationInput.type = 'range';
    rotationInput.min = '-180';
    rotationInput.max = '180';
    rotationInput.step = '5';
    rotationInput.value = String(selected.rotation);
    rotationInput.style.width = '100%';
    rotationInput.style.marginBottom = '12px';
    rotationInput.addEventListener('input', () => {
      const nextRotation = Number(rotationInput.value);
      rotationLabel.textContent = `Rotasjon: ${nextRotation}°`;
      setAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.id === selected.id
            ? { ...annotation, rotation: nextRotation }
            : annotation
        )
      );
    });
    container.appendChild(rotationInput);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'space-between';
    actions.style.gap = '8px';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = '🗑 Slett';
    deleteBtn.style.flex = '1';
    deleteBtn.style.border = '1px solid #fecaca';
    deleteBtn.style.background = '#fff1f2';
    deleteBtn.style.color = '#b91c1c';
    deleteBtn.style.borderRadius = '8px';
    deleteBtn.style.padding = '8px 10px';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.style.fontWeight = '600';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.addEventListener('click', () => {
      setAnnotations((prev) => prev.filter((annotation) => annotation.id !== selected.id));
      setEditingAnnotationId(null);
    });
    actions.appendChild(deleteBtn);

    container.appendChild(actions);

    const popupPlacement = getPopupPlacement(selected.coordinates);
    closeAnnotationPopup();
    annotationPopupRef.current = new maplibregl.Popup({
      anchor: popupPlacement.anchor,
      closeButton: false,
      closeOnClick: false,
      offset: popupPlacement.offset
    })
      .setLngLat(selected.coordinates)
      .setDOMContent(container)
      .addTo(map.current);
    const popupElement = annotationPopupRef.current.getElement();
    popupElement.style.zIndex = '9999';
    popupElement.style.pointerEvents = 'auto';
    window.requestAnimationFrame(() => {
      textInput.focus();
      textInput.select();
    });
  }, [editingAnnotationId]);

  useEffect(() => {
    if (!editingAnnotationId) {
      lastEditingAnnotationSentRef.current = null;
      onEditingAnnotationChange(null);
      return;
    }
    const selected = annotations.find((annotation) => annotation.id === editingAnnotationId);
    if (!selected) {
      lastEditingAnnotationSentRef.current = null;
      onEditingAnnotationChange(null);
      return;
    }
    const next = {
      id: selected.id,
      text: selected.text,
      size: selected.size,
      rotation: selected.rotation,
      coordinates: selected.coordinates,
      backgroundStyle: selected.backgroundStyle
    };
    const last = lastEditingAnnotationSentRef.current;
    if (
      last &&
      last.id === next.id &&
      last.text === next.text &&
      last.size === next.size &&
      last.rotation === next.rotation &&
      last.coordinates[0] === next.coordinates[0] &&
      last.coordinates[1] === next.coordinates[1] &&
      last.backgroundStyle === next.backgroundStyle
    ) {
      return;
    }
    lastEditingAnnotationSentRef.current = next;
    onEditingAnnotationChange(next);
  }, [annotations, editingAnnotationId, onEditingAnnotationChange]);

  useEffect(() => {
    if (!editingAnnotation) return;
    setAnnotations((prev) => {
      let changed = false;
      const next = prev.map((annotation) => {
        if (annotation.id !== editingAnnotation.id) return annotation;
        if (
          annotation.text === editingAnnotation.text &&
          annotation.size === editingAnnotation.size &&
          annotation.rotation === editingAnnotation.rotation &&
          annotation.coordinates[0] === editingAnnotation.coordinates[0] &&
          annotation.coordinates[1] === editingAnnotation.coordinates[1] &&
          annotation.backgroundStyle === editingAnnotation.backgroundStyle
        ) {
          return annotation;
        }
        changed = true;
        return {
          ...annotation,
          text: editingAnnotation.text,
          size: editingAnnotation.size,
          rotation: editingAnnotation.rotation,
          coordinates: editingAnnotation.coordinates,
          backgroundStyle: editingAnnotation.backgroundStyle
        };
      });
      return changed ? next : prev;
    });
  }, [editingAnnotation]);

  useEffect(() => {
    if (!map.current) return;
    syncAnnotationMarkersById(annotationsRef.current);
  }, [annotationIdsKey]);

  useEffect(() => {
    if (!map.current) return;
    const annotationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = annotations.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        text: annotation.text,
        size: annotation.size,
        rotation: annotation.rotation,
        backgroundStyle: annotation.backgroundStyle
      },
      geometry: {
        type: 'Point',
        coordinates: annotation.coordinates
      }
    }));
    updateSourceData('annotations-source', {
      type: 'FeatureCollection',
      features: annotationFeatures
    });
    updateAnnotationMarkers(annotations);
    if (!editingAnnotationId) return;
    const selected = annotations.find((annotation) => annotation.id === editingAnnotationId);
    if (!selected) {
      setEditingAnnotationId(null);
      return;
    }
    const popupPlacement = getPopupPlacement(selected.coordinates);
    annotationPopupRef.current?.setOffset(popupPlacement.offset);
    annotationPopupRef.current?.setLngLat(selected.coordinates);
  }, [annotations]);

  const activeLegendRows = useMemo(() => {
    const hasClosed =
      closedRoadFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.closedRoad && line.points.length >= 2);
    const hasReduced =
      reducedRoadFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.reducedRoad && line.points.length >= 2);
    const hasPedestrian =
      pedestrianFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.pedestrian && line.points.length >= 2);
    const hasDetour =
      detourFeaturesRef.current.length > 0 ||
      manualLinesRef.current.some((line) => line.color === SVV_COLORS.detour && line.points.length >= 2);
    return getActiveLegendRows(
      hasClosed,
      hasReduced,
      hasPedestrian,
      hasDetour,
      legendLabels
    );
  }, [legendRenderVersion, legendLabels]);

  const handleLegendLabelChange = (id: LegendId, value: string) => {
    setLegendLabels((prev) => ({ ...prev, [id]: value }));
  };

  const handleLegendLabelBlur = (id: LegendId, value: string) => {
    const trimmed = value.trim();
    setLegendLabels((prev) => ({
      ...prev,
      [id]: trimmed.length > 0 ? trimmed : DEFAULT_LEGEND_LABELS[id]
    }));
  };

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center ${
        exportPreviewMode ? 'bg-slate-200' : ''
      }`}
    >
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleProjectFileSelected}
      />
      <div
        ref={mapContainer}
        className={`w-full ${
          exportPreviewMode ? 'aspect-[4/3] max-h-full shadow-lg ring-2 ring-blue-500/60' : 'h-full'
        }`}
      />
      {exportPreviewMode && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow">
          Eksportmodus 4:3 – juster utsnittet
        </div>
      )}
      {showLegend && activeLegendRows.length > 0 && (
        <div
          className="pointer-events-auto absolute bottom-10 left-4 w-[380px] rounded-md border-2 border-black bg-white p-2 shadow-lg"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          {activeLegendRows.map((row, index) => (
            <div
              key={row.id}
              className={`${index === 0 ? '' : 'mt-2 '}flex items-center gap-2 text-[18px] font-bold text-slate-800`}
            >
              <div className="relative h-2.5 w-16 shrink-0">
                <span
                  className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: row.casingColor }}
                />
                <span
                  className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: row.mainColor }}
                />
              </div>
              <input
                type="text"
                value={legendLabels[row.id]}
                onChange={(event) => handleLegendLabelChange(row.id, event.target.value)}
                onBlur={(event) => handleLegendLabelBlur(row.id, event.target.value)}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[18px] font-bold text-slate-800 outline-none focus:ring-0"
                aria-label={`Tegnforklaring for ${DEFAULT_LEGEND_LABELS[row.id]}`}
              />
            </div>
          ))}
        </div>
      )}
      {showZoomHint && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/70 px-3 py-2 text-sm text-white">
          Zoom inn for å se vegnett
        </div>
      )}
      {stretchError && (
        <div className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-md bg-red-600 px-3 py-2 text-sm text-white shadow-lg">
          {stretchError}
        </div>
      )}
    </div>
  );
});

export default KartMotor;