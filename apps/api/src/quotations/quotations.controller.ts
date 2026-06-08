import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types';
import {
  fetchAllPages,
  MONEY_FMT,
  sendXlsx,
  stylizeSheet,
} from '../common/xlsx-export';
import { EmailService } from '../notifications/email.service';
import { PdfService } from '../notifications/pdf.service';
import {
  buildQuotationMessage,
  buildWhatsAppChooseUrl,
  buildWhatsAppUrl,
} from '../notifications/whatsapp.util';
import {
  CreateQuotationDto,
  GeneratePdfQueryDto,
  ListQuotationsQueryDto,
  SendEmailDto,
  SendWhatsappDto,
  SetStatusDto,
  UpdateQuotationDto,
} from './dto';
import { QuotationsService } from './quotations.service';

const QUOTATION_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CONVERTED: 'Convertida',
  EXPIRED: 'Vencida',
};

@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly svc: QuotationsService,
    private readonly pdf: PdfService,
    private readonly email: EmailService,
  ) {}

  @Get()
  list(@Query() query: ListQuotationsQueryDto) {
    return this.svc.list(query);
  }

  /**
   * Export XLSX — una fila por cotización con los datos de cabecera. Respeta
   * `q`, `status`, `customerId`, `dateFrom/To` pero ignora paginación
   * (batchea internamente via `fetchAllPages`).
   */
  @Get('export.xlsx')
  async exportXlsx(
    @Query() query: ListQuotationsQueryDto,
    @Res() res: Response,
  ) {
    const items = await fetchAllPages((page, pageSize) =>
      this.svc.list({ ...query, page, pageSize }),
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Inventory App';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Cotizaciones');
    sheet.columns = [
      { header: 'Número', key: 'number', width: 16 },
      { header: 'Fecha', key: 'date', width: 12 },
      { header: 'Válida hasta', key: 'validUntil', width: 14 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Cliente', key: 'customer', width: 30 },
      { header: 'RUT', key: 'taxId', width: 14 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Teléfono', key: 'phone', width: 18 },
      { header: 'Items', key: 'itemsCount', width: 8 },
      { header: 'Subtotal', key: 'subtotal', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'IVA', key: 'taxAmount', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Total', key: 'total', width: 14, style: { numFmt: MONEY_FMT } },
      { header: 'Vendedor', key: 'user', width: 22 },
      { header: 'Notas', key: 'notes', width: 30 },
      { header: 'Enviada', key: 'sentAt', width: 12 },
    ];

    for (const q of items) {
      sheet.addRow({
        number: q.number,
        date: q.date ? q.date.slice(0, 10) : '',
        validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
        status: QUOTATION_STATUS_LABEL[q.status] ?? q.status,
        customer: q.customerView?.name ?? '',
        taxId: q.customerView?.taxId ?? '',
        email: q.customerView?.email ?? '',
        phone: q.customerView?.phone ?? '',
        itemsCount: q.items?.length ?? 0,
        subtotal: Number(q.subtotal) || 0,
        taxAmount: Number(q.taxAmount) || 0,
        total: Number(q.total) || 0,
        user: q.user?.name ?? '',
        notes: q.notes ?? '',
        sentAt: q.sentAt ? q.sentAt.slice(0, 10) : '',
      });
    }

    stylizeSheet(sheet);
    await sendXlsx(res, wb, 'cotizaciones');
  }

  @Get(':id')
  getOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.getOne(id);
  }

  @Post()
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: JwtPayload) {
    return this.svc.create(dto, user.sub);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.update(id, dto, user.sub);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.markApproved(id);
  }

  @Post(':id/reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.svc.markRejected(id, dto.notes);
  }

  @Post(':id/convert')
  convert(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.convert(id);
  }

  @Post(':id/send/whatsapp')
  async sendWhatsapp(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendWhatsappDto,
  ) {
    const dto = await this.svc.getOne(id);
    const phone = body.to ?? dto.customerView.phone;
    // El teléfono ya NO es obligatorio: si no hay, devolvemos solo el link "sin
    // número" para que el usuario elija el contacto en WhatsApp.
    if (body.to && !dto.customerId) {
      await this.svc.setSnapshotPhone(id, body.to);
    }

    await this.svc.markSent(id);
    const updated = await this.svc.getOne(id);

    const totalFormatted = formatClp(updated.total);
    const message = buildQuotationMessage({
      customerName: updated.customerView.name || null,
      number: updated.number,
      totalFormatted,
      publicUrl: updated.publicUrl,
    });

    return {
      // Link al número registrado del cliente (null si no tiene número).
      whatsappUrl: phone ? buildWhatsAppUrl(phone, message) : null,
      // Link sin número: el usuario elige el contacto en WhatsApp. Siempre presente.
      whatsappChooseUrl: buildWhatsAppChooseUrl(message),
      phone: phone ?? null,
      status: updated.status,
      sentAt: updated.sentAt,
    };
  }

  @Post(':id/send/email')
  async sendEmail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SendEmailDto,
  ) {
    const dto = await this.svc.getOne(id);
    const to = body.to ?? dto.customerView.email;
    if (!to) {
      throw new BadRequestException(
        'Falta el email del cliente para enviar la cotización.',
      );
    }
    if (body.to && !dto.customerId) {
      await this.svc.setSnapshotEmail(id, body.to);
    }

    const settings = await this.svc.getSettings();
    const pdfBuffer = await this.pdf.generate(
      this.pdf.fromQuotationDto(dto, settings),
      'letter',
    );

    const subject = `Cotización ${dto.number} - ${settings.name}`;
    const html = buildEmailHtml(dto, settings);

    // El envío se hace ANTES del markSent. Si Resend falla, no se marca.
    await this.email.sendQuotation({
      to,
      subject,
      html,
      attachments: [
        {
          filename: `${dto.number}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    await this.svc.markSent(id);
    const updated = await this.svc.getOne(id);

    return {
      status: updated.status,
      sentAt: updated.sentAt,
    };
  }

  @Get(':id/pdf')
  async getPdf(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: GeneratePdfQueryDto,
    @Res() res: Response,
  ) {
    const dto = await this.svc.getOne(id);
    const settings = await this.svc.getSettings();
    const buffer = await this.pdf.generate(
      this.pdf.fromQuotationDto(dto, settings),
      query.format ?? 'letter',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${dto.number}.pdf"`,
    );
    res.send(buffer);
  }
}

function formatClp(value: string): string {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
}

function buildEmailHtml(
  q: { number: string; total: string; publicUrl: string; customerView: { name: string } },
  settings: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  },
): string {
  const greeting = q.customerView.name ? `Hola ${q.customerView.name},` : 'Hola,';
  const totalFormatted = formatClp(q.total);
  const logo = settings.logoUrl
    ? `<img src="${settings.logoUrl}" alt="${escapeHtml(settings.name)}" style="max-height:60px;display:block;margin-bottom:16px"/>`
    : '';
  return `<!DOCTYPE html>
<html>
  <body style="font-family:Arial,sans-serif;color:#222;background:#f7f7f7;margin:0;padding:0;">
    <table cellpadding="0" cellspacing="0" width="100%" style="background:#f7f7f7;padding:24px 0;">
      <tr><td align="center">
        <table cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:8px;padding:24px;border:1px solid #e5e5e5;">
          <tr><td>
            ${logo}
            <h2 style="margin:0 0 16px 0;color:#111;">Cotización ${escapeHtml(q.number)}</h2>
            <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 12px 0;">Te enviamos la cotización <strong>${escapeHtml(q.number)}</strong> por un total de <strong>${escapeHtml(totalFormatted)}</strong>.</p>
            <p style="margin:0 0 24px 0;">Adjuntamos también el PDF con el detalle.</p>
            <p style="margin:0 0 24px 0;">
              <a href="${escapeHtml(q.publicUrl)}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">Ver cotización</a>
            </p>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;"/>
            <p style="margin:0;color:#666;font-size:13px;">
              <strong>${escapeHtml(settings.name)}</strong><br/>
              ${settings.address ? escapeHtml(settings.address) + '<br/>' : ''}
              ${settings.phone ? escapeHtml(settings.phone) + '<br/>' : ''}
              ${settings.email ? escapeHtml(settings.email) : ''}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
