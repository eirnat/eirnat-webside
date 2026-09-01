import { ANNOTATION_EURO_GREEN } from '@/lib/mapExport/constants';
import type { ExportAnnotation, ExportLegendRow } from '@/lib/mapExport/types';

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

const drawAnnotations = (
  ctx: CanvasRenderingContext2D,
  annotations: ExportAnnotation[],
  project: (coordinates: [number, number]) => { x: number; y: number },
  scaleX: number,
  scaleY: number
): void => {
  for (const annotation of annotations) {
    const point = project(annotation.coordinates);
    const posX = point.x * scaleX;
    const posY = point.y * scaleY;
    const fontSize = Math.max(10, annotation.size) * scaleY;
    const padY = 5 * scaleY;
    const padX = 10 * scaleX;
    const lineHeight = fontSize;
    const lines = wrapTextLines(annotation.text || '', 30);
    const maxWidthCss = Math.max(250, annotation.size * 15) * scaleX;

    ctx.save();
    ctx.font = `${annotation.backgroundStyle === 'white' ? 'normal' : 'bold'} ${fontSize}px Arial, sans-serif`;
    const measured = Math.max(...lines.map((line) => ctx.measureText(line).width), 0);
    const maxLineWidth = Math.min(measured, maxWidthCss);
    const totalTextHeight = lines.length * lineHeight;
    const hasBox = annotation.backgroundStyle !== 'none';
    const boxWidth = hasBox ? maxLineWidth + padX * 2 : maxLineWidth;
    const boxHeight = hasBox ? totalTextHeight + padY * 2 : totalTextHeight;

    ctx.translate(posX, posY);
    ctx.rotate(((annotation.rotation || 0) * Math.PI) / 180);

    if (hasBox) {
      const rectX = -boxWidth / 2;
      const rectY = -boxHeight / 2;
      const radius = annotation.backgroundStyle === 'green' ? 2 * scaleY : 6 * scaleY;

      ctx.beginPath();
      ctx.roundRect(rectX, rectY, boxWidth, boxHeight, radius);
      if (annotation.backgroundStyle === 'green') {
        ctx.fillStyle = ANNOTATION_EURO_GREEN;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1 * scaleY;
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2 * scaleY;
      }
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = annotation.backgroundStyle === 'green' ? '#ffffff' : '#111827';
    lines.forEach((line, index) => {
      const lineY = -(totalTextHeight / 2) + index * lineHeight + lineHeight / 2;
      ctx.fillText(line, 0, lineY);
    });
    ctx.restore();
  }
};

const drawLegend = (
  ctx: CanvasRenderingContext2D,
  legendRows: ExportLegendRow[],
  exportWidth: number,
  exportHeight: number,
  scaleX: number,
  scaleY: number
): void => {
  if (legendRows.length === 0) return;

  const boxX = 16 * scaleX;
  const boxW = 380 * scaleX;
  const boxPadding = 8 * scaleY;
  const rowGap = 8 * scaleY;
  const rowHeight = 18 * scaleY;
  const boxH =
    boxPadding * 2 + legendRows.length * rowHeight + Math.max(0, legendRows.length - 1) * rowGap;
  const boxY = exportHeight - 40 * scaleY - boxH;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2 * scaleY;
  const legendRadius = 6 * scaleY;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, legendRadius);
  ctx.fill();
  ctx.stroke();

  const drawLegendLine = (y: number, casingColor: string, mainColor: string) => {
    const startX = boxX + boxPadding;
    const endX = boxX + boxPadding + 64 * scaleX;
    ctx.lineCap = 'round';
    ctx.strokeStyle = casingColor;
    ctx.lineWidth = 10 * scaleY;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 6 * scaleY;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
  };

  ctx.fillStyle = '#111827';
  ctx.font = `bold ${18 * scaleY}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  legendRows.forEach((row, index) => {
    const rowY = boxY + boxPadding + rowHeight / 2 + index * (rowHeight + rowGap);
    drawLegendLine(rowY, row.casingColor, row.mainColor);
    ctx.fillText(row.label, boxX + boxPadding + 64 * scaleX + 8 * scaleX, rowY);
  });
  ctx.restore();
};

export type BuildExportCanvasInput = {
  mapCanvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
  targetWidth: number;
  targetHeight: number;
  annotations: ExportAnnotation[];
  showLegend: boolean;
  legendRows: ExportLegendRow[];
  project: (coordinates: [number, number]) => { x: number; y: number };
};

export const buildExportCanvas = async (input: BuildExportCanvasInput): Promise<HTMLCanvasElement> => {
  const {
    mapCanvas,
    cssWidth,
    cssHeight,
    targetWidth,
    targetHeight,
    annotations,
    showLegend,
    legendRows,
    project
  } = input;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetWidth;
  exportCanvas.height = targetHeight;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Klarte ikke opprette eksport-canvas');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(mapCanvas, 0, 0, targetWidth, targetHeight);

  const scaleX = targetWidth / cssWidth;
  const scaleY = targetHeight / cssHeight;

  if (annotations.length > 0 && 'fonts' in document) {
    await document.fonts.ready;
  }

  drawAnnotations(ctx, annotations, project, scaleX, scaleY);

  if (showLegend && legendRows.length > 0) {
    drawLegend(ctx, legendRows, targetWidth, targetHeight, scaleX, scaleY);
  }

  return exportCanvas;
};
