import { ANNOTATION_EURO_GREEN } from '@/lib/mapExport/constants';
import type {
  ExportAnnotation,
  ExportArrow,
  ExportLegendRow,
  ExportLinePath,
  ExportSign,
  ExportVectorData
} from '@/lib/mapExport/types';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const wrapTextLines = (text: string, maxChars = 30): string[] => {
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
      if (candidate.length <= maxChars) {
        currentLine = candidate;
      } else {
        wrapped.push(currentLine);
        currentLine = word;
      }
    }
    wrapped.push(currentLine);
  }
  return wrapped;
};

const imageDataUrlCache = new Map<string, string>();

const fetchImageAsDataUrl = async (path: string): Promise<string> => {
  const cached = imageDataUrlCache.get(path);
  if (cached) return cached;

  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Klarte ikke laste bilde: ${path}`);
  }
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Klarte ikke lese bilde: ${path}`));
    reader.readAsDataURL(blob);
  });
  imageDataUrlCache.set(path, dataUrl);
  return dataUrl;
};

const lineToPath = (
  coordinates: [number, number][],
  project: (coordinates: [number, number]) => { x: number; y: number }
): string => {
  if (coordinates.length < 2) return '';
  const [first, ...rest] = coordinates;
  const start = project(first);
  const segments = rest.map((coord) => {
    const point = project(coord);
    return `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${segments.join(' ')}`;
};

const buildLinePathsSvg = (
  lines: ExportLinePath[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  scale: number
): string => {
  const casingWidth = 10 * scale;
  const mainWidth = 6 * scale;

  return lines
    .map((line) => {
      const path = lineToPath(line.coordinates, project);
      if (!path) return '';
      return `<path d="${path}" fill="none" stroke="${line.outlineColor}" stroke-width="${casingWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${path}" fill="none" stroke="${line.color}" stroke-width="${mainWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join('\n');
};

const buildSignsSvg = async (
  signs: ExportSign[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  exportScale: number
): Promise<string> => {
  const parts: string[] = [];
  for (const sign of signs) {
    const point = project(sign.coordinates);
    const dataUrl = await fetchImageAsDataUrl(sign.assetPath);
    const signWidth = sign.width * exportScale;
    const signHeight = sign.height * exportScale;
    const x = point.x - signWidth / 2;
    const y = point.y - signHeight / 2;
    parts.push(
      `<image href="${dataUrl}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${signWidth.toFixed(2)}" height="${signHeight.toFixed(2)}" />`
    );
  }
  return parts.join('\n');
};

const buildArrowsSvg = async (
  arrows: ExportArrow[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  exportScale: number
): Promise<string> => {
  const parts: string[] = [];
  for (const arrow of arrows) {
    const point = project(arrow.coordinates);
    const dataUrl = await fetchImageAsDataUrl(arrow.assetPath);
    const arrowWidth = arrow.width * exportScale;
    const arrowHeight = arrow.height * exportScale;
    const x = -arrowWidth / 2;
    const y = -arrowHeight / 2;
    parts.push(
      `<g transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${arrow.bearing.toFixed(2)})">
  <image href="${dataUrl}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${arrowWidth.toFixed(2)}" height="${arrowHeight.toFixed(2)}" />
</g>`
    );
  }
  return parts.join('\n');
};

const buildAnnotationsSvg = (
  annotations: ExportAnnotation[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  scale: number
): string => {
  const parts: string[] = [];
  for (const annotation of annotations) {
    const point = project(annotation.coordinates);
    const fontSize = Math.max(10, annotation.size) * scale;
    const padY = 5 * scale;
    const padX = 10 * scale;
    const lines = wrapTextLines(annotation.text || '', 30);
    const maxWidthCss = Math.max(250, annotation.size * 15) * scale;
    const lineHeight = fontSize;
    const totalTextHeight = lines.length * lineHeight;
    const hasBox = annotation.backgroundStyle !== 'none';
    const approxCharWidth = fontSize * 0.55;
    const measured = Math.max(...lines.map((line) => line.length * approxCharWidth), 0);
    const maxLineWidth = Math.min(measured, maxWidthCss);
    const boxWidth = hasBox ? maxLineWidth + padX * 2 : maxLineWidth;
    const boxHeight = hasBox ? totalTextHeight + padY * 2 : totalTextHeight;
    const rotation = annotation.rotation || 0;

    let inner = '';
    if (hasBox) {
      const rectX = -boxWidth / 2;
      const rectY = -boxHeight / 2;
      const radius = annotation.backgroundStyle === 'green' ? 2 * scale : 6 * scale;
      const fill = annotation.backgroundStyle === 'green' ? ANNOTATION_EURO_GREEN : '#ffffff';
      const stroke = annotation.backgroundStyle === 'green' ? '#ffffff' : '#000000';
      const strokeWidth = annotation.backgroundStyle === 'green' ? 1 * scale : 2 * scale;
      inner += `<rect x="${rectX.toFixed(2)}" y="${rectY.toFixed(2)}" width="${boxWidth.toFixed(2)}" height="${boxHeight.toFixed(2)}" rx="${radius.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth.toFixed(2)}" />`;
    }

    const textColor = annotation.backgroundStyle === 'green' ? '#ffffff' : '#111827';
    const fontWeight = annotation.backgroundStyle === 'white' ? 'normal' : 'bold';
    lines.forEach((line, index) => {
      const lineY = -(totalTextHeight / 2) + index * lineHeight + lineHeight / 2;
      inner += `<text x="0" y="${lineY.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize.toFixed(2)}" font-weight="${fontWeight}" fill="${textColor}">${escapeXml(line)}</text>`;
    });

    parts.push(
      `<g transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})">${inner}</g>`
    );
  }
  return parts.join('\n');
};

