export type ExportFormat = 'png' | 'pdf' | 'svg';

export type ExportResolution = '1600x1200' | '2400x1800' | '3200x2400';

export const EXPORT_RESOLUTIONS: Record<ExportResolution, { width: number; height: number }> = {
  '1600x1200': { width: 1600, height: 1200 },
  '2400x1800': { width: 2400, height: 1800 },
  '3200x2400': { width: 3200, height: 2400 }
};

export const DEFAULT_EXPORT_RESOLUTION: ExportResolution = '2400x1800';

export type ExportOptions = {
  format: ExportFormat;
  resolution: ExportResolution;
};

export type ExportAnnotation = {
  text: string;
  size: number;
  rotation: number;
  coordinates: [number, number];
  backgroundStyle: 'none' | 'white' | 'green';
};

export type ExportLegendRow = {
  label: string;
  casingColor: string;
  mainColor: string;
};

export type ExportLinePath = {
  coordinates: [number, number][];
  color: string;
  outlineColor: string;
};

export type ExportSign = {
  coordinates: [number, number];
  assetPath: string;
  width: number;
  height: number;
};

export type ExportArrow = {
  coordinates: [number, number];
  bearing: number;
  assetPath: string;
  width: number;
  height: number;
};

export type ExportVectorData = {
  lines: ExportLinePath[];
  signs: ExportSign[];
  arrows: ExportArrow[];
  annotations: ExportAnnotation[];
  legendRows: ExportLegendRow[];
  showLegend: boolean;
};

export type ExportSnapshot = ExportVectorData & {
  mapCanvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
};
