import QRCode from 'qrcode';

/** A QR code as SVG text. Dark brown on white with a quiet zone, so it scans when printed. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#1F1613', light: '#FFFFFF' } });
}
