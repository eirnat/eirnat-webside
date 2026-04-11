"use client";
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import 'maplibre-gl/dist/maplibre-gl.css';

const SVV_COLORS = {
  closedRoad: "#E60000", // SVV Rød
  detour: "#008b4a",     // SVV Grønn
  background: "#F5F5F5"
};

export type ActiveTool = 'none' | 'closed' | 'detour' | 'sign' | 'text';

type KartMotorProps = {
  mapStyle: 'dataviz' | 'streets';
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  editingAnnotation: { id: string; text: string; size: number } | null;
  onEditingAnnotationChange: (annotation: { id: string; text: string; size: number } | null) => void;
  onDeleteEditingAnnotation: number;
};

  export type KartMotorHandle = {
  downloadAsPng: () => void;
};

type Position = [number, number];
type Annotation = {
  id: string;
  text: string;
  size: number;
  coordinates: Position;
};

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

/** Lag et enkelt 302.1 skilt-ikon (rød sirkel med hvit strek) */
function drawNoEntrySign() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#E60000';
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.fillRect(size * 0.2, size * 0.42, size * 0.6, size * 0.16);
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
  { mapStyle, activeTool, onClear, onUndo, editingAnnotation, onEditingAnnotationChange, onDeleteEditingAnnotation },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const activeToolRef = useRef<ActiveTool>('none');
  const detourPointsRef = useRef<Position[]>([]);
  const detourFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  const closedRoadFeaturesRef = useRef<GeoJSON.Feature<GeoJSON.LineString>[]>([]);
  /** Manuelt plasserte skilt (no-entry), i kartets lng/lat */
  const closedSignsRef = useRef<Position[]>([]);
  const lastFetchedBboxRef = useRef<string | null>(null);
  const moveDebounceRef = useRef<number | null>(null);
  const skipNextMapClickRef = useRef(false);
  const actionHistoryRef = useRef<
    Array<'closed-segment' | 'closed-sign' | 'detour-segment' | 'detour-point' | 'annotation'>
  >([]);
  const draggingAnnotationIdRef = useRef<string | null>(null);
  const annotationsDataHashRef = useRef<string>('');
  const lastEditingAnnotationSentRef = useRef<{ id: string; text: string; size: number } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const lastAppliedMapStyleRef = useRef<'dataviz' | 'streets' | null>(null);
  const styleLoadGenerationRef = useRef(0);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

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

  const clearAllDrawings = () => {
    detourPointsRef.current = [];
    detourFeaturesRef.current = [];
    closedRoadFeaturesRef.current = [];
    closedSignsRef.current = [];
    actionHistoryRef.current = [];
    annotationsDataHashRef.current = '';
    lastEditingAnnotationSentRef.current = null;
    setEditingAnnotationId(null);
    setAnnotations([]);
    updateSourceData('closed-road', emptyFeatureCollection());
    updateSourceData('detour-road', emptyFeatureCollection());
    updateSourceData('closed-signs', emptyFeatureCollection());
    updateSourceData('annotations-source', emptyFeatureCollection());
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
    const signFeatures: GeoJSON.Feature<GeoJSON.Point>[] = closedSignsRef.current.map(
      (coordinates) =>
        ({
          type: 'Feature',
          properties: { kind: 'no-entry' } as GeoJSON.GeoJsonProperties,
          geometry: { type: 'Point', coordinates }
        }) as GeoJSON.Feature<GeoJSON.Point>
    );

    updateSourceData('closed-road', {
      type: 'FeatureCollection',
      features: closedRoadFeaturesRef.current
    });
    updateSourceData('closed-signs', {
      type: 'FeatureCollection',
      features: signFeatures
    });
  };

  /** Oppdater alle egne GeoJSON-kilder fra refs / annotasjons-state (etter ny stil). */
  const syncAllData = () => {
    syncClosedSources();
    syncDetourSource();
    const annotationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = annotationsRef.current.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        text: annotation.text,
        size: annotation.size
      },
      geometry: {
        type: 'Point',
        coordinates: annotation.coordinates
      }
    }));
    const nextData = {
      type: 'FeatureCollection',
      features: annotationFeatures
    } satisfies FeatureCollection;
    annotationsDataHashRef.current = JSON.stringify(nextData);
    updateSourceData('annotations-source', nextData);
  };

  const initializeMapLayers = (mapInstance: maplibregl.Map) => {
    const overlayLayerIds = [
      'annotations-layer',
      'closed-sign-layer',
      'detour-road-layer',
      'detour-road-casing-layer',
      'closed-road-layer',
      'nvdb-hover-layer',
      'nvdb-hitbox',
      'nvdb-layer'
    ];
    const overlaySourceIds = [
      'annotations-source',
      'closed-signs',
      'detour-road',
      'closed-road',
      'nvdb-source'
    ];

    for (const id of overlayLayerIds) {
      if (mapInstance.getLayer(id)) mapInstance.removeLayer(id);
    }
    for (const sid of overlaySourceIds) {
      if (mapInstance.getSource(sid)) mapInstance.removeSource(sid);
    }
    if (mapInstance.hasImage('no-entry')) mapInstance.removeImage('no-entry');

    const imageData = drawNoEntrySign();
    if (imageData) mapInstance.addImage('no-entry', imageData);

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
      id: 'closed-road-layer',
      type: 'line',
      source: 'closed-road',
      paint: {
        'line-color': SVV_COLORS.closedRoad,
        'line-width': 6
      }
    });

    mapInstance.addLayer({
      id: 'detour-road-casing-layer',
      type: 'line',
      source: 'detour-road',
      paint: {
        'line-color': '#ffffff',
        'line-width': 7,
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
      id: 'closed-sign-layer',
      type: 'symbol',
      source: 'closed-signs',
      layout: {
        'icon-image': 'no-entry',
        'icon-size': 0.45,
        'icon-allow-overlap': true
      }
    });

    mapInstance.addLayer({
      id: 'annotations-layer',
      type: 'symbol',
      source: 'annotations-source',
      layout: {
        'text-field': ['get', 'text'],
        'text-size': ['coalesce', ['get', 'size'], 16],
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
        'text-radial-offset': 0.5,
        'text-justify': 'auto'
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.5
      }
    });

    mapInstance.on('mouseenter', 'annotations-layer', () => {
      mapInstance.getCanvas().style.cursor = 'grab';
    });

    mapInstance.on('mouseleave', 'annotations-layer', () => {
      if (!draggingAnnotationIdRef.current) {
        mapInstance.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
      }
    });

    mapInstance.on('mousedown', 'annotations-layer', (event) => {
      const feature = event.features?.[0] as GeoJSON.Feature<GeoJSON.Point> | undefined;
      const id = typeof feature?.properties?.id === 'string' ? feature.properties.id : null;
      if (!id) return;
      draggingAnnotationIdRef.current = id;
      setEditingAnnotationId(id);
      mapInstance.getCanvas().style.cursor = 'grabbing';
      mapInstance.dragPan.disable();
    });

    mapInstance.on('mouseleave', 'nvdb-hitbox', () => {
      mapInstance.setPaintProperty('nvdb-hover-layer', 'line-opacity', 0);
      mapInstance.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
    });

    mapInstance.on('click', 'nvdb-hitbox', (event) => {
      if (activeToolRef.current !== 'closed' && activeToolRef.current !== 'detour') return;

      skipNextMapClickRef.current = true;

      const clickedFeature = event.features?.[0] as GeoJSON.Feature<GeoJSON.LineString> | undefined;
      if (!clickedFeature || clickedFeature.geometry.type !== 'LineString') return;

      const coordinates = clickedFeature.geometry.coordinates as Position[];
      if (coordinates.length < 2) return;

      const roadLabel = getRoadLabel(clickedFeature.properties);
      const roadId = getFeatureRoadId(clickedFeature);

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

        const previousNvdbVisibility: Partial<Record<(typeof NVDB_EXPORT_HIDE_LAYER_IDS)[number], string>> =
          {};
        for (const layerId of NVDB_EXPORT_HIDE_LAYER_IDS) {
          if (!mapInstance.getLayer(layerId)) continue;
          try {
            const v = mapInstance.getLayoutProperty(layerId, 'visibility');
            previousNvdbVisibility[layerId] =
              typeof v === 'string' && (v === 'visible' || v === 'none') ? v : 'visible';
            mapInstance.setLayoutProperty(layerId, 'visibility', 'none');
          } catch {
            // lag finnes ikke eller støtter ikke visibility
          }
        }

        const restoreNvdbExportLayers = () => {
          for (const layerId of NVDB_EXPORT_HIDE_LAYER_IDS) {
            if (!(layerId in previousNvdbVisibility)) continue;
            try {
              mapInstance.setLayoutProperty(
                layerId,
                'visibility',
                previousNvdbVisibility[layerId] as 'visible' | 'none'
              );
            } catch {
              // ignorer
            }
          }
          mapInstance.triggerRepaint();
        };

        const runCapture = () => {
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
              runCapture();
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
      center: [10.7522, 59.9139], // Oslo som startpunkt
      zoom: 12,
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

    const geocodingControl = new GeocodingControl({
      apiKey: 'b9LxmFq6z6OEgzPzvrzA',
      language: 'no',
      country: 'no'
    });
    map.current.addControl(geocodingControl, 'top-left');

    map.current.on('mousemove', (event) => {
      if (!map.current) return;
      if (!draggingAnnotationIdRef.current) return;
      const draggedId = draggingAnnotationIdRef.current;
      const newCoordinates: Position = [event.lngLat.lng, event.lngLat.lat];
      setAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.id === draggedId
            ? { ...annotation, coordinates: newCoordinates }
            : annotation
        )
      );
    });

    map.current.on('mouseup', () => {
      if (!map.current) return;
      if (!draggingAnnotationIdRef.current) return;
      draggingAnnotationIdRef.current = null;
      map.current.dragPan.enable();
      map.current.getCanvas().style.cursor = 'grab';
    });

    map.current.on('click', (event) => {
      if (skipNextMapClickRef.current) {
        skipNextMapClickRef.current = false;
        return;
      }

      const clickedPosition: Position = [event.lngLat.lng, event.lngLat.lat];
      console.log('Map click:', event.lngLat);

      if (activeToolRef.current === 'text') {
        const newId = crypto.randomUUID();
        actionHistoryRef.current.push('annotation');
        setAnnotations((prev) => [
          ...prev,
          {
            id: newId,
            text: 'Ny tekst',
            size: 16,
            coordinates: clickedPosition
          }
        ]);
        setEditingAnnotationId(newId);
        return;
      }

      if (activeToolRef.current === 'sign') {
        closedSignsRef.current = [...closedSignsRef.current, clickedPosition];
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

    map.current.once('load', () => {
      if (!map.current) return;
      map.current.on('styleimagemissing', (e) => {
        const emptyImage = new Uint8Array(4);
        const m = map.current;
        if (!m || m.hasImage(e.id)) return;
        try {
          m.addImage(e.id, { width: 1, height: 1, data: emptyImage });
        } catch {
          // ignorer
        }
      });
      initializeMapLayers(map.current);
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

    instance.once('style.load', () => {
      if (generation !== styleLoadGenerationRef.current || !map.current) return;
      lastAppliedMapStyleRef.current = mapStyle;
      initializeMapLayers(map.current);
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
      size: selected.size
    };
    const last = lastEditingAnnotationSentRef.current;
    if (
      last &&
      last.id === next.id &&
      last.text === next.text &&
      last.size === next.size
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
          annotation.size === editingAnnotation.size
        ) {
          return annotation;
        }
        changed = true;
        return { ...annotation, text: editingAnnotation.text, size: editingAnnotation.size };
      });
      return changed ? next : prev;
    });
  }, [editingAnnotation]);

  useEffect(() => {
    if (!editingAnnotationId) return;
    if (!onDeleteEditingAnnotation) return;
    setAnnotations((prev) => prev.filter((annotation) => annotation.id !== editingAnnotationId));
    setEditingAnnotationId(null);
  }, [onDeleteEditingAnnotation, editingAnnotationId]);

  useEffect(() => {
    if (!map.current) return;

    const annotationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = annotations.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        text: annotation.text,
        size: annotation.size
      },
      geometry: {
        type: 'Point',
        coordinates: annotation.coordinates
      }
    }));

    const nextData = {
      type: 'FeatureCollection',
      features: annotationFeatures
    } satisfies FeatureCollection;

    const nextHash = JSON.stringify(nextData);
    if (nextHash === annotationsDataHashRef.current) return;
    annotationsDataHashRef.current = nextHash;
    updateSourceData('annotations-source', nextData);
  }, [annotations]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full" />
      {showZoomHint && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-black/70 px-3 py-2 text-sm text-white">
          Zoom inn for å se vegnett
        </div>
      )}
    </div>
  );
});

export default KartMotor;