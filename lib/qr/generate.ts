import QRCode from "qrcode";
import { getRedirectUrl } from "@/lib/qr/site-url";

const QR_OPTIONS = {
  errorCorrectionLevel: "H" as const,
  margin: 4,
};

export async function generateQrSvg(slug: string): Promise<string> {
  const url = getRedirectUrl(slug);
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg" });
}

export async function generateQrPng(slug: string): Promise<Buffer> {
  const url = getRedirectUrl(slug);
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: 1024 });
}
