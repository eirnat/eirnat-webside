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
  
  const closedFeatures = useRef<any[]>([]);
  const detourFeatures = useRef<any[]>([]);
  const annotationFeatures = useRef<any[]>([]);

  const fetchVegnett = async () => {
    if (!map.current) return;
    const bounds = map.current.getBounds();
    const url = `/api/nvdb/vegnett?bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    
    console.log("Prøver å hente veier fra:", url);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`API feil: ${response.status}`);
      
      const data = await response.json();
      console.log("Hentet antall veiobjekter:", data.features?.length || 0);

      if (map.current.getSource('nvdb-source')) {
        (map.current.getSource('nvdb-source') as any).setData(data);
      }
    } catch (err) {
      console.error("Klarte ikke hente NVDB-data:", err);
    }
  };

  const setupLayers = () => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;

    console.log("Setter opp kartlag...");

    if (!m.getSource('nvdb-source')) {
      m.addSource('nvdb-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('closed-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('detour-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});
      m.addSource('annotations-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }});

      // Vi gjør NVDB-laget ekstremt synlig (sjokkrosa) for å feilsøke
      m.addLayer({ 
        id: 'nvdb-layer', 
        type: 'line', 
        source: 'nvdb-source', 
        paint: { 'line-color': '#ff00ff', 'line-width': 3, 'line-opacity': 0.8 }
      });

      m.addLayer({ id: 'closed-layer', type: 'line', source: 'closed-source', paint: { 'line-color': '#E60000', 'line-width': 6 }});
      m.addLayer({ id: 'detour-layer', type: 'line', source: 'detour-source', paint: { 'line-color': '#008b4a', 'line-width': 5 }});
      
      m.addLayer({ 
        id: 'annotations-layer', 
        type: 'symbol', 
        source: 'annotations-source', 
        layout: { 
          'text-field': ['get', 'text'], 
          'text-size': ['get', 'size'],
          'text-variable-anchor': ['top', 'bottom', 'left', 'right']
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
        zoom: 13, // Litt nærmere zoom for å være sikker på at API-et trigger
        preserveDrawingBuffer: true
      };
      
      map.current = new maplibregl.Map(options);
      map.current.on('load', setupLayers);
      map.current.on('moveend', fetchVegnett);

      map.current.on('click', (e) => {
        if (!map.current) return;
        
        // Sjekk hva som finnes under muspekeren
        const features = map.current.queryRenderedFeatures(e.point, { layers: ['nvdb-layer'] });
        console.log("Klikk registrert. Antall veier truffet:", features.length);

        if ((props.activeTool === 'closed' || props.activeTool === 'detour') && features.length > 0) {
          const newFeature = features[0];
          if (props.activeTool === 'closed') {
            closedFeatures.current = [...closedFeatures.current, newFeature];
            (map.current.getSource('closed-source') as any).setData({ type: 'FeatureCollection', features: closedFeatures.current });
          } else {
            detourFeatures.current = [...detourFeatures.current, newFeature];
            (map.current.getSource('detour-source') as any).setData({ type: 'FeatureCollection', features: detourFeatures.current });
          }
        }
      });
    } else {
      map.current.setStyle(styleUrl, { diff: false });
      map.current.once('style.load', setupLayers);
    }
  }, [props.mapStyle, props.activeTool]);

  return <div ref={mapContainer} className="h-full w-full" style={{ minHeight: '500px' }} />;
});

KartMotor.displayName = "KartMotor";
export default KartMotor;