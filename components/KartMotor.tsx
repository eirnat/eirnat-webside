"use client";
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import 'maplibre-gl/dist/maplibre-gl.css';

const SVV_COLORS = {
  closedRoad: "#E60000", // SVV Rød
  closedRoadOutline: "#990000", // Mork rod casing
  reducedRoad: "#FF9900", // SVV Oransje
  reducedRoadOutline: "#B36B00", // Mork oransje casing
  detour: "#00B359",     // SVV Grønn
  detourOutline: "#005c31", // Mork gronn casing
  background: "#F5F5F5"
};

export type ActiveTool =
  | 'none'
  | 'closed'
  | 'reduced'
  | 'detour'
  | 'sign'
  | 'traffic-light'
  | 'road-work'
  | 'queue'
  | 'text';

type KartMotorProps = {
  mapStyle: 'dataviz' | 'streets';
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  editingAnnotation: { id: string; text: string; size: number; rotation: number; coordinates: Position; backgroundStyle: AnnotationBackgroundStyle } | null;
  onEditingAnnotationChange: (annotation: { id: string; text: string; size: number; rotation: number; coordinates: Position; backgroundStyle: AnnotationBackgroundStyle } | null) => void;
  showLegend: boolean;
  onTextAnnotationCreated: () => void;
};

  export type KartMotorHandle = {
  downloadAsPng: () => void;
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
type SignPlacement = { coordinates: Position; kind: SignKind };

type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry>;

const emptyFeatureCollection = (): FeatureCollection => ({
  type: 'FeatureCollection',
  features: []
});

/** NVDB-vegnett vises og hentes kun ved zoom >= dette nivået. */
const NVDB_MIN_ZOOM = 14;

/** Skjules midlertidig under PNG-eksport (grå referansevegnett). */
const NVDB_EXPORT_HIDE_LAYER_IDS = ['nvdb-layer', 'nvdb-hitbox', 'nvdb-hover-layer'] as const;

const buildMapTilerStyleUrl = (mapStyle: 'dataviz' | 'streets'): string => {
  const slug = mapStyle + (mapStyle === 'streets' ? '-v2' : '');
  return `https://api.maptiler.com/maps/${slug}/style.json?key=${process.env.NEXT_PUBLIC_MAPTILER_KEY}`;
};

const SIGN_ASSET_PATHS: Record<SignKind, string> = {
  'stengt-skilt': '/icons/stengtvei.svg',
  'lyskryss-skilt': '/icons/lyskryss.svg',
  'veiarbeid-skilt': '/icons/veiarbeid.svg',
  'ko-skilt': '/icons/trafikkork.svg'
};

/** Samme faktor som `icon-size` på closed-sign-layer (PNG-eksport bruker samme verdi). */
const CLOSED_SIGN_ICON_SIZE = 0.25;
/** Samme som normalisert bredde/høyde i loadSignAssets (px). */
const CLOSED_SIGN_PNG_BASE_SIZE = 128;

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
    payload && typeof payload === 'object' && 'objekter' in payload
      ? ((payload as { objekter?: unknown[] }).objekter ?? [])
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

const KartMotor = React.forwardRef<KartMotorHandle, KartMotorProps>(function KartMotor(
  { mapStyle, activeTool, onClear, onUndo, editingAnnotation, onEditingAnnotationChange, showLegend, onTextAnnotationCreated },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const activeToolRef = useRef<ActiveTool>('none');
  const detourPointsRef = useRef<Position[]>([]);
  const detourFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const closedRoadFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const reducedRoadFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  /** Manuelt plasserte skilt (no-entry), i kartets lng/lat */
  const closedSignsRef = useRef<SignPlacement[]>([]);
  const lastFetchedBboxRef = useRef<string | null>(null);
  const moveDebounceRef = useRef<number | null>(null);
  const skipNextMapClickRef = useRef(false);
  const actionHistoryRef = useRef<
    Array<'closed-segment' | 'reduced-segment' | 'closed-sign' | 'detour-segment' | 'detour-point' | 'annotation'>
  >([]);
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
  const editingAnnotationIdRef = useRef<string | null>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const annotationIdsKey = useMemo(
    () => annotations.map((annotation) => annotation.id).sort().join('|'),
    [annotations]
  );
  const mapStyleRef = useRef(mapStyle);

  const lastAppliedMapStyleRef = useRef<'dataviz' | 'streets' | null>(null);
  const styleLoadGenerationRef = useRef(0);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

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

  const updateSourceData = (sourceId: string, data: FeatureCollection) => {
    const source = map.current?.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    source?.setData(data);
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
      const box = document.createElement('div');
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
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      box.style.justifyContent = 'center';
      box.style.whiteSpace = 'pre-wrap';
      box.style.maxWidth = `${Math.max(250, annotation.size * 15)}px`;
      box.style.textAlign = 'center';
      box.style.lineHeight = '1';
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
      box.textContent = wrappedLines.join('\n');

      const marker = new maplibregl.Marker({
        element: box,
        draggable: true,
        anchor: 'center'
      })
        .setLngLat(annotation.coordinates)
        .addTo(map.current);

      box.addEventListener('click', (event) => {
        if (dragOccurred) return;
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
        map.current?.dragPan.disable();
        draggingAnnotationIdRef.current = annotation.id;
        setEditingAnnotationId((prev) => (prev === annotation.id ? prev : annotation.id));
        closeAnnotationPopup();
        if (map.current) map.current.getCanvas().style.cursor = 'grabbing';
      });

      marker.on('dragend', () => {
        map.current?.dragPan.enable();
        draggingAnnotationIdRef.current = null;
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
      box.textContent = wrapTextLines(annotation.text, 30).join('\n');
      box.style.fontSize = `${annotation.size}px`;
      box.style.fontFamily = 'Arial, sans-serif';
      box.style.fontWeight = annotation.backgroundStyle === 'white' ? 'normal' : 'bold';
      box.style.whiteSpace = 'pre-wrap';
      box.style.maxWidth = `${Math.max(250, annotation.size * 15)}px`;
      box.style.transform = `rotate(${annotation.rotation}deg)`;
      box.style.transformOrigin = 'center center';
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
    if (!mapInstance) return { anchor: 'bottom', offset: [0, -50] };
    const projected = mapInstance.project(coordinates);
    const mapHeight = mapInstance.getContainer().clientHeight;
    if (projected.y > mapHeight / 2) {
      return { anchor: 'bottom', offset: [0, -50] };
    }
    return { anchor: 'top', offset: [0, 50] };
  };

  const clearAllDrawings = () => {
    detourPointsRef.current = [];
    detourFeaturesRef.current = [];
    closedRoadFeaturesRef.current = [];
    reducedRoadFeaturesRef.current = [];
    closedSignsRef.current = [];
    actionHistoryRef.current = [];
    lastEditingAnnotationSentRef.current = null;
    setEditingAnnotationId(null);
    setAnnotations([]);
    updateSourceData('closed-road', emptyFeatureCollection());
    updateSourceData('reduced-road', emptyFeatureCollection());
    updateSourceData('detour-road', emptyFeatureCollection());
    updateSourceData('closed-signs', emptyFeatureCollection());
    updateSourceData('annotations-source', emptyFeatureCollection());
    removeAllAnnotationMarkers();
    closeAnnotationPopup();
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

  const syncDetourSource = () => {
    const freeDrawFeature =
      detourPointsRef.current.length >= 2
        ? [
            {
              type: 'Feature' as const,
              properties: { kind: 'detour-free' },
              geometry: {
                type: 'LineString' as const,
                coordinates: detourPointsRef.current
              }
            }
          ]
        : [];

    updateSourceData('detour-road', {
      type: 'FeatureCollection',
      features: [...detourFeaturesRef.current, ...freeDrawFeature]
    });
  };

  const syncClosedSources = () => {
    const signFeatures: GeoJSON.Feature<GeoJSON.Point>[] = closedSignsRef.current.map((s) => ({
      type: 'Feature',
      properties: { kind: s.kind } as GeoJSON.GeoJsonProperties,
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
  };

  const syncReducedSource = () => {
    updateSourceData('reduced-road', {
      type: 'FeatureCollection',
      features: reducedRoadFeaturesRef.current
    });
  };

  /** Oppdater alle egne GeoJSON-kilder fra refs / annotasjons-state (etter ny stil). */
  const syncAllData = () => {
    syncClosedSources();
    syncReducedSource();
    syncDetourSource();
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

  const applyCustomStyle = (mapInstance: maplibregl.Map) => {
    const ownLayerIds = new Set([
      'annotations-layer',
      'annotations-bg-white',
      'annotations-bg-green',
      'closed-sign-layer',
      'detour-road-layer',
      'detour-road-casing-layer',
      'reduced-road-fill',
      'reduced-road-outline',
      'closed-road-fill',
      'closed-road-outline',
      'nvdb-hover-layer',
      'nvdb-hitbox',
      'nvdb-layer'
    ]);
    const layers = mapInstance.getStyle().layers ?? [];
    const activeStyle = mapStyleRef.current;

    layers.forEach((layer) => {
      if (ownLayerIds.has(layer.id)) return;
      const id = layer.id.toLowerCase();

      if (activeStyle === 'dataviz') {
        const keepRoadInfo =
          id.includes('road_label') ||
          id.includes('highway_label') ||
          id.includes('shield');
        const shouldHide =
          id.includes('label') ||
          id.includes('place') ||
          id.includes('poi') ||
          id.includes('transit');

        if (shouldHide && !keepRoadInfo) {
          try {
            mapInstance.setLayoutProperty(layer.id, 'visibility', 'none');
          } catch {
            // ignorer lag uten visibility-layout
          }
        } else if (keepRoadInfo) {
          try {
            mapInstance.setLayoutProperty(layer.id, 'visibility', 'visible');
          } catch {
            // ignorer lag uten visibility-layout
          }
        }

        const isRoadGeometry =
          layer.type === 'line' &&
          'source-layer' in layer &&
          layer['source-layer'] === 'transportation';
        if (!isRoadGeometry) return;

        if (id.includes('casing')) {
          try {
            mapInstance.setLayoutProperty(layer.id, 'visibility', 'none');
          } catch {
            // ignorer lag uten visibility-layout
          }
          return;
        }

        try {
          mapInstance.setPaintProperty(layer.id, 'line-color', [
            'match',
            ['get', 'class'],
            'motorway',
            '#faec93',
            'trunk',
            '#faec93',
            'primary',
            '#faec93',
            '#d1d1d1'
          ]);
        } catch {
          // ignorer lag uten kompatibel line-color
        }
      } else {
        const isRoadOrPlaceLabel =
          id.includes('road_label') || id.includes('place_label');
        if (isRoadOrPlaceLabel) {
          try {
            mapInstance.setLayoutProperty(layer.id, 'visibility', 'visible');
          } catch {
            // ignorer lag uten visibility-layout
          }
          return;
        }

        const hasNoiseKeyword =
          id.includes('poi') ||
          id.includes('shop') ||
          id.includes('food') ||
          id.includes('restaurant') ||
          id.includes('amenity') ||
          id.includes('transit');
        const isRailLayer = id.includes('rail');
        if (hasNoiseKeyword && !isRailLayer) {
          try {
            mapInstance.setLayoutProperty(layer.id, 'visibility', 'none');
          } catch {
            // ignorer lag uten visibility-layout
          }
        }
      }
    });
  };

  const initializeMapLayers = async (mapInstance: maplibregl.Map) => {
    const overlayLayerIds = [
      'annotations-bg-white',
      'annotations-bg-green',
      'annotations-layer',
      'closed-sign-layer',
      'detour-road-layer',
      'detour-road-casing-layer',
      'reduced-road-fill',
      'reduced-road-outline',
      'closed-road-fill',
      'closed-road-outline',
      'nvdb-hover-layer',
      'nvdb-hitbox',
      'nvdb-layer'
    ];
    const overlaySourceIds = [
      'annotations-source',
      'closed-signs',
      'detour-road',
      'reduced-road',
      'closed-road',
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

    await loadSignAssets(mapInstance);
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

    mapInstance.addSource('closed-signs', {
      type: 'geojson',
      data: emptyFeatureCollection()
    });

    mapInstance.addSource('annotations-source', {
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
      mapInstance.getCanvas().style.cursor = 'pointer';
      const feature = event.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
      if (!feature || feature.geometry.type !== 'LineString') return;

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
      id: 'closed-road-outline',
      type: 'line',
      source: 'closed-road',
      paint: {
        'line-color': SVV_COLORS.closedRoadOutline,
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'closed-road-fill',
      type: 'line',
      source: 'closed-road',
      paint: {
        'line-color': SVV_COLORS.closedRoad,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'reduced-road-outline',
      type: 'line',
      source: 'reduced-road',
      paint: {
        'line-color': SVV_COLORS.reducedRoadOutline,
        'line-width': 10
      }
    });

    mapInstance.addLayer({
      id: 'reduced-road-fill',
      type: 'line',
      source: 'reduced-road',
      paint: {
        'line-color': SVV_COLORS.reducedRoad,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'detour-road-casing-layer',
      type: 'line',
      source: 'detour-road',
      paint: {
        'line-color': SVV_COLORS.detourOutline,
        'line-width': 9,
        'line-opacity': 0.9
      }
    });

    mapInstance.addLayer({
      id: 'detour-road-layer',
      type: 'line',
      source: 'detour-road',
      paint: {
        'line-color': SVV_COLORS.detour,
        'line-width': 5
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
        'icon-size': CLOSED_SIGN_ICON_SIZE,
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
      mapInstance.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
    });

    mapInstance.on('click', 'nvdb-hitbox', (event) => {
      const skiltVerktoy: ActiveTool[] = ['sign', 'traffic-light', 'road-work', 'queue'];
      if (skiltVerktoy.includes(activeToolRef.current) || activeToolRef.current === 'text') {
        return; // La klikket passere til kartet
      }

      if (
        activeToolRef.current !== 'closed' &&
        activeToolRef.current !== 'reduced' &&
        activeToolRef.current !== 'detour'
      ) {
        return;
      }

      const clickedFeature = event.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
      if (!clickedFeature || clickedFeature.geometry.type !== 'LineString') return;

      const coordinates = clickedFeature.geometry.coordinates as Position[];
      if (coordinates.length < 2) return;

      const roadLabel = getRoadLabel(clickedFeature.properties);
      const roadId = getFeatureRoadId(clickedFeature);

      // Unngå dobbelthåndtering (f.eks. omvei-punkt) kun når vi faktisk bruker linje-verktøyet på et gyldig treff.
      skipNextMapClickRef.current = true;

      if (activeToolRef.current === 'closed') {
        closedRoadFeaturesRef.current = [
          ...closedRoadFeaturesRef.current,
          {
            type: 'Feature',
            properties: { kind: 'closed-road', roadLabel, roadId },
            geometry: { type: 'LineString', coordinates }
          }
        ];
        actionHistoryRef.current.push('closed-segment');
        syncClosedSources();
      }

      if (activeToolRef.current === 'detour') {
        detourFeaturesRef.current = [
          ...detourFeaturesRef.current,
          {
            type: 'Feature',
            properties: { kind: 'detour-road', roadLabel, roadId },
            geometry: { type: 'LineString', coordinates }
          }
        ];
        actionHistoryRef.current.push('detour-segment');
        syncDetourSource();
      }

      if (activeToolRef.current === 'reduced') {
        reducedRoadFeaturesRef.current = [
          ...reducedRoadFeaturesRef.current,
          {
            type: 'Feature',
            properties: { kind: 'reduced-road', roadLabel, roadId },
            geometry: { type: 'LineString', coordinates }
          }
        ];
        actionHistoryRef.current.push('reduced-segment');
        syncReducedSource();
      }
    });
  };

  const undoLastAction = () => {
    const lastAction = actionHistoryRef.current.pop();
    if (!lastAction) return;

    if (lastAction === 'closed-segment') {
      closedRoadFeaturesRef.current = closedRoadFeaturesRef.current.slice(0, -1);
      syncClosedSources();
      return;
    }

    if (lastAction === 'closed-sign') {
      closedSignsRef.current = closedSignsRef.current.slice(0, -1);
      syncClosedSources();
      return;
    }

    if (lastAction === 'detour-segment') {
      detourFeaturesRef.current = detourFeaturesRef.current.slice(0, -1);
      syncDetourSource();
      return;
    }

    if (lastAction === 'detour-point') {
      detourPointsRef.current = detourPointsRef.current.slice(0, -1);
      syncDetourSource();
      return;
    }

    if (lastAction === 'reduced-segment') {
      reducedRoadFeaturesRef.current = reducedRoadFeaturesRef.current.slice(0, -1);
      syncReducedSource();
      return;
    }

    if (lastAction === 'annotation') {
      setAnnotations((prev) => {
        const next = prev.slice(0, -1);
        if (editingAnnotationId && !next.some((item) => item.id === editingAnnotationId)) {
          setEditingAnnotationId(null);
        }
        return next;
      });
    }
  };

  const fetchNvdbRoadNetwork = async () => {
    if (!map.current) return;

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

    try {
      console.log('Henter NVDB for BBOX:', bbox);
      const response = await fetch(`/api/nvdb/vegnett?bbox=${encodeURIComponent(bbox)}`);
      if (!response.ok) return;

      const payload = (await response.json()) as unknown;
      const data = toGeoJsonFeatureCollection(payload);
      const correctedData: FeatureCollection = {
        ...data,
        features: data.features.map((feature) => ({
          ...feature,
          geometry: feature.geometry.type === 'LineString'
            ? {
                ...feature.geometry,
                coordinates: feature.geometry.coordinates.map((coord) => [coord[1], coord[0]])
              }
            : feature.geometry
        }))
      };
      console.log('Antall veglenker mottatt:', data.features.length);
      console.log('Første veglenke geometri:', correctedData.features?.[0]?.geometry);
      updateSourceData('nvdb-source', correctedData);
    } catch {
      // Ignorer nettverksfeil og behold forrige kartdata
    }
  };

  useImperativeHandle(ref, () => ({
    downloadAsPng: () => {
      void (async () => {
        const mapInstance = map.current;
        const canvas = mapInstance?.getCanvas();
        if (!mapInstance || !canvas) return;

        await fetchNvdbRoadNetwork();

        const exportHideLayerIds = [
          ...NVDB_EXPORT_HIDE_LAYER_IDS,
          'closed-sign-layer',
          'annotations-layer',
          'annotations-bg-white',
          'annotations-bg-green'
        ];
        const previousLayerVisibility: Record<string, 'visible' | 'none'> = {};
        for (const layerId of exportHideLayerIds) {
          if (!mapInstance.getLayer(layerId)) continue;
          try {
            const v = mapInstance.getLayoutProperty(layerId, 'visibility');
            previousLayerVisibility[layerId] =
              typeof v === 'string' && (v === 'visible' || v === 'none') ? v : 'visible';
            mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
          } catch {
            // lag finnes ikke eller støtter ikke visibility
          }
        }

        const restoreNvdbExportLayers = () => {
          for (const layerId of exportHideLayerIds) {
            if (!(layerId in previousLayerVisibility)) continue;
            try {
              mapInstance.setLayoutProperty(
                layerId,
                'visibility',
                previousLayerVisibility[layerId]
              );
            } catch {
              // ignorer
            }
          }
          mapInstance.triggerRepaint();
        };

        const runCapture = async () => {
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = canvas.width;
          exportCanvas.height = canvas.height;
          const ctx = exportCanvas.getContext('2d');
          try {
            if (!ctx) return;

            // Legg hvit bakgrunn bak kartet for mer lesbart PNG-resultat.
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const dpr = window.devicePixelRatio || 1;
            for (const sign of closedSignsRef.current) {
              const image = signImageCacheRef.current[sign.kind];
              if (!image) continue;

              const projected = mapInstance.project(sign.coordinates);

              const baseHeight = CLOSED_SIGN_PNG_BASE_SIZE;
              const targetScale = CLOSED_SIGN_ICON_SIZE;
              const nw = image.naturalWidth || 1;
              const nh = image.naturalHeight || 1;
              const aspectRatio = nw / nh;

              const h = baseHeight * targetScale * dpr;
              const w = h * aspectRatio;

              const x = projected.x * dpr - w / 2;
              const y = projected.y * dpr - h / 2;

              ctx.drawImage(image, x, y, w, h);
            }
            const annotations = annotationsRef.current;
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
            if (annotations.length > 0 && 'fonts' in document) {
              await document.fonts.ready;
            }
            for (const annotation of annotations) {
              const projected = mapInstance.project(annotation.coordinates);
              const x = projected.x * dpr;
              const y = projected.y * dpr;
              const fontSize = Math.max(10, annotation.size) * dpr;
              const fontWeight = annotation.backgroundStyle === 'white' ? 'normal' : 'bold';
              const wrappedLines = wrapTextLines(annotation.text, 30);

              ctx.save();
              ctx.translate(x, y);
              ctx.rotate((annotation.rotation * Math.PI) / 180);
              ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const lineHeight = fontSize * 1.05;
              const textWidth = wrappedLines.reduce((max, line) => {
                const lineWidth = ctx.measureText(line).width;
                return Math.max(max, lineWidth);
              }, 0);
              const textHeight = wrappedLines.length * lineHeight;
              if (annotation.backgroundStyle === 'white' || annotation.backgroundStyle === 'green') {
                const padX = 10 * dpr;
                const padY = annotation.backgroundStyle === 'green' ? 8 * dpr : 3 * dpr;
                const rawBoxX = -textWidth / 2 - padX;
                const rawBoxY = -textHeight / 2 - padY;
                const rawBoxW = textWidth + padX * 2;
                const rawBoxH = textHeight + padY * 2;
                const boxX = Math.round(rawBoxX);
                const boxY = Math.round(rawBoxY);
                const boxW = Math.round(rawBoxW);
                const boxH = Math.round(rawBoxH);
                const radius =
                  annotation.backgroundStyle === 'green' ? 2 * dpr : 6 * dpr;
                const borderWidth = annotation.backgroundStyle === 'green' ? 1 * dpr : 2 * dpr;

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, boxW, boxH, radius);
                ctx.closePath();
                if (annotation.backgroundStyle === 'green') {
                  ctx.fillStyle = ANNOTATION_EURO_GREEN;
                  ctx.fill();
                  ctx.strokeStyle = '#ffffff';
                  ctx.lineWidth = borderWidth;
                  ctx.stroke();
                } else {
                  ctx.fillStyle = '#ffffff';
                  ctx.fill();
                  ctx.strokeStyle = '#000000';
                  ctx.lineWidth = borderWidth;
                  ctx.stroke();
                }
              }

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              if (annotation.backgroundStyle === 'green') {
                ctx.font = `bold ${fontSize}px Arial, sans-serif`;
              }
              ctx.fillStyle =
                annotation.backgroundStyle === 'green' ? '#ffffff' : '#111827';
              const startY = -textHeight / 2 + lineHeight / 2;
              for (let i = 0; i < wrappedLines.length; i += 1) {
                const lineY = startY + i * lineHeight;
                ctx.fillText(wrappedLines[i], 0, lineY);
              }
              ctx.restore();
            }

            if (showLegend) {
              const boxX = 16 * dpr;
              const boxW = 260 * dpr;
              const boxH = 100 * dpr;
              const boxY = exportCanvas.height - 20 * dpr - boxH;

              ctx.save();
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#000000';
              ctx.lineWidth = 2 * dpr;
              const legendRadius = 6 * dpr;
              ctx.beginPath();
              ctx.roundRect(boxX, boxY, boxW, boxH, legendRadius);
              ctx.fill();
              ctx.stroke();

              const drawLegendLine = (
                y: number,
                casingColor: string,
                mainColor: string
              ) => {
                const startX = boxX + 16 * dpr;
                const endX = boxX + 86 * dpr;
                ctx.lineCap = 'round';
                ctx.strokeStyle = casingColor;
                ctx.lineWidth = 8 * dpr;
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();

                ctx.strokeStyle = mainColor;
                ctx.lineWidth = 5 * dpr;
                ctx.beginPath();
                ctx.moveTo(startX, y);
                ctx.lineTo(endX, y);
                ctx.stroke();
              };

              const legendRowSpacing = 25 * dpr;
              const row1Y = boxY + 22 * dpr;
              const row2Y = row1Y + legendRowSpacing;
              const row3Y = row2Y + legendRowSpacing;
              drawLegendLine(row1Y, SVV_COLORS.closedRoadOutline, SVV_COLORS.closedRoad);
              drawLegendLine(row2Y, SVV_COLORS.reducedRoadOutline, SVV_COLORS.reducedRoad);
              drawLegendLine(row3Y, SVV_COLORS.detourOutline, SVV_COLORS.detour);

              ctx.fillStyle = '#111827';
              // text-xs (12px) i DOM — skaleres med DPR for skarp PNG-tekst
              ctx.font = `${12 * dpr}px Arial, sans-serif`;
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText('Stengt veg', boxX + 98 * dpr, row1Y);
              ctx.fillText('Redusert fremkommelighet', boxX + 98 * dpr, row2Y);
              ctx.fillText('Alternativ rute', boxX + 98 * dpr, row3Y);
              ctx.restore();
            }

            const dataUrl = exportCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'vegmelding_utsnitt.png';
            link.click();
          } finally {
            restoreNvdbExportLayers();
          }
        };

        let captured = false;
        const scheduleCapture = () => {
          if (captured) return;
          captured = true;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              void runCapture();
            });
          });
        };

        mapInstance.once('idle', scheduleCapture);
        mapInstance.triggerRepaint();

        window.setTimeout(() => {
          if (captured) return;
          scheduleCapture();
        }, 200);
      })();
    }
  }));

  useEffect(() => {
    if (map.current || !mapContainer.current) return;

    const initialStyleUrl = buildMapTilerStyleUrl(mapStyle);
    const mapOptions = {
      container: mapContainer.current,
      style: initialStyleUrl,
      center: [8.5, 61.5], // Mer sentralt startpunkt for Sor-Norge
      zoom: 5.5,
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
      applyCustomStyle(map.current);
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

      if (editingAnnotationIdRef.current) {
        setEditingAnnotationId(null);
      }

      const clickedPosition: Position = [event.lngLat.lng, event.lngLat.lat];
      console.log('Map click:', event.lngLat);
      console.log('Klikk registrert på kart med verktøy:', activeToolRef.current);

      if (activeToolRef.current === 'text') {
        const newId = crypto.randomUUID();
        actionHistoryRef.current.push('annotation');
        setAnnotations((prev) => [
          ...prev,
          {
            id: newId,
            text: 'Ny tekst',
            size: 16,
            rotation: 0,
            coordinates: clickedPosition,
            backgroundStyle: 'white'
          }
        ]);
        setEditingAnnotationId(newId);
        onTextAnnotationCreated();
        return;
      }

      const skiltVerktoy = ['sign', 'traffic-light', 'road-work', 'queue'] as const;
      type SkiltVerktoy = (typeof skiltVerktoy)[number];
      const tool = activeToolRef.current as SkiltVerktoy;
      if (skiltVerktoy.includes(tool)) {
        const iconMap: Record<SkiltVerktoy, SignKind> = {
          'sign': 'stengt-skilt',
          'traffic-light': 'lyskryss-skilt',
          'road-work': 'veiarbeid-skilt',
          'queue': 'ko-skilt'
        };
        const selectedIcon = iconMap[tool];
        closedSignsRef.current = [...closedSignsRef.current, { coordinates: clickedPosition, kind: selectedIcon }];
        actionHistoryRef.current.push('closed-sign');
        syncClosedSources();
        return;
      }

      if (activeToolRef.current === 'detour') {
        detourPointsRef.current = [...detourPointsRef.current, clickedPosition];
        actionHistoryRef.current.push('detour-point');
        syncDetourSource();
      }
    });

    map.current.once('load', async () => {
      if (!map.current) return;
      map.current.on('styleimagemissing', async (e) => {
        const id = e.id;
        if (!(id in SIGN_ASSET_PATHS)) return;
        const m = map.current;
        if (!m) return;
        await loadSignAssets(m);
        m.triggerRepaint();
      });
      await initializeMapLayers(map.current);
      syncAllData();
      void fetchNvdbRoadNetwork();
    });

    map.current.on('move', () => {
      void fetchNvdbRoadNetwork();
    });

    map.current.on('moveend', () => {
      if (moveDebounceRef.current) window.clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = window.setTimeout(() => {
        void fetchNvdbRoadNetwork();
      }, 500);
    });

    return () => {
      if (moveDebounceRef.current) window.clearTimeout(moveDebounceRef.current);
      closeAnnotationPopup();
      removeAllAnnotationMarkers();
      map.current?.removeControl(geocodingControl);
      map.current?.remove();
      map.current = null;
    };
    // Kart instansieres én gang; mapStyle byttes via egen effekt nedenfor.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialStyleUrl fanger første mapStyle
  }, []);

  useEffect(() => {
    if (!map.current) return;

    if (lastAppliedMapStyleRef.current === null) {
      lastAppliedMapStyleRef.current = mapStyle;
      return;
    }
    if (lastAppliedMapStyleRef.current === mapStyle) return;

    const instance = map.current;
    const url = buildMapTilerStyleUrl(mapStyle);
    lastFetchedBboxRef.current = null;

    styleLoadGenerationRef.current += 1;
    const generation = styleLoadGenerationRef.current;

    instance.once('style.load', async () => {
      if (generation !== styleLoadGenerationRef.current || !map.current) return;
      lastAppliedMapStyleRef.current = mapStyle;
      await initializeMapLayers(map.current);
      syncAllData();
      void fetchNvdbRoadNetwork();
    });
    instance.setStyle(url);
  }, [mapStyle]);

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

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {showLegend && (
        <div
          className="absolute bottom-10 left-4 rounded-md border-2 border-black bg-white p-3 shadow-lg"
          style={{ fontFamily: 'Arial, sans-serif' }}
        >
          <div className="flex items-center gap-2 text-xs text-slate-800">
            <div className="relative h-2.5 w-16">
              <span
                className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.closedRoadOutline }}
              />
              <span
                className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.closedRoad }}
              />
            </div>
            <span>Stengt veg</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-800">
            <div className="relative h-2.5 w-16">
              <span
                className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.reducedRoadOutline }}
              />
              <span
                className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.reducedRoad }}
              />
            </div>
            <span>Redusert fremkommelighet</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-800">
            <div className="relative h-2.5 w-16">
              <span
                className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.detourOutline }}
              />
              <span
                className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: SVV_COLORS.detour }}
              />
            </div>
            <span>Alternativ rute</span>
          </div>
        </div>
      )}
      {showZoomHint && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/70 px-3 py-2 text-sm text-white">
          Zoom inn for å se vegnett
        </div>
      )}
    </div>
  );
});

export default KartMotor;