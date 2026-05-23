import bwipjs from 'bwip-js';

/**
 * Fase 11 — Helper compartido para renderizar barcodes como PNG buffer.
 * Usado por:
 *   - `LabelService` (etiquetas térmicas 50×30mm).
 *   - `PdfService` (barcode del número de documento en la guía de despacho).
 *
 * Usamos CODE128 por default: alfanumérico, denso, soportado por todas las
 * impresoras térmicas y scanners. El PNG resultante se inserta en jsPDF via
 * `doc.addImage(pngBuffer, 'PNG', x, y, w, h)`.
 */
export interface BarcodeOptions {
  /** Tipo de barcode bwip-js. Default `code128`. */
  bcid?: string;
  /** Factor de escala — píxeles por módulo. Más alto = más nítido pero más bytes. */
  scale?: number;
  /** Altura del barcode en mm (la lib lo mapea internamente). */
  height?: number;
  /** Si `true`, bwip-js dibuja el texto del código debajo de las barras. */
  includetext?: boolean;
}

export async function renderBarcodePng(
  text: string,
  options: BarcodeOptions = {},
): Promise<Buffer> {
  if (!text || !text.trim()) {
    throw new Error('renderBarcodePng: text vacío');
  }
  return new Promise<Buffer>((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: options.bcid ?? 'code128',
        text,
        scale: options.scale ?? 3,
        height: options.height ?? 12,
        includetext: options.includetext ?? false,
        backgroundcolor: 'FFFFFF',
      },
      (err, png) => {
        if (err) {
          // bwip-js puede pasar un string o un Error según el caso.
          reject(err instanceof Error ? err : new Error(String(err)));
        } else {
          resolve(png);
        }
      },
    );
  });
}
