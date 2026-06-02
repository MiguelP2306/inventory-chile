import { Injectable, Logger } from '@nestjs/common';
import type {
  DispatchNoteDto,
  PaymentMethodDto,
  PublicQuotationDto,
  QuotationDto,
  QuotationStatusDto,
  SaleDto,
  SaleStatusDto,
} from '@inventory/shared';
import { readFile } from 'fs/promises';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { join } from 'path';
import { renderBarcodePng } from '../common/barcode';
import { BRAND_LOGO_RATIO, BRAND_NAME, getBrandLogoDataUrl } from '../common/brand';
import { CompanySettings } from '../database/entities';
import { UPLOADS_ROOT } from '../uploads/upload-config';

export type PdfFormat = 'letter' | 'thermal80';

interface CompanyInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  quotationFooter: string | null;
}

interface CustomerInfo {
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
}

interface QuotationItemLine {
  code: string;
  description: string;
  qty: number;
  unitPrice: string;
  discount: string;
  discountPercent: string | null;
  subtotal: string;
}

/**
 * Tipo del documento. El mismo render se reutiliza para cotizaciones y ventas
 * (Fase 7); el título y algunos detalles cambian.
 */
type DocumentKind = 'quotation' | 'sale';

interface PdfInput {
  kind: DocumentKind;
  number: string;
  date: string;
  // Solo cotizaciones tienen "válida hasta". En ventas es null.
  validUntil: string | null;
  // El tipo aquí se mantiene amplio para no acoplar PdfInput al estado de
  // cada documento — el renderer no usa el estado para nada cosmético salvo
  // el badge informativo, que solo se imprime para cotizaciones por ahora.
  status: QuotationStatusDto | SaleStatusDto;
  // null cuando el viewer no tiene permiso (USER en ventas). El renderer
  // omite la línea correspondiente.
  subtotal: string | null;
  taxAmount: string | null;
  total: string;
  notes: string | null;
  customer: CustomerInfo;
  items: QuotationItemLine[];
  company: CompanyInfo;
  // Solo aplica a ventas: método de pago + comisión tarjeta (cuando aplica).
  // null para usuarios sin permiso financiero.
  paymentMethod?: PaymentMethodDto | null;
  commissionAmount?: string | null;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generate(input: PdfInput, format: PdfFormat = 'letter'): Promise<Buffer> {
    if (format === 'thermal80') {
      return this.generateThermal(input);
    }
    return this.generateLetter(input);
  }

  /**
   * Helper para construir el input desde un QuotationDto + CompanySettings.
   * Usado por el endpoint logueado.
   */
  fromQuotationDto(
    q: QuotationDto,
    settings: CompanySettings,
  ): PdfInput {
    return {
      kind: 'quotation',
      number: q.number,
      date: q.date,
      validUntil: q.validUntil,
      status: q.status,
      subtotal: q.subtotal,
      taxAmount: q.taxAmount,
      total: q.total,
      notes: q.notes,
      customer: {
        name: q.customerView.name,
        taxId: q.customerView.taxId,
        email: q.customerView.email,
        phone: q.customerView.phone,
      },
      items: (q.items ?? []).map((it) => ({
        code:
          it.product?.partNumber ??
          it.product?.sku ??
          it.tempProductPartNumber ??
          it.tempProductSku ??
          '',
        description: it.product?.name ?? it.tempProductName ?? '',
        qty: it.qty,
        unitPrice: it.unitPrice,
        discount: it.discount,
        discountPercent: it.discountPercent,
        subtotal: it.subtotal,
      })),
      company: {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        taxId: settings.taxId,
        logoUrl: settings.logoUrl,
        quotationFooter: settings.quotationFooter,
      },
    };
  }

  fromPublicDto(p: PublicQuotationDto): PdfInput {
    return {
      kind: 'quotation',
      number: p.number,
      date: p.date,
      validUntil: p.validUntil,
      status: p.status,
      subtotal: p.subtotal,
      taxAmount: p.taxAmount,
      total: p.total,
      notes: p.notes,
      customer: p.customer,
      items: p.items,
      company: p.company,
    };
  }

