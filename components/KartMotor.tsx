"use client";
import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = 'b9LxmFq6z6OEgzPzvrzA';

export type ActiveTool = 'none' | 'closed' | 'detour' | 'text';
export type MapEditorHandle = { downloadAsPng: () => void; };

export interface MapEditorProps {
  activeTool: ActiveTool;
  onClear: number;
  onUndo: number;
  mapStyle: string;
  editingAnnotation: any;
  onEditingAnnotationChange: (annotation: any) => void;
  onDeleteEditingAnnotation: number;
}

const KartMotor = forwardRef<MapEditorHandle, MapEditorProps>((props, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  
  // Tilstand for de ulike lagene
  const closedFeatures = useRef<any[]>([]);
  const detourFeatures = useRef<any[]>([]);
  const annotationFeatures = useRef<any[]>([]);

  // Funksjon for å hente NVDB-data
  const fetchVegnett = async () => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
    try {
      const response = await fetch(
        `/api/nvdb/vegnett?bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`
      );
      const data = await response.json();
      if (map.current.getSource('nvdb-source')) {
        (map.current.getSource('nvdb-source') as any).setData(data);
      }
    } catch (err) {
      console.error("Feil ved henting av vegnett:", err);
    }
  };

  const setupLayers = () => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    if (!m.getSource('nvdb-source')) {
      m.addSource('nvdb-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('closed-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('detour-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('annotations-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});

      m.addLayer({ id: 'nvdb-layer', type: 'line', source: 'nvdb-source', paint: { 'line-color': '#64748b', 'line-width': 2, 'line-opacity': 0.4 }});
      m.addLayer({ id: 'closed-layer', type: 'line', source: 'closed-source', paint: { 'line-color': '#E60000', 'line-width': 6 }});
      m.addLayer({ id: 'detour-layer', type: 'line', source: 'detour-source', paint: { 'line-color': '#008b4a', 'line-width': 5 }});
      m.addLayer({ 
        id: 'annotations-layer', 
        type: 'symbol', 
        source: 'annotations-source', 
        layout: { 
          'text-field': ['get', 'text'], 
          'text-size': ['get', 'size'],
          'text-variable-anchor': ['top', 'bottom', 'left', 'right'],
          'text-justify': 'auto'
        }, 
        paint: { 'text-color': '#000000', 'text-halo-color': '#ffffff', 'text-halo-width': 2 }
      });
    }
    fetchVegnett();
  };

  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl = props.mapStyle === 'streets'
      ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
      : `https://api.maptiler.com/maps/dataviz-light/style.json?key=${MAPTILER_KEY}`;

    if (!map.current) {
      const options: any = {
        container: mapContainer.current,
        style: styleUrl,
        center: [10.75, 59.91],
        zoom: 12,
        preserveDrawingBuffer: true
      };
      
      map.current = new maplibregl.Map(options);
      map.current.on('load', setupLayers);
      map.current.on('moveend', fetchVegnett);

      // Logikk for klikk på kartet
      map.current.on('click', (e) => {
        if (!map.current) return;
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['nvdb-layer'] });

        if (props.activeTool === 'closed' || props.activeTool === 'detour') {
          if (features.length > 0) {
            const newFeature = features[0];
            if (props.activeTool === 'closed') {
              closedFeatures.current = [...closedFeatures.current, newFeature];
              (map.current.getSource('closed-source') as any).setData({ type: 'FeatureCollection', features: closedFeatures.current });
            } else {
              detourFeatures.current = [...detourFeatures.current, newFeature];
              (map.current.getSource('detour-source') as any).setData({ type: 'FeatureCollection', features: detourFeatures.current });
            }
          }
        } else if (props.activeTool === 'text') {
          const id = Math.random().toString(36).substr(2, 9);
          const newLabel = {
            id,
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
            properties: { text: 'Ny tekst', size: 16, id }
          };
          annotationFeatures.current = [...annotationFeatures.current, newLabel];
          (map.current.getSource('annotations-source') as any).setData({ type: 'FeatureCollection', features: annotationFeatures.current });
          props.onEditingAnnotationChange({ id, text: 'Ny tekst', size: 16 });
        }
      });
    } else {
      map.current.setStyle(styleUrl, { diff: false });
      map.current.once('style.load', setupLayers);
    }
  }, [props.mapStyle, props.activeTool]);

  // Håndter Tøm kart
  useEffect(() => {
    if (props.onClear > 0 && map.current) {
      closedFeatures.current = [];
      detourFeatures.current = [];
      annotationFeatures.current = [];
      (map.current.getSource('closed-source') as any).setData({ type: 'FeatureCollection', features: [] });
      (map.current.getSource('detour-source') as any).setData({ type: 'FeatureCollection', features: [] });
      (map.current.getSource('annotations-source') as any).setData({ type: 'FeatureCollection', features: [] });
    }
  }, [props.onClear]);

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

  return <div ref={mapContainer} className="h-full w-full" style={{ minHeight: '500px' }} />;
});

KartMotor.displayName = "KartMotor";
export default KartMotor;