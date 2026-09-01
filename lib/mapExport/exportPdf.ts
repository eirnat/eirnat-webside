import { jsPDF } from 'jspdf';
import type { ExportResolution } from '@/lib/mapExport/types';
import { EXPORT_RESOLUTIONS } from '@/lib/mapExport/types';

/** 4:3 sideforhold i millimeter (A4-bredde med 4:3 høyde). */
const PDF_WIDTH_MM = 297;
const PDF_HEIGHT_MM = 222;

export const exportPdf = async (
  canvas: HTMLCanvasElement,
  resolution: ExportResolution
): Promise<void> => {
  const { width, height } = EXPORT_RESOLUTIONS[resolution];
  let output = canvas;
  if (canvas.width !== width || canvas.height !== height) {
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const ctx = scaled.getContext('2d');
    if (!ctx) throw new Error('Klarte ikke skalere PDF-bilde');
    ctx.drawImage(canvas, 0, 0, width, height);
    output = scaled;
  }

  const dataUrl = output.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [PDF_WIDTH_MM, PDF_HEIGHT_MM]
  });

  pdf.addImage(dataUrl, 'JPEG', 0, 0, PDF_WIDTH_MM, PDF_HEIGHT_MM);

  const fileDate = new Date().toISOString().slice(0, 10);
  pdf.save(`veiarbeidskart_${fileDate}.pdf`);
};