  /**
   * Construye el input para imprimir una "Nota de venta" desde un SaleDto.
   * Diferencias clave con cotización:
   *  - kind='sale' → cambia el título del documento.
   *  - validUntil siempre null (la venta no vence).
   *  - paymentMethod + commissionAmount agregan una línea en los totales.
   */
  fromSaleDto(s: SaleDto, settings: CompanySettings): PdfInput {
    return {
      kind: 'sale',
      number: s.number,
      date: s.date,
      validUntil: null,
      status: s.status,
      subtotal: s.subtotal,
      taxAmount: s.taxAmount,
      total: s.total,
      notes: s.notes,
      paymentMethod: s.paymentMethod,
      commissionAmount: s.commissionAmount,
      customer: {
        name: s.customer?.name ?? 'Sin especificar',
        taxId: s.customer?.taxId ?? null,
        email: s.customer?.email ?? null,
        phone: s.customer?.phone ?? null,
      },
      items: (s.items ?? []).map((it) => ({
        code:
          it.product?.partNumber ??
          it.product?.sku ??
          '',
        description: it.product?.name ?? '',
        qty: it.qty,
        unitPrice: it.unitPrice,
        discount: it.discount,
        discountPercent: it.discountPercent,
        subtotal: it.subtotal,
      })),
      company: {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        taxId: settings.taxId,
        logoUrl: settings.logoUrl,
        quotationFooter: settings.quotationFooter,
      },
    };
  }

