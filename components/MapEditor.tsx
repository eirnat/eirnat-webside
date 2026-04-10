"use client";

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { GeocodingControl } from "@maptiler/geocoding-control/maplibregl";
import "maplibre-gl/dist/maplibre-gl.css";

const SVV_COLORS = { closedRoad: "#E60000", detour: "#008b4a" };

const MAPTILER_KEY =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_MAPTILER_KEY
    ? process.env.NEXT_PUBLIC_MAPTILER_KEY
    : "b9LxmFq6z6OEgzPzvrzA";

export type ActiveTool = "none" | "closed" | "detour" | "text";

export type MapStyleMode = "light" | "streets";

export type MapEditorProps = {
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  editingAnnotation: { id: string; text: string; size: number } | null;
  onEditingAnnotationChange: (
    annotation: { id: string; text: string; size: number } | null
  ) => void;
  onDeleteEditingAnnotation: number;
  mapStyle: MapStyleMode;
};

export type MapEditorHandle = { downloadAsPng: () => void };

type Position = [number, number];

type Annotation = {
  id: string;
  text: string;
  size: number;
  coordinates: Position;
};

type FeatureCollection = GeoJSON.FeatureCollection;

const emptyFC = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

const parseWktLineString = (wkt: string): Position[] => {
  const normalized = wkt.trim();
  if (!normalized.toUpperCase().startsWith("LINESTRING")) return [];
  const start = normalized.indexOf("(");
  const end = normalized.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) return [];
  return normalized
    .slice(start + 1, end)
    .split(",")
    .map((pair) => pair.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .map((parts) => [Number(parts[0]), Number(parts[1])] as Position)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
};

/** NVDB kan levere lat,lon — bytt til lon,lat for MapLibre når første verdi ser ut som breddegrad. */
const normalizeLineStringCoords = (coords: Position[]): Position[] => {
  if (coords.length === 0) return coords;
  const [x, y] = coords[0];
  if (Math.abs(x) < 40 && Math.abs(y) > 40) {
    return coords.map(([a, b]) => [b, a] as Position);
  }
  return coords;
};

const nvdbPayloadToFeatureCollection = (payload: unknown): FeatureCollection => {
  const objects =
    payload &&
    typeof payload === "object" &&
    "objekter" in payload &&
    Array.isArray((payload as { objekter: unknown[] }).objekter)
      ? (payload as { objekter: unknown[] }).objekter
      : [];

  const features: GeoJSON.Feature[] = [];

  for (const object of objects) {
    const row = object as {
      geometri?: { geojson?: GeoJSON.Geometry; wkt?: string };
      geometry?: GeoJSON.Geometry;
    };

    let geometry: GeoJSON.Geometry | null = null;

    if (row.geometri?.geojson) {
      geometry = row.geometri.geojson;
    } else if (row.geometry) {
      geometry = row.geometry;
    } else if (typeof row.geometri?.wkt === "string") {
      const coordinates = parseWktLineString(row.geometri.wkt);
      if (coordinates.length >= 2) {
        const fixed = normalizeLineStringCoords(coordinates);
        geometry = { type: "LineString", coordinates: fixed };
      }
    }

    if (!geometry) continue;
    if (geometry.type === "LineString") {
      geometry = {
        ...geometry,
        coordinates: normalizeLineStringCoords(geometry.coordinates as Position[]),
      };
    }

    features.push({
      type: "Feature",
      properties: row as GeoJSON.GeoJsonProperties,
      geometry,
    });
  }

  return { type: "FeatureCollection", features };
};