const buildLegendSvg = (
  legendRows: ExportLegendRow[],
  width: number,
  height: number,
  scale: number
): string => {
  if (legendRows.length === 0) return '';

  const boxX = 16 * scale;
  const boxW = 380 * scale;
  const boxPadding = 8 * scale;
  const rowGap = 8 * scale;
  const rowHeight = 18 * scale;
  const boxH =
    boxPadding * 2 + legendRows.length * rowHeight + Math.max(0, legendRows.length - 1) * rowGap;
  const boxY = height - 40 * scale - boxH;
  const legendRadius = 6 * scale;
  const casingWidth = 10 * scale;
  const mainWidth = 6 * scale;
  const lineLength = 64 * scale;

  let rows = '';
  legendRows.forEach((row, index) => {
    const rowY = boxY + boxPadding + rowHeight / 2 + index * (rowHeight + rowGap);
    const startX = boxX + boxPadding;
    const endX = startX + lineLength;
    rows += `<line x1="${startX.toFixed(2)}" y1="${rowY.toFixed(2)}" x2="${endX.toFixed(2)}" y2="${rowY.toFixed(2)}" stroke="${row.casingColor}" stroke-width="${casingWidth.toFixed(2)}" stroke-linecap="round" />
<line x1="${startX.toFixed(2)}" y1="${rowY.toFixed(2)}" x2="${endX.toFixed(2)}" y2="${rowY.toFixed(2)}" stroke="${row.mainColor}" stroke-width="${mainWidth.toFixed(2)}" stroke-linecap="round" />
<text x="${(startX + lineLength + 8 * scale).toFixed(2)}" y="${rowY.toFixed(2)}" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${(18 * scale).toFixed(2)}" font-weight="bold" fill="#111827">${escapeXml(row.label)}</text>`;
  });

  return `<g id="legend">
<rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${legendRadius.toFixed(2)}" fill="#ffffff" stroke="#000000" stroke-width="${(2 * scale).toFixed(2)}" />
${rows}
</g>`;
};

export type BuildSvgInput = ExportVectorData & {
  mapCanvas: HTMLCanvasElement;
  targetWidth: number;
  targetHeight: number;
  exportScale: number;
  project: (coordinates: [number, number]) => { x: number; y: number };
};

export const buildSvgDocument = async (input: BuildSvgInput): Promise<string> => {
  const {
    mapCanvas,
    targetWidth,
    targetHeight,
    exportScale,
    lines,
    signs,
    arrows,
    annotations,
    legendRows,
    showLegend,
    project
  } = input;

  const mapDataUrl = mapCanvas.toDataURL('image/png');
  const roadsSvg = buildLinePathsSvg(lines, project, exportScale);
  const signsSvg = await buildSignsSvg(signs, project, exportScale);
  const arrowsSvg = await buildArrowsSvg(arrows, project, exportScale);
  const annotationsSvg = buildAnnotationsSvg(annotations, project, exportScale);
  const legendSvg = showLegend ? buildLegendSvg(legendRows, targetWidth, targetHeight, exportScale) : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${targetWidth} ${targetHeight}" width="${targetWidth}" height="${targetHeight}">
  <rect width="100%" height="100%" fill="#ffffff" />
  <g id="map-background">
    <image href="${mapDataUrl}" x="0" y="0" width="${targetWidth}" height="${targetHeight}" />
  </g>
  <g id="roads">${roadsSvg}</g>
  <g id="signs">${signsSvg}</g>
  <g id="arrows">${arrowsSvg}</g>
  <g id="annotations">${annotationsSvg}</g>
  ${legendSvg}
</svg>`;
};

export const exportSvg = async (input: BuildSvgInput): Promise<void> => {
  const svg = await buildSvgDocument(input);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  const fileDate = new Date().toISOString().slice(0, 10);
  link.download = `veiarbeidskart_${fileDate}.svg`;
  link.click();
  URL.revokeObjectURL(objectUrl);
};
