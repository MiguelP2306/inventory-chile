import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { jsPDF } from 'jspdf';
import { Repository } from 'typeorm';
import { renderBarcodePng } from '../common/barcode';
import { Stock } from '../database/entities';
import { SettingsService } from '../settings/settings.service';
import { ProductsService } from './products.service';

/**
 * Fase 11 — Generador de etiquetas térmicas 50×30mm para impresora de
 * código de barras.
 *
 * Diseño del label (50 mm ancho × 30 mm alto):
 *
 *   ┌──────────────────────────────────────────┐
 *   │  Nombre del producto (2 líneas máx, 7pt) │ ← 7mm
 *   ├──────────────────────────────────────────┤
 *   │                                          │
 *   │        ▌║▌▌▌║▌▌║▌║▌║▌▌║▌▌║▌▌            │ ← 14mm barcode CODE128
 *   │        SKU-FIL-AC-001                    │
 *   │                                          │
 *   ├──────────────────────────────────────────┤
 *   │ $15.000                       LOC: A-12  │ ← 6mm footer
 *   └──────────────────────────────────────────┘
 *
 * Por qué CODE128: alfanumérico (acepta SKUs no numéricos), denso, soportado
 * por TODAS las impresoras térmicas. Si el producto tiene `barcode` definido
 * usamos ese; si no, usamos el SKU como contenido del barcode.
 *
 * Por qué bwip-js: librería estándar para generar barcodes en Node. La usamos
 * para producir un PNG buffer que jsPDF inserta como imagen embebida.
 */
@Injectable()
export class LabelService {
  constructor(
    private readonly products: ProductsService,
    private readonly settings: SettingsService,
    @InjectRepository(Stock) private readonly stocks: Repository<Stock>,
  ) {}

  /**
   * Genera un PDF de 50×30 mm con N copias de la etiqueta de un producto.
   *
   *  - `qty`: cantidad de copias en el PDF (default 1). Cada copia ocupa una
   *    página independiente para que la impresora térmica las corte una por
   *    una. Cap en 100 para evitar PDFs gigantes accidentales.
   *  - `warehouseId`: si viene, se incluye el `Stock.locationCode` de esa
   *    bodega en el footer. Sin warehouse, footer solo con precio.
   */
  async generate(
    productId: string,
    options: { qty?: number; warehouseId?: string } = {},
  ): Promise<Buffer> {
    const qty = Math.min(Math.max(options.qty ?? 1, 1), 100);
    const product = await this.products.getOne(productId);
    if (!product) throw new NotFoundException('Producto no encontrado');

    // El contenido del barcode: priorizamos el `barcode` cargado por el cliente
    // (típicamente el EAN/UPC original del producto). Si no tiene, usamos el
    // SKU — el sistema garantiza unicidad.
    const codeText = (product.barcode ?? product.sku ?? '').trim();
    if (!codeText) {
      // Edge case: producto sin SKU ni barcode (no debería pasar, pero el
      // schema permite SKU null si la creación falla a medias).
      throw new NotFoundException(
        'El producto no tiene SKU ni código de barras — no se puede generar etiqueta',
      );
    }

    // Datos comunes a todas las páginas.
    const settings = await this.settings.get();
    const currencyFmt = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: settings.currency || 'CLP',
      maximumFractionDigits: 0,
    });
    const priceText = currencyFmt.format(Number(product.price) || 0);

    let locationText = '';
    if (options.warehouseId) {
      const stock = await this.stocks.findOne({
        where: { productId: product.id, warehouseId: options.warehouseId },
      });
      if (stock?.locationCode) locationText = `LOC: ${stock.locationCode}`;
    }

    // Generar el barcode UNA vez (todas las copias son idénticas) — es
    // PNG buffer, lo reusamos en cada page.addImage.
    const barcodePng = await renderBarcodePng(codeText, { height: 12 });

    // jsPDF en milímetros. Cada página es una etiqueta independiente.
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [50, 30], // 50mm ancho × 30mm alto
    });

    for (let i = 0; i < qty; i += 1) {
      if (i > 0) doc.addPage([50, 30], 'landscape');
      this.drawLabel(doc, {
        name: product.name,
        sku: product.sku ?? '',
        codeText,
        priceText,
        locationText,
        barcodePng,
      });
    }

    return Buffer.from(doc.output('arraybuffer'));
  }

  /**
   * Dibuja una etiqueta en la página actual del jsPDF. Coordenadas en mm.
   *
   * Layout (50×30):
   *   - Nombre: arriba, 7pt, hasta 2 líneas, truncado con "..." si excede.
   *   - Barcode: centrado horizontalmente, ~14mm de alto, en y=8.
   *   - SKU: debajo del barcode, 7pt mono.
   *   - Footer: y=27, izquierda=precio (bold), derecha=locationCode (si hay).
   */
  private drawLabel(
    doc: jsPDF,
    args: {
      name: string;
      sku: string;
      codeText: string;
      priceText: string;
      locationText: string;
      barcodePng: Buffer;
    },
  ): void {
    const W = 50;
    const H = 30;

    // Header — nombre del producto, recortado a lo que entra en 2 líneas
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    const lines = doc.splitTextToSize(args.name, W - 4);
    const visibleLines = (lines as string[]).slice(0, 2);
    visibleLines.forEach((line, idx) => {
      doc.text(line, 2, 3 + idx * 3);
    });

    // Barcode — centrado horizontalmente. Ancho 40mm, alto 12mm.
    const bcW = 40;
    const bcH = 12;
    const bcX = (W - bcW) / 2;
    const bcY = 9;
    doc.addImage(args.barcodePng, 'PNG', bcX, bcY, bcW, bcH);

    // Texto del código debajo del barcode (en monoespaciada para legibilidad)
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text(args.codeText, W / 2, bcY + bcH + 3, { align: 'center' });

    // Footer — precio izquierda + location derecha
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(args.priceText, 2, H - 2);
    if (args.locationText) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(args.locationText, W - 2, H - 2, { align: 'right' });
    }
  }
}