const styleUrlForMode = (mode: MapStyleMode): string =>
  mode === "streets"
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
    : `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;

/** Juster bakgrunnsveier: gråtone = tydelig strek, fargekart = lavere opacity. */
function tuneBasemapRoadLayers(map: maplibregl.Map, mode: MapStyleMode) {
  const style = map.getStyle();
  if (!style?.layers) return;

  for (const layer of style.layers) {
    if (layer.type !== "line") continue;
    const idLower = layer.id.toLowerCase();
    if (!idLower.includes("road") && !idLower.includes("highway")) continue;

    try {
      if (mode === "light") {
        map.setPaintProperty(layer.id, "line-color", "#888888");
      } else if (mode === "streets") {
        map.setPaintProperty(layer.id, "line-opacity", 0.4);
      }
    } catch {
      // Lag uten line-color / line-opacity — ignorer
    }
  }
}

const CUSTOM_LINE_TOP_ORDER = ["nvdb-layer", "closed-layer", "detour-layer"] as const;

const MapEditor = React.forwardRef<MapEditorHandle, MapEditorProps>(function MapEditor(
  {
    activeTool,
    onClear,
    onUndo,
    editingAnnotation,
    onEditingAnnotationChange,
    onDeleteEditingAnnotation,
    mapStyle,
  },
  ref
) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const geocoderRef = useRef<InstanceType<typeof GeocodingControl> | null>(null);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const annotationsRef = useRef<Annotation[]>([]);
  annotationsRef.current = annotations;

  const activeToolRef = useRef(activeTool);
  const mapStyleRef = useRef(mapStyle);
  mapStyleRef.current = mapStyle;
  const styleLoadGeneration = useRef(0);

  const closedFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const detourPointsRef = useRef<Position[]>([]);
  const nvdbDataRef = useRef<FeatureCollection>(emptyFC());

  type HistoryAction =
    | { kind: "closed" }
    | { kind: "detour_point" }
    | { kind: "annotation"; id: string };
  const historyRef = useRef<HistoryAction[]>([]);

  const moveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  activeToolRef.current = activeTool;

  const pushSourceData = useCallback((sourceId: string, data: FeatureCollection) => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const src = m.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  }, []);

  const syncClosed = useCallback(() => {
    pushSourceData("closed-source", {
      type: "FeatureCollection",
      features: closedFeaturesRef.current,
    });
  }, [pushSourceData]);

  const syncDetour = useCallback(() => {
    const pts = detourPointsRef.current;
    const fc: FeatureCollection =
      pts.length >= 2
        ? {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: pts },
              },
            ],
          }
        : emptyFC();
    pushSourceData("detour-source", fc);
  }, [pushSourceData]);

  const syncNvdb = useCallback(() => {
    pushSourceData("nvdb-source", nvdbDataRef.current);
  }, [pushSourceData]);

  const syncAnnotationsToMap = useCallback(() => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const src = m.getSource("annotations-source") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const anns = annotationsRef.current;
    src.setData({
      type: "FeatureCollection",
      features: anns.map((a) => ({
        type: "Feature" as const,
        properties: { text: a.text, size: a.size, id: a.id },
        geometry: { type: "Point" as const, coordinates: a.coordinates },
      })),
    });
  }, []);

  const setupCustomLayers = useCallback(
    (mode: MapStyleMode) => {
      const m = map.current;
      if (!m) return;

      const ensureSource = (id: string, data: FeatureCollection) => {
        if (m.getSource(id)) return;
        m.addSource(id, { type: "geojson", data });
      };

      ensureSource("closed-source", {
        type: "FeatureCollection",
        features: closedFeaturesRef.current,
      });
      ensureSource(
        "detour-source",
        detourPointsRef.current.length >= 2
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: detourPointsRef.current,
                  },
                },
              ],
            }
          : emptyFC()
      );
      ensureSource("annotations-source", emptyFC());
      ensureSource("nvdb-source", nvdbDataRef.current);

      const addLineLayer = (
        id: string,
        source: string,
        color: string,
        width: number,
        opacity?: number
      ) => {
        if (m.getLayer(id)) return;
        m.addLayer({
          id,
          type: "line",
          source,
          paint: {
            "line-color": color,
            "line-width": width,
            ...(opacity != null ? { "line-opacity": opacity } : {}),
          },
        });
      };

      if (!m.getLayer("nvdb-layer")) {
        addLineLayer("nvdb-layer", "nvdb-source", "#64748b", 2, 0.55);
      }
      if (!m.getLayer("closed-layer")) {
        addLineLayer("closed-layer", "closed-source", SVV_COLORS.closedRoad, 6);
      }
      if (!m.getLayer("detour-layer")) {
        addLineLayer("detour-layer", "detour-source", SVV_COLORS.detour, 5);
      }
      if (!m.getLayer("annotations-layer")) {
        m.addLayer({
          id: "annotations-layer",
          type: "symbol",
          source: "annotations-source",
          layout: {
            "text-field": ["get", "text"],
            "text-size": ["get", "size"],
            "text-variable-anchor": ["top", "bottom", "left", "right"],
            "text-radial-offset": 0.5,
          },
          paint: {
            "text-color": "#111111",
            "text-halo-color": "#ffffff",
            "text-halo-width": 2,
          },
        });
      }

      for (const lid of CUSTOM_LINE_TOP_ORDER) {
        if (m.getLayer(lid)) m.moveLayer(lid);
      }
      if (m.getLayer("annotations-layer")) m.moveLayer("annotations-layer");

      tuneBasemapRoadLayers(m, mode);

      syncClosed();
      syncDetour();
      syncNvdb();
      syncAnnotationsToMap();
    },
    [syncAnnotationsToMap, syncClosed, syncDetour, syncNvdb]
  );

  const fetchNvdbRoadNetwork = useCallback(async () => {
    const m = map.current;
    if (!m?.isStyleLoaded()) return;
    const b = m.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    try {
      const res = await fetch(`/api/nvdb/vegnett?bbox=${encodeURIComponent(bbox)}`);
      if (!res.ok) return;
      const payload = await res.json();
      nvdbDataRef.current = nvdbPayloadToFeatureCollection(payload);
      syncNvdb();
    } catch {
      /* behold forrige */
    }
  }, [syncNvdb]);

  const setupCustomLayersRef = useRef(setupCustomLayers);
  setupCustomLayersRef.current = setupCustomLayers;
  const fetchNvdbRef = useRef(fetchNvdbRoadNetwork);
  fetchNvdbRef.current = fetchNvdbRoadNetwork;

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrlForMode(mapStyleRef.current),
      center: [10.75, 59.91],
      zoom: 12,
      preserveDrawingBuffer: true,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    } as maplibregl.MapOptions & { preserveDrawingBuffer?: boolean });

    const gc = new GeocodingControl({
      apiKey: MAPTILER_KEY,
      language: "no",
      country: "no",
    });
    geocoderRef.current = gc;
    map.current.addControl(gc, "top-left");

    map.current.on("load", () => {
      setupCustomLayersRef.current(mapStyleRef.current);
      void fetchNvdbRef.current();
    });

    map.current.on("click", (e) => {
      const tool = activeToolRef.current;
      const mm = map.current;
      if (!mm) return;

      if (tool === "text") {
        const newId = crypto.randomUUID();
        historyRef.current.push({ kind: "annotation", id: newId });
        setAnnotations((prev) => [
          ...prev,
          {
            id: newId,
            text: "Ny tekst",
            size: 16,
            coordinates: [e.lngLat.lng, e.lngLat.lat],
          },
        ]);
        setEditingId(newId);
        return;
      }

      if (tool === "closed") {
        const hits = mm.queryRenderedFeatures(e.point, { layers: ["nvdb-layer"] });
        const f = hits[0];
        if (!f?.geometry || f.geometry.type !== "LineString") return;
        closedFeaturesRef.current = [
          ...closedFeaturesRef.current,
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: f.geometry.coordinates,
            },
          },
        ];
        historyRef.current.push({ kind: "closed" });
        syncClosed();
        return;
      }

      if (tool === "detour") {
        detourPointsRef.current = [...detourPointsRef.current, [e.lngLat.lng, e.lngLat.lat]];
        historyRef.current.push({ kind: "detour_point" });
        syncDetour();
      }
    });

    map.current.on("moveend", () => {
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current);
      moveDebounceRef.current = setTimeout(() => {
        void fetchNvdbRoadNetwork();
      }, 500);
    });

    return () => {
      if (moveDebounceRef.current) clearTimeout(moveDebounceRef.current);
      if (map.current) {
        if (geocoderRef.current) {
          map.current.removeControl(geocoderRef.current);
          geocoderRef.current = null;
        }
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m?.loaded()) return;

    const gen = ++styleLoadGeneration.current;
    m.setStyle(styleUrlForMode(mapStyle));
    m.once("style.load", () => {
      if (gen !== styleLoadGeneration.current) return;
      setupCustomLayers(mapStyle);
      void fetchNvdbRoadNetwork();
    });
  }, [mapStyle, setupCustomLayers, fetchNvdbRoadNetwork]);

  useEffect(() => {
    const selected = annotations.find((a) => a.id === editingId) ?? null;
    onEditingAnnotationChange(
      selected
        ? { id: selected.id, text: selected.text, size: selected.size }
        : null
    );
  }, [editingId, annotations, onEditingAnnotationChange]);

  useEffect(() => {
    if (!editingAnnotation) return;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.id === editingAnnotation.id
          ? { ...a, text: editingAnnotation.text, size: editingAnnotation.size }
          : a
      )
    );
  }, [editingAnnotation]);

  useEffect(() => {
    syncAnnotationsToMap();
  }, [annotations, syncAnnotationsToMap]);

  const prevClearRef = useRef(onClear);
  useEffect(() => {
    if (prevClearRef.current === onClear) return;
    prevClearRef.current = onClear;
    closedFeaturesRef.current = [];
    detourPointsRef.current = [];
    nvdbDataRef.current = emptyFC();
    historyRef.current = [];
    setAnnotations([]);
    setEditingId(null);
    syncClosed();
    syncDetour();
    syncNvdb();
    void fetchNvdbRoadNetwork();
  }, [onClear, syncClosed, syncDetour, syncNvdb, fetchNvdbRoadNetwork]);

  const prevUndoRef = useRef(onUndo);
  useEffect(() => {
    if (prevUndoRef.current === onUndo) return;
    prevUndoRef.current = onUndo;
    const last = historyRef.current.pop();
    if (!last) return;
    if (last.kind === "closed") {
      closedFeaturesRef.current = closedFeaturesRef.current.slice(0, -1);
      syncClosed();
    } else if (last.kind === "detour_point") {
      detourPointsRef.current = detourPointsRef.current.slice(0, -1);
      syncDetour();
    } else if (last.kind === "annotation") {
      setAnnotations((prev) => prev.filter((a) => a.id !== last.id));
      setEditingId((id) => (id === last.id ? null : id));
    }
  }, [onUndo, syncClosed, syncDetour]);

  const prevDelAnnRef = useRef(onDeleteEditingAnnotation);
  useEffect(() => {
    if (prevDelAnnRef.current === onDeleteEditingAnnotation) return;
    prevDelAnnRef.current = onDeleteEditingAnnotation;
    if (!editingAnnotation) return;
    setAnnotations((prev) => prev.filter((a) => a.id !== editingAnnotation.id));
    setEditingId(null);
  }, [onDeleteEditingAnnotation, editingAnnotation]);

  useImperativeHandle(ref, () => ({
    downloadAsPng: () => {
      const m = map.current;
      if (!m) return;
      m.triggerRepaint();
      requestAnimationFrame(() => {
        const canvas = m.getCanvas();
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0);
        const link = document.createElement("a");
        link.download = "kart.png";
        link.href = out.toDataURL("image/png");
        link.click();
      });
    },
  }));

  return <div ref={mapContainer} className="h-full w-full bg-slate-50" />;
});

export default MapEditor;