  private async generateLetter(input: PdfInput): Promise<Buffer> {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    // Marca fija (logo + nombre). El logo se embebe desde el asset empaquetado;
    // si falla, seguimos sin él (best-effort).
    const logoH = 50;
    const logoW = Math.round(logoH * BRAND_LOGO_RATIO);
    const brandLogo = await getBrandLogoDataUrl();
    if (brandLogo) {
      try {
        doc.addImage(brandLogo, 'PNG', margin, y, logoW, logoH);
      } catch (err) {
        this.logger.warn(`No se pudo cargar el logo: ${(err as Error).message}`);
      }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(BRAND_NAME, pageWidth - margin, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let rightY = y + 28;
    if (input.company.taxId) {
      doc.text(`RUT: ${input.company.taxId}`, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    if (input.company.address) {
      doc.text(input.company.address, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    if (input.company.phone) {
      doc.text(input.company.phone, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    if (input.company.email) {
      doc.text(input.company.email, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }

    y = Math.max(y + 60, rightY) + 10;

    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    const docLabel = input.kind === 'sale' ? 'Nota de venta' : 'Cotización';
    doc.text(`${docLabel} ${input.number}`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 16;
    doc.text(`Fecha: ${formatDate(input.date)}`, margin, y);
    if (input.validUntil) {
      doc.text(
        `Válida hasta: ${formatDate(input.validUntil)}`,
        margin + 200,
        y,
      );
    }
    y += 14;
    doc.text(`Estado: ${translateStatus(input.status)}`, margin, y);
    if (input.kind === 'sale' && input.paymentMethod) {
      doc.text(
        `Pago: ${translatePaymentMethod(input.paymentMethod)}`,
        margin + 200,
        y,
      );
    }
    y += 18;

    // Cliente box
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente', margin, y);
    doc.setFont('helvetica', 'normal');
    y += 14;
    doc.text(input.customer.name || 'Sin especificar', margin, y);
    y += 12;
    if (input.customer.taxId) {
      doc.text(`RUT: ${input.customer.taxId}`, margin, y);
      y += 12;
    }
    if (input.customer.email) {
      doc.text(input.customer.email, margin, y);
      y += 12;
    }
    if (input.customer.phone) {
      doc.text(input.customer.phone, margin, y);
      y += 12;
    }
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Código', 'Descripción', 'Cant', 'P. Unit', 'Desc', 'Subtotal']],
      body: input.items.map((it) => [
        it.code,
        it.description,
        it.qty.toString(),
        formatMoney(it.unitPrice),
        it.discountPercent
          ? `${parseFloat(it.discountPercent).toFixed(2)}%`
          : formatMoney(it.discount),
        formatMoney(it.subtotal),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [40, 40, 40] },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });

    // @ts-expect-error lastAutoTable es agregado por jspdf-autotable
    const tableEnd = doc.lastAutoTable?.finalY ?? y;
    let totalsY = tableEnd + 20;

    const totalsX = pageWidth - margin - 200;
    doc.setFontSize(10);
    // Subtotal, IVA y comisión solo si el viewer tiene el desglose.
    if (input.subtotal != null) {
      doc.text('Subtotal neto:', totalsX, totalsY);
      doc.text(formatMoney(input.subtotal), pageWidth - margin, totalsY, {
        align: 'right',
      });
      totalsY += 14;
    }
    if (input.taxAmount != null) {
      doc.text('IVA:', totalsX, totalsY);
      doc.text(formatMoney(input.taxAmount), pageWidth - margin, totalsY, {
        align: 'right',
      });
      totalsY += 14;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Total:', totalsX, totalsY);
    doc.text(formatMoney(input.total), pageWidth - margin, totalsY, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Notas de la cotización (visibles al cliente final). Las renderizamos
    // debajo de los totales con un título "Notas" para distinguirlas del
    // footer general de la empresa.
    if (input.notes && input.notes.trim()) {
      let notesY = totalsY + 28;
      doc.setFont('helvetica', 'bold');
      doc.text('Notas', margin, notesY);
      notesY += 12;
      doc.setFont('helvetica', 'normal');
      const wrapped = doc.splitTextToSize(
        input.notes.trim(),
        pageWidth - margin * 2,
      );
      doc.text(wrapped, margin, notesY);
    }

    if (input.company.quotationFooter) {
      const footerY = doc.internal.pageSize.getHeight() - margin;
      doc.text(input.company.quotationFooter, margin, footerY, {
        maxWidth: pageWidth - margin * 2,
      });
    }

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  private async generateThermal(input: PdfInput): Promise<Buffer> {
    // 80 mm = ~226.77 pt; alto crece con el contenido. Empezamos con uno
    // generoso y dejamos que jsPDF agregue páginas si hace falta.
    const widthPt = 226.77;
    const doc = new jsPDF({
      unit: 'pt',
      format: [widthPt, 800],
    });
    const margin = 8;
    let y = margin + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(BRAND_NAME, widthPt / 2, y, { align: 'center' });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    if (input.company.taxId) {
      doc.text(`RUT: ${input.company.taxId}`, widthPt / 2, y, {
        align: 'center',
      });
      y += 9;
    }
    if (input.company.address) {
      doc.text(input.company.address, widthPt / 2, y, {
        align: 'center',
        maxWidth: widthPt - margin * 2,
      });
      y += 9;
    }
    if (input.company.phone) {
      doc.text(input.company.phone, widthPt / 2, y, { align: 'center' });
      y += 9;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const docLabel = input.kind === 'sale' ? 'Nota de venta' : 'Cotización';
    doc.text(`${docLabel} ${input.number}`, widthPt / 2, y, { align: 'center' });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Fecha: ${formatDate(input.date)}`, margin, y);
    y += 9;
    if (input.validUntil) {
      doc.text(`Válida hasta: ${formatDate(input.validUntil)}`, margin, y);
      y += 9;
    }
    if (input.kind === 'sale' && input.paymentMethod) {
      doc.text(
        `Pago: ${translatePaymentMethod(input.paymentMethod)}`,
        margin,
        y,
      );
      y += 9;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', margin, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.text(input.customer.name || 'Sin especificar', margin, y, {
      maxWidth: widthPt - margin * 2,
    });
    y += 9;
    if (input.customer.taxId) {
      doc.text(`RUT: ${input.customer.taxId}`, margin, y);
      y += 9;
    }

    autoTable(doc, {
      startY: y + 4,
      head: [['Cant', 'Descripción', 'Subtotal']],
      body: input.items.map((it) => [
        it.qty.toString(),
        `${it.code ? it.code + ' · ' : ''}${it.description}`,
        formatMoney(it.subtotal),
      ]),
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 40], fontSize: 6 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'right' },
        2: { cellWidth: 50, halign: 'right' },
      },
      margin: { left: margin, right: margin },
      tableWidth: widthPt - margin * 2,
    });

    // @ts-expect-error lastAutoTable es agregado por jspdf-autotable
    const tableEnd = doc.lastAutoTable?.finalY ?? y;
    let totalsY = tableEnd + 8;

    doc.setFontSize(7);
    if (input.subtotal != null) {
      doc.text('Subtotal neto:', margin, totalsY);
      doc.text(formatMoney(input.subtotal), widthPt - margin, totalsY, {
        align: 'right',
      });
      totalsY += 9;
    }
    if (input.taxAmount != null) {
      doc.text('IVA:', margin, totalsY);
      doc.text(formatMoney(input.taxAmount), widthPt - margin, totalsY, {
        align: 'right',
      });
      totalsY += 9;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Total:', margin, totalsY);
    doc.text(formatMoney(input.total), widthPt - margin, totalsY, {
      align: 'right',
    });
    totalsY += 12;

    if (input.notes && input.notes.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('Notas:', margin, totalsY);
      totalsY += 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      const wrapped = doc.splitTextToSize(
        input.notes.trim(),
        widthPt - margin * 2,
      );
      doc.text(wrapped, margin, totalsY);
      // jsPDF no nos dice cuánto ocupó; aproximamos con la cant. de líneas.
      const lines = Array.isArray(wrapped) ? wrapped.length : 1;
      totalsY += lines * 8 + 4;
    }

    if (input.company.quotationFooter) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text(input.company.quotationFooter, margin, totalsY, {
        maxWidth: widthPt - margin * 2,
      });
    }

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  // ============================================================
  // GUÍAS DE DESPACHO (Fase 7.7)
  //
  // Estructura distinta a cotización/venta: sin totales, items con solo
  // cantidad + producto, snapshot de dirección de entrega + carrier.
  // Mantenemos un tipo `DispatchPdfInput` separado y dos renderers
  // propios — más simple que extender el PdfInput existente con campos
  // condicionales.
  // ============================================================

  fromDispatchNoteDto(
    d: DispatchNoteDto,
    settings: CompanySettings,
  ): DispatchPdfInput {
    const addressParts = [
      d.addressStreet,
      d.addressNumber,
      d.commune ? `${d.commune.name}` : null,
    ].filter(Boolean) as string[];
    return {
      number: d.number,
      dispatchedAt: d.dispatchedAt,
      saleNumber: d.sale?.number ?? '',
      customer: {
        name: d.sale?.customer?.name ?? 'Sin especificar',
        taxId: d.sale?.customer?.taxId ?? null,
      },
      delivery: {
        addressLine: addressParts.join(' ').trim() || null,
        addressNotes: d.addressNotes,
        carrier: d.carrier,
        trackingNumber: d.trackingNumber,
      },
      items: (d.sale?.items ?? []).map((it) => ({
        code: it.product?.sku ?? '',
        description: it.product?.name ?? '',
        qty: it.qty,
      })),
      notes: d.notes,
      voided: d.status === 'VOIDED',
      company: {
        name: settings.name,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        taxId: settings.taxId,
        logoUrl: settings.logoUrl,
        // No se renderea en la guía pero CompanyInfo lo requiere — la guía
        // usa un layout distinto sin footer general.
        quotationFooter: settings.quotationFooter,
      },
    };
  }

  async generateDispatch(
    input: DispatchPdfInput,
    format: PdfFormat = 'letter',
  ): Promise<Buffer> {
    if (format === 'thermal80') return this.generateDispatchThermal(input);
    return this.generateDispatchLetter(input);
  }

  private async generateDispatchLetter(
    input: DispatchPdfInput,
  ): Promise<Buffer> {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    // Header marca fija (logo + nombre).
    const logoH = 50;
    const logoW = Math.round(logoH * BRAND_LOGO_RATIO);
    const brandLogo = await getBrandLogoDataUrl();
    if (brandLogo) {
      try {
        doc.addImage(brandLogo, 'PNG', margin, y, logoW, logoH);
      } catch (err) {
        this.logger.warn(`No se pudo cargar el logo: ${(err as Error).message}`);
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(BRAND_NAME, pageWidth - margin, y + 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let rightY = y + 28;
    if (input.company.taxId) {
      doc.text(`RUT: ${input.company.taxId}`, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    if (input.company.address) {
      doc.text(input.company.address, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    if (input.company.phone) {
      doc.text(input.company.phone, pageWidth - margin, rightY, {
        align: 'right',
      });
      rightY += 12;
    }
    y = Math.max(y + 60, rightY) + 10;

    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;

    // Título del documento.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`Guía de despacho ${input.number}`, margin, y);
    if (input.voided) {
      doc.setTextColor(200, 0, 0);
      doc.text('ANULADA', pageWidth - margin, y, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    } else {
      // Fase 11 — barcode CODE128 del número de guía, esquina superior derecha
      // del título. Permite escanear la guía con scanner USB/cámara para
      // tracking interno o reimprimir copias. Si bwip-js falla, seguimos sin
      // el barcode (best-effort, el PDF nunca se rompe por esto).
      try {
        const barcodePng = await renderBarcodePng(input.number, {
          height: 8,
          scale: 2,
        });
        const bcW = 110;
        const bcH = 22;
        doc.addImage(
          barcodePng,
          'PNG',
          pageWidth - margin - bcW,
          y - 16,
          bcW,
          bcH,
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo generar barcode de guía: ${(err as Error).message}`,
        );
      }
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 16;
    doc.text(`Fecha despacho: ${formatDate(input.dispatchedAt)}`, margin, y);
    if (input.saleNumber) {
      doc.text(
        `Venta origen: ${input.saleNumber}`,
        margin + 240,
        y,
      );
    }
    y += 18;

    // Cliente + Entrega en dos columnas.
    const colWidth = (pageWidth - margin * 2) / 2 - 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente', margin, y);
    doc.text('Entrega', margin + colWidth + 20, y);
    doc.setFont('helvetica', 'normal');
    y += 14;

    let colLeftY = y;
    doc.text(input.customer.name, margin, colLeftY);
    colLeftY += 12;
    if (input.customer.taxId) {
      doc.text(`RUT: ${input.customer.taxId}`, margin, colLeftY);
      colLeftY += 12;
    }

    let colRightY = y;
    const rx = margin + colWidth + 20;
    if (input.delivery.addressLine) {
      const wrapped = doc.splitTextToSize(input.delivery.addressLine, colWidth);
      doc.text(wrapped, rx, colRightY);
      colRightY += (Array.isArray(wrapped) ? wrapped.length : 1) * 12;
    }
    if (input.delivery.addressNotes) {
      const wrapped = doc.splitTextToSize(
        input.delivery.addressNotes,
        colWidth,
      );
      doc.text(wrapped, rx, colRightY);
      colRightY += (Array.isArray(wrapped) ? wrapped.length : 1) * 12;
    }
    if (input.delivery.carrier) {
      doc.text(`Transportista: ${input.delivery.carrier}`, rx, colRightY);
      colRightY += 12;
    }
    if (input.delivery.trackingNumber) {
      doc.text(`N° seguimiento: ${input.delivery.trackingNumber}`, rx, colRightY);
      colRightY += 12;
    }

    y = Math.max(colLeftY, colRightY) + 10;

    // Tabla de items (sin precios — la guía es un documento operativo).
    autoTable(doc, {
      startY: y,
      head: [['Código', 'Descripción', 'Cant.']],
      body: input.items.map((it) => [
        it.code,
        it.description,
        it.qty.toString(),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [40, 40, 40] },
      columnStyles: {
        2: { halign: 'right', cellWidth: 50 },
      },
      margin: { left: margin, right: margin },
    });

    // @ts-expect-error lastAutoTable es agregado por jspdf-autotable
    let afterTableY = doc.lastAutoTable?.finalY ?? y;
    afterTableY += 20;

    if (input.notes && input.notes.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones', margin, afterTableY);
      afterTableY += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const wrapped = doc.splitTextToSize(
        input.notes.trim(),
        pageWidth - margin * 2,
      );
      doc.text(wrapped, margin, afterTableY);
    }

    // Firma del receptor.
    const sigY = doc.internal.pageSize.getHeight() - margin - 40;
    doc.setDrawColor(0);
    doc.line(margin, sigY, margin + 200, sigY);
    doc.setFontSize(8);
    doc.text('Firma y aclaración del receptor', margin, sigY + 12);

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  private async generateDispatchThermal(
    input: DispatchPdfInput,
  ): Promise<Buffer> {
    const widthPt = 226.77;
    const doc = new jsPDF({ unit: 'pt', format: [widthPt, 800] });
    const margin = 8;
    let y = margin + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(BRAND_NAME, widthPt / 2, y, { align: 'center' });
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    if (input.company.taxId) {
      doc.text(`RUT: ${input.company.taxId}`, widthPt / 2, y, {
        align: 'center',
      });
      y += 9;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Guía ${input.number}`, widthPt / 2, y, { align: 'center' });
    y += 10;
    if (input.voided) {
      doc.setTextColor(200, 0, 0);
      doc.text('ANULADA', widthPt / 2, y, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      y += 10;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Fecha: ${formatDate(input.dispatchedAt)}`, margin, y);
    y += 9;
    if (input.saleNumber) {
      doc.text(`Venta: ${input.saleNumber}`, margin, y);
      y += 9;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', margin, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.text(input.customer.name, margin, y, {
      maxWidth: widthPt - margin * 2,
    });
    y += 9;
    if (input.customer.taxId) {
      doc.text(`RUT: ${input.customer.taxId}`, margin, y);
      y += 9;
    }
    y += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Entrega:', margin, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    if (input.delivery.addressLine) {
      const wrapped = doc.splitTextToSize(
        input.delivery.addressLine,
        widthPt - margin * 2,
      );
      doc.text(wrapped, margin, y);
      y += (Array.isArray(wrapped) ? wrapped.length : 1) * 9;
    }
    if (input.delivery.carrier) {
      doc.text(`${input.delivery.carrier}`, margin, y);
      y += 9;
    }
    if (input.delivery.trackingNumber) {
      doc.text(`Tracking: ${input.delivery.trackingNumber}`, margin, y);
      y += 9;
    }

    autoTable(doc, {
      startY: y + 4,
      head: [['Cant', 'Producto']],
      body: input.items.map((it) => [
        it.qty.toString(),
        `${it.code ? it.code + ' · ' : ''}${it.description}`,
      ]),
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [40, 40, 40], fontSize: 6 },
      columnStyles: { 0: { cellWidth: 20, halign: 'right' } },
      margin: { left: margin, right: margin },
      tableWidth: widthPt - margin * 2,
    });

    // @ts-expect-error lastAutoTable es agregado por jspdf-autotable
    let tableEnd = doc.lastAutoTable?.finalY ?? y;
    tableEnd += 8;

    if (input.notes && input.notes.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text('Observaciones:', margin, tableEnd);
      tableEnd += 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      const wrapped = doc.splitTextToSize(
        input.notes.trim(),
        widthPt - margin * 2,
      );
      doc.text(wrapped, margin, tableEnd);
    }

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  /**
   * Ronda 10 — genera el catálogo de productos en PDF. Una página de
   * portada con datos de la empresa y filtros aplicados; luego cards
   * de productos (4 por página en A4, layout 2 columnas × 2 filas) con
   * imagen + nombre + datos. Los productos sin foto muestran un
   * placeholder con un ícono.
   */
  async generateCatalog(input: CatalogPdfInput): Promise<Buffer> {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const widthPt = doc.internal.pageSize.getWidth();
    const heightPt = doc.internal.pageSize.getHeight();
    const margin = 40;

    // ----- Cabecera de portada -----
    const catLogoH = 56;
    const catLogoW = Math.round(catLogoH * BRAND_LOGO_RATIO);
    const brandLogo = await getBrandLogoDataUrl();
    if (brandLogo) {
      try {
        doc.addImage(brandLogo, 'PNG', margin, margin, catLogoW, catLogoH);
      } catch {
        // logo opcional — si falla seguimos sin él.
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(BRAND_NAME, margin + catLogoW + 15, margin + 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Catálogo de productos', margin + catLogoW + 15, margin + 45);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      `Generado el ${formatDate(input.generatedAt)}`,
      margin + catLogoW + 15,
      margin + 60,
    );

    // Filtros aplicados (si los hay).
    if (input.filterSummary) {
      doc.setTextColor(80);
      doc.setFontSize(9);
      const wrapped = doc.splitTextToSize(
        `Filtros: ${input.filterSummary}`,
        widthPt - margin * 2,
      );
      doc.text(wrapped, margin, margin + 95);
    }

    // Contador de productos.
    doc.setTextColor(80);
    doc.setFontSize(9);
    doc.text(
      `${input.products.length} producto${input.products.length === 1 ? '' : 's'}`,
      margin,
      margin + 115,
    );
    doc.setTextColor(0);

    // Si no hay productos, terminamos en la portada con un mensaje.
    if (input.products.length === 0) {
      doc.setFontSize(12);
      doc.text(
        'No hay productos para los filtros aplicados.',
        margin,
        margin + 150,
      );
      const arrayBuffer = doc.output('arraybuffer');
      return Buffer.from(arrayBuffer);
    }

    // ----- Cards de productos: 2 columnas × 2 filas por página -----
    // El layout es uniforme: cada card mide (ancho-2margen)/2 - gap × altura fija.
    const cols = 2;
    const rows = 2;
    const gap = 16;
    const cardWidth = (widthPt - margin * 2 - gap * (cols - 1)) / cols;
    const cardHeight = (heightPt - (margin + 150) - margin - gap) / rows;
    const startY = margin + 150;
    let pageIndex = 0;

    for (let i = 0; i < input.products.length; i++) {
      const p = input.products[i]!;
      const idxOnPage = i % (cols * rows);
      if (idxOnPage === 0 && i > 0) {
        doc.addPage();
        pageIndex += 1;
      }
      const col = idxOnPage % cols;
      const row = Math.floor(idxOnPage / cols);
      const x = margin + col * (cardWidth + gap);
      // En páginas siguientes a la portada usamos todo el alto disponible.
      const cardStartY =
        pageIndex === 0 ? startY : margin;
      const cardHeightActual =
        pageIndex === 0
          ? cardHeight
          : (heightPt - margin * 2 - gap) / rows;
      const y = cardStartY + row * (cardHeightActual + gap);

      // Marco de la card.
      doc.setDrawColor(220);
      doc.setLineWidth(0.5);
      doc.rect(x, y, cardWidth, cardHeightActual);

      // Imagen del producto (cover) ocupando ~1/3 vertical izquierdo.
      const imgSize = Math.min(cardHeightActual - 20, 100);
      const imgX = x + 10;
      const imgY = y + 10;
      if (p.coverUrl) {
        try {
          const dataUrl = await fetchAsDataUrl(p.coverUrl);
          if (dataUrl) {
            // Ronda 12 — detectar el format real del data URL en vez de
            // asumir JPEG. PNG con header JPEG silenciaba la imagen.
            const format = formatFromDataUrl(dataUrl);
            doc.addImage(dataUrl, format, imgX, imgY, imgSize, imgSize);
          } else {
            this.drawImagePlaceholder(doc, imgX, imgY, imgSize);
          }
        } catch {
          this.drawImagePlaceholder(doc, imgX, imgY, imgSize);
        }
      } else {
        this.drawImagePlaceholder(doc, imgX, imgY, imgSize);
      }

      // Datos del producto a la derecha de la imagen.
      const textX = imgX + imgSize + 12;
      const textWidth = cardWidth - (textX - x) - 10;
      let textY = imgY + 12;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0);
      const nameLines = doc.splitTextToSize(p.name, textWidth);
      // Tope de 2 líneas para el nombre.
      doc.text(nameLines.slice(0, 2), textX, textY);
      textY += 11 * Math.min(nameLines.length, 2) + 4;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110);
      const meta: string[] = [];
      if (p.sku) meta.push(`SKU: ${p.sku}`);
      if (p.partNumber) meta.push(`Parte: ${p.partNumber}`);
      if (meta.length) {
        doc.text(meta.join(' · '), textX, textY);
        textY += 11;
      }
      if (p.categoryPath ?? p.categoryName) {
        doc.text(
          `Categoría: ${p.categoryPath ?? p.categoryName!}`,
          textX,
          textY,
        );
        textY += 11;
      }
      if (p.brandName) {
        doc.text(`Marca: ${p.brandName}`, textX, textY);
        textY += 11;
      }
      doc.text(
        `Tipo: ${p.productKind === 'ORIGINAL' ? 'Original' : 'Alternativo'}`,
        textX,
        textY,
      );
      textY += 11;

      if (p.description) {
        doc.setTextColor(80);
        const wrap = doc.splitTextToSize(p.description, textWidth);
        // Tope de 3 líneas para descripción.
        doc.text(wrap.slice(0, 3), textX, textY);
        textY += 9 * Math.min(wrap.length, 3) + 4;
      }

      // Precio prominente abajo del card.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(0);
      const priceText = `$${formatMoney(p.price)}`;
      doc.text(priceText, textX, y + cardHeightActual - 12);
    }

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
  }

  private drawImagePlaceholder(
    doc: jsPDF,
    x: number,
    y: number,
    size: number,
  ): void {
    doc.setFillColor(245, 245, 245);
    doc.rect(x, y, size, size, 'F');
    doc.setTextColor(180);
    doc.setFontSize(8);
    doc.text(
      'sin foto',
      x + size / 2,
      y + size / 2,
      { align: 'center', baseline: 'middle' },
    );
    doc.setTextColor(0);
  }
}

// ============================================================
// Tipo separado para guías (estructura distinta a quotation/sale).
// ============================================================

export interface DispatchPdfInput {
  number: string;
  dispatchedAt: string;
  saleNumber: string;
  customer: {
    name: string;
    taxId: string | null;
  };
  delivery: {
    addressLine: string | null;
    addressNotes: string | null;
    carrier: string | null;
    trackingNumber: string | null;
  };
  items: Array<{
    code: string;
    description: string;
    qty: number;
  }>;
  notes: string | null;
  voided: boolean;
  company: CompanyInfo;
}

function formatMoney(value: string | null): string {
  if (value == null) return '—';
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('es-CL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL');
}

function translateStatus(s: QuotationStatusDto | SaleStatusDto): string {
  switch (s) {
    case 'DRAFT':
      return 'Borrador';
    case 'SENT':
      return 'Enviada';
    case 'APPROVED':
      return 'Aprobada';
    case 'REJECTED':
      return 'Rechazada';
    case 'CONVERTED':
      return 'Convertida en venta';
    case 'EXPIRED':
      return 'Vencida';
    case 'PENDING':
      return 'Pendiente';
    case 'PAID':
      return 'Pagada';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return s;
  }
}

function translatePaymentMethod(m: PaymentMethodDto): string {
  switch (m) {
    case 'CASH':
      return 'Efectivo';
    case 'TRANSFER':
      return 'Transferencia';
    case 'CARD_DEBIT':
      return 'Tarjeta de débito';
    case 'CARD_CREDIT':
      return 'Tarjeta de crédito';
    case 'PAYMENT_LINK':
      return 'Link de pago';
    default:
      return m;
  }
}

/**
 * Carga una imagen como data URL para embeber en el PDF.
 *
 * Ronda 12 — soporta dos modos:
 *  - URL absoluta (`http://`, `https://`): HTTP fetch como antes.
 *  - URL relativa empezando con `/uploads/`: lee directo del filesystem
 *    (`UPLOADS_ROOT + path`). Más rápido, sin red, sin depender de que
 *    `PUBLIC_API_URL` esté configurada o de que el server pueda resolver
 *    su propio host.
 *
 * Cuando `apps/api/uploads/` migre a S3/Cloudinary, las URLs en DB
 * pasarán a ser absolutas y este helper hará HTTP fetch automáticamente.
 */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    // Caso 1 — URL absoluta. HTTP fetch.
    if (/^https?:\/\//.test(url)) {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get('content-type') ?? 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    // Caso 2 — URL relativa `/uploads/...`. Lectura directa de disco.
    if (url.startsWith('/uploads/')) {
      // Las URLs en DB son tipo `/uploads/products/<uuid>.<ext>`. El path
      // físico es `UPLOADS_ROOT/products/<uuid>.<ext>` (UPLOADS_ROOT ya
      // apunta al dir `uploads`, no incluye el segmento `/uploads`).
      const relativePath = url.replace(/^\/uploads\//, '');
      const filePath = join(UPLOADS_ROOT, relativePath);
      const buf = await readFile(filePath);
      const mime = mimeFromExt(filePath);
      return `data:${mime};base64,${buf.toString('base64')}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** MIME guess por extensión — usado al leer del disco (sin Content-Type). */
function mimeFromExt(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/png';
  }
}

/**
 * Ronda 12 — extrae el formato (`PNG | JPEG | WEBP`) del prefijo MIME de
 * un data URL para pasárselo correctamente a `doc.addImage()`. Si no se
 * reconoce, cae a `PNG` (jsPDF es más permisivo con PNG que con JPEG).
 */
function formatFromDataUrl(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg'))
    return 'JPEG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'PNG';
}

// ============== Ronda 10 — Catálogo PDF ==============

/**
 * Línea por producto que renderiza el catálogo. El service llena estos
 * datos a partir de los productos filtrados + sus relaciones (categoría,
 * marca, cover image).
 */
export interface CatalogProductLine {
  sku: string | null;
  name: string;
  partNumber: string | null;
  description: string | null;
  categoryName: string | null;
  // Si la categoría tiene padre, lo concatenamos como "Padre › Hija".
  categoryPath: string | null;
  brandName: string | null;
  // null cuando el viewer no tiene permiso para ver costos (USER).
  cost: string | null;
  price: string;
  productKind: 'ORIGINAL' | 'ALTERNATIVE';
  coverUrl: string | null;
}

export interface CatalogPdfInput {
  company: CompanyInfo;
  generatedAt: string;
  // Filtros aplicados, mostrados en la cabecera para que el operador sepa
  // qué muestra el documento.
  filterSummary: string;
  products: CatalogProductLine[];
}
