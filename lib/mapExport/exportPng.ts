import type { ExportResolution } from '@/lib/mapExport/types';
import { EXPORT_RESOLUTIONS } from '@/lib/mapExport/types';

export const downloadCanvasAsPng = (canvas: HTMLCanvasElement, fileDate: string): Promise<void> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Klarte ikke generere PNG'));
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `veiarbeidskart_${fileDate}.png`;
      link.click();
      URL.revokeObjectURL(objectUrl);
      resolve();
    }, 'image/png');
  });

export const exportPng = async (
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
    if (!ctx) throw new Error('Klarte ikke skalere PNG');
    ctx.drawImage(canvas, 0, 0, width, height);
    output = scaled;
  }
  const fileDate = new Date().toISOString().slice(0, 10);
  await downloadCanvasAsPng(output, fileDate);
};
