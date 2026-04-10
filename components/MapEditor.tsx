"use client";
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = 'b9LxmFq6z6OEgzPzvrzA';

export type ActiveTool = 'none' | 'closed' | 'detour' | 'text';
export type MapEditorHandle = {
  downloadAsPng: () => void;
};

export interface MapEditorProps {
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  mapStyle: string; // 'light' eller 'streets'
  editingAnnotation: { id: string; text: string; size: number } | null;
  onEditingAnnotationChange: (annotation: { id: string; text: string; size: number } | null) => void;
  onDeleteEditingAnnotation: number;
}

const MapEditor = React.forwardRef<MapEditorHandle, MapEditorProps>((props, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  // Funksjon som legger til lagene på nytt (kjøres ved oppstart og stilbytte)
  const setupLayers = () => {
    const m = map.current;
    if (!m) return;

    // Legg til kilder hvis de ikke finnes
    if (!m.getSource('nvdb-source')) {
      m.addSource('nvdb-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('closed-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('detour-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('annotations-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
    }

    // Legg til lag hvis de ikke finnes
    if (!m.getLayer('nvdb-layer')) {
      m.addLayer({ id: 'nvdb-layer', type: 'line', source: 'nvdb-source', paint: { 'line-color': '#475569', 'line-width': 2, 'line-opacity': 0.6 }});
      m.addLayer({ id: 'closed-layer', type: 'line', source: 'closed-source', paint: { 'line-color': '#E60000', 'line-width': 6 }});
      m.addLayer({ id: 'detour-layer', type: 'line', source: 'detour-source', paint: { 'line-color': '#008b4a', 'line-width': 5 }});
      m.addLayer({ id: 'annotations-layer', type: 'symbol', source: 'annotations-source', layout: { 'text-field': ['get', 'text'], 'text-size': ['get', 'size'], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.5 }, paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }});
    }

    // Mørkne veier i Gråtone-modus
    const styleLayers = m.getStyle().layers;
    styleLayers?.forEach(layer => {
      if (layer.id.includes('road') || layer.id.includes('highway')) {
        if (props.mapStyle === 'light') {
          m.setPaintProperty(layer.id, 'line-color', '#888888');
        }
      }
    });
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl = props.mapStyle === 'streets'
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
      : `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;

    if (!map.current) {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: styleUrl,
        center: [10.75, 59.91],
        zoom: 12,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      });
      map.current.on('load', setupLayers);
    } else {
      map.current.setStyle(styleUrl);
      map.current.once('style.load', setupLayers);
    }
  }, [props.mapStyle]);

  useImperativeHandle(ref, () => ({
    downloadAsPng: () => {
      if (map.current) {
        const link = document.createElement('a');
        link.download = 'kart.png';
        link.href = map.current.getCanvas().toDataURL('image/png');
        link.click();
      }
    }
  }));

  return <div ref={mapContainer} className="h-full w-full" />;
});

MapEditor.displayName = "MapEditor";
export default MapEditor;
