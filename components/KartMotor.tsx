"use client";
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import 'maplibre-gl/dist/maplibre-gl.css';

const SVV_COLORS = {
  closedRoad: "#E60000", // SVV Rød
  closedRoadOutline: "#990000", // Mork rod casing
  detour: "#008b4a",     // SVV Grønn
  detourOutline: "#005c31", // Mork gronn casing
  background: "#F5F5F5"
};

export type ActiveTool = 'none' | 'closed' | 'detour' | 'sign' | 'text';

type KartMotorProps = {
  mapStyle: 'dataviz' | 'streets';
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  editingAnnotation: { id: string; text: string; size: number; rotation: number; coordinates: Position } | null;
  onEditingAnnotationChange: (annotation: { id: string; text: string; size: number; rotation: number; coordinates: Position } | null) => void;
};

  export type KartMotorHandle = {
  downloadAsPng: () => void;
};

type Position = [number, number];
type Annotation = {
  id: string;
  text: string;
  size: number;
  rotation: number;
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
  { mapStyle, activeTool, onClear, onUndo, editingAnnotation, onEditingAnnotationChange },
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
  const annotationPopupRef = useRef<maplibregl.Popup | null>(null);
  const lastEditingAnnotationSentRef = useRef<{ id: string; text: string; size: number; rotation: number; coordinates: Position } | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [showZoomHint, setShowZoomHint] = useState(true);
  const editingAnnotationIdRef = useRef<string | null>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const lastAppliedMapStyleRef = useRef<'dataviz' | 'streets' | null>(null);
  const styleLoadGenerationRef = useRef(0);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

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

  const closeAnnotationPopup = () => {
    annotationPopupRef.current?.remove();
    annotationPopupRef.current = null;
  };

  const clearAllDrawings = () => {
    detourPointsRef.current = [];
    detourFeaturesRef.current = [];
    closedRoadFeaturesRef.current = [];
    closedSignsRef.current = [];
    actionHistoryRef.current = [];
    lastEditingAnnotationSentRef.current = null;
    setEditingAnnotationId(null);
    setAnnotations([]);
    updateSourceData('closed-road', emptyFeatureCollection());
    updateSourceData('detour-road', emptyFeatureCollection());
    updateSourceData('closed-signs', emptyFeatureCollection());
    updateSourceData('annotations-source', emptyFeatureCollection());
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
        size: annotation.size,
        rotation: annotation.rotation
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

  const initializeMapLayers = (mapInstance: maplibregl.Map) => {
    const overlayLayerIds = [
      'annotations-layer',
      'closed-sign-layer',
      'detour-road-layer',
      'detour-road-casing-layer',
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
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Regular'],
        'text-size': ['get', 'size'],
        'text-rotate': ['get', 'rotation'],
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

    mapInstance.on('mousedown', 'annotations-layer', (event) => {
      const feature = event.features?.[0] as GeoJSON.Feature<GeoJSON.Point> | undefined;
      const id = typeof feature?.properties?.id === 'string' ? feature.properties.id : null;
      if (!id) return;
      skipNextMapClickRef.current = true;
      draggingAnnotationIdRef.current = id;
      setEditingAnnotationId((prev) => (prev === id ? prev : id));
      closeAnnotationPopup();
      mapInstance.dragPan.disable();
      mapInstance.getCanvas().style.cursor = 'grabbing';
    });

    mapInstance.on('click', 'annotations-layer', (event) => {
      const feature = event.features?.[0] as GeoJSON.Feature<GeoJSON.Point> | undefined;
      const id = typeof feature?.properties?.id === 'string' ? feature.properties.id : null;
      if (!id) return;
      skipNextMapClickRef.current = true;
      setEditingAnnotationId((prev) => (prev === id ? prev : id));
    });

    mapInstance.on('mousemove', (event) => {
      if (!draggingAnnotationIdRef.current) return;
      const draggedId = draggingAnnotationIdRef.current;
      const coordinates: Position = [event.lngLat.lng, event.lngLat.lat];
      setAnnotations((prev) =>
        prev.map((annotation) =>
          annotation.id === draggedId
            ? { ...annotation, coordinates }
            : annotation
        )
      );
    });

    mapInstance.on('mouseup', () => {
      if (!draggingAnnotationIdRef.current) return;
      draggingAnnotationIdRef.current = null;
      mapInstance.dragPan.enable();
      mapInstance.getCanvas().style.cursor = activeToolRef.current === 'none' ? '' : 'crosshair';
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
      closeAnnotationPopup();
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
    container.style.fontFamily = 'LFT Etica, Arial, sans-serif';
    container.style.color = '#1f2937';

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
    textInput.style.fontFamily = 'LFT Etica, Arial, sans-serif';
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

    const rotationLabel = document.createElement('label');
    rotationLabel.textContent = `Rotasjon: ${selected.rotation}°`;
    rotationLabel.style.display = 'block';
    rotationLabel.style.fontSize = '12px';
    rotationLabel.style.marginBottom = '4px';
    container.appendChild(rotationLabel);

    const rotationInput = document.createElement('input');
    rotationInput.type = 'range';
    rotationInput.min = '0';
    rotationInput.max = '360';
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

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.textContent = '✓ Ferdig';
    doneBtn.style.flex = '1';
    doneBtn.style.border = '1px solid #86efac';
    doneBtn.style.background = '#dcfce7';
    doneBtn.style.color = '#166534';
    doneBtn.style.borderRadius = '8px';
    doneBtn.style.padding = '8px 10px';
    doneBtn.style.fontSize = '12px';
    doneBtn.style.fontWeight = '600';
    doneBtn.style.cursor = 'pointer';
    doneBtn.addEventListener('click', () => {
      setEditingAnnotationId(null);
    });
    actions.appendChild(doneBtn);

    container.appendChild(actions);

    closeAnnotationPopup();
    annotationPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16
    })
      .setLngLat(selected.coordinates)
      .setDOMContent(container)
      .addTo(map.current);
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
      coordinates: selected.coordinates
    };
    const last = lastEditingAnnotationSentRef.current;
    if (
      last &&
      last.id === next.id &&
      last.text === next.text &&
      last.size === next.size &&
      last.rotation === next.rotation &&
      last.coordinates[0] === next.coordinates[0] &&
      last.coordinates[1] === next.coordinates[1]
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
          annotation.coordinates[1] === editingAnnotation.coordinates[1]
        ) {
          return annotation;
        }
        changed = true;
        return {
          ...annotation,
          text: editingAnnotation.text,
          size: editingAnnotation.size,
          rotation: editingAnnotation.rotation,
          coordinates: editingAnnotation.coordinates
        };
      });
      return changed ? next : prev;
    });
  }, [editingAnnotation]);

  useEffect(() => {
    if (!map.current) return;
    const annotationFeatures: GeoJSON.Feature<GeoJSON.Point>[] = annotations.map((annotation) => ({
      type: 'Feature',
      properties: {
        id: annotation.id,
        text: annotation.text,
        size: annotation.size,
        rotation: annotation.rotation
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
    if (!editingAnnotationId) return;
    const selected = annotations.find((annotation) => annotation.id === editingAnnotationId);
    if (!selected) {
      setEditingAnnotationId(null);
      return;
    }
    annotationPopupRef.current?.setLngLat(selected.coordinates);
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