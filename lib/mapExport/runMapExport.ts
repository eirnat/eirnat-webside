import { buildExportCanvas } from '@/lib/mapExport/buildExportCanvas';
import {
  captureMapAtResolution,
  hideMapLayers,
  restoreMapLayers,
  waitForMapIdle
} from '@/lib/mapExport/capture';
import {
  NVDB_EXPORT_HIDE_LAYER_IDS,
  USER_OVERLAY_LAYER_IDS
} from '@/lib/mapExport/constants';
import { exportPdf } from '@/lib/mapExport/exportPdf';
import { exportPng } from '@/lib/mapExport/exportPng';
import { exportSvg } from '@/lib/mapExport/exportSvg';
import type { ExportOptions, ExportSnapshot, ExportVectorData } from '@/lib/mapExport/types';
import { EXPORT_RESOLUTIONS } from '@/lib/mapExport/types';
import type maplibregl from 'maplibre-gl';

export type RunMapExportInput = {
  mapInstance: maplibregl.Map;
  mapContainer: HTMLDivElement;
  vectorData: ExportVectorData;
  options: ExportOptions;
  onPrepare?: () => Promise<void>;
  hideAnnotationMarkers?: () => void;
  showAnnotationMarkers?: () => void;
};

const buildRasterSnapshot = async (
  input: RunMapExportInput,
  targetWidth: number,
  targetHeight: number,
  hideUserOverlays: boolean
): Promise<ExportSnapshot> => {
  const { mapInstance, mapContainer, vectorData, onPrepare, hideAnnotationMarkers, showAnnotationMarkers } =
    input;

  if (onPrepare) {
    await onPrepare();
  }

  const hiddenLayers = hideMapLayers(mapInstance, [
    ...NVDB_EXPORT_HIDE_LAYER_IDS,
    ...(hideUserOverlays ? USER_OVERLAY_LAYER_IDS : [])
  ]);

  if (hideUserOverlays && hideAnnotationMarkers) {
    hideAnnotationMarkers();
  }

  mapInstance.triggerRepaint();
  await waitForMapIdle(mapInstance, 500);

  const { canvas, cssWidth, cssHeight } = await captureMapAtResolution(
    mapInstance,
    mapContainer,
    targetWidth,
    targetHeight
  );

  restoreMapLayers(mapInstance, hiddenLayers);
  if (hideUserOverlays && showAnnotationMarkers) {
    showAnnotationMarkers();
  }

  return {
    ...vectorData,
    mapCanvas: canvas,
    cssWidth,
    cssHeight
  };
};

export const runMapExport = async (input: RunMapExportInput): Promise<void> => {
  const { mapInstance, options } = input;
  const { width, height } = EXPORT_RESOLUTIONS[options.resolution];

  const getExportScales = () => {
    const bounds = mapInstance.getCanvas().getBoundingClientRect();
    return {
      scaleX: width / bounds.width,
      scaleY: height / bounds.height
    };
  };

  const projectToExport = (coordinates: [number, number]) => {
    const point = mapInstance.project(coordinates);
    const { scaleX, scaleY } = getExportScales();
    return { x: point.x * scaleX, y: point.y * scaleY };
  };

  if (options.format === 'svg') {
    const snapshot = await buildRasterSnapshot(input, width, height, true);
    const { scaleX, scaleY } = getExportScales();
    const exportScale = (scaleX + scaleY) / 2;
    await exportSvg({
      mapCanvas: snapshot.mapCanvas,
      targetWidth: width,
      targetHeight: height,
      exportScale,
      lines: snapshot.lines,
      signs: snapshot.signs,
      arrows: snapshot.arrows,
      annotations: snapshot.annotations,
      legendRows: snapshot.legendRows,
      showLegend: snapshot.showLegend,
      project: projectToExport
    });
    return;
  }

  const snapshot = await buildRasterSnapshot(input, width, height, false);
  const { scaleX, scaleY } = getExportScales();
  const canvas = await buildExportCanvas({
    mapCanvas: snapshot.mapCanvas,
    cssWidth: width / scaleX,
    cssHeight: height / scaleY,
    targetWidth: width,
    targetHeight: height,
    annotations: snapshot.annotations,
    showLegend: snapshot.showLegend,
    legendRows: snapshot.legendRows,
    project: (coordinates) => {
      const point = mapInstance.project(coordinates);
      return { x: point.x, y: point.y };
    }
  });

  if (options.format === 'png') {
    await exportPng(canvas, options.resolution);
    return;
  }

  await exportPdf(canvas, options.resolution);
};
