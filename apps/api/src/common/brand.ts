import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Marca oficial usada en los documentos generados (PDF de cotización, nota de
 * venta, guía de despacho y catálogo). Es fija en código a pedido del negocio:
 * los documentos siempre salen con el nombre y logo de la marca, sin depender
 * de la Configuración de la empresa (que sí aporta RUT, dirección, etc.).
 */
export const BRAND_NAME = 'Autopartes Gran Pacífico';

/** Relación de aspecto (ancho/alto) del logo embebido. */
export const BRAND_LOGO_RATIO = 1186 / 838;

// El logo se empaqueta como asset (nest-cli copia `src/assets/*.png` →
// `dist/assets`). `__dirname` en runtime es `dist/common`, así que subimos un
// nivel para llegar a `dist/assets`. En tests (ts-jest) corre desde
// `src/common` y resuelve a `src/assets`.
const LOGO_PATH = join(__dirname, '..', 'assets', 'brand-logo.png');

let cached: string | null | undefined;

/**
 * Devuelve el logo de la marca como data URL (base64) listo para
 * `doc.addImage()`. Cachea el resultado (incluido el fallo) para no leer disco
 * en cada PDF. Si el asset no está disponible, devuelve null y el caller debe
 * seguir sin logo (best-effort, el PDF nunca se rompe por esto).
 */
export async function getBrandLogoDataUrl(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const buf = await readFile(LOGO_PATH);
    cached = `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    cached = null;
  }
  return cached;
}
