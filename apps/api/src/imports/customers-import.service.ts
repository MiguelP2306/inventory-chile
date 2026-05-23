import type {
  ContactImportErrorDto,
  CustomerImportPreviewDto,
  CustomerImportResultDto,
  CustomerImportRowDto,
} from '@inventory/shared';
import { CustomerSource } from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import { DataSource, In, Repository } from 'typeorm';
import {
  findHeaderRow,
  lastDataRow,
  normalizeHeader,
  readCellText,
} from '../common/xlsx-import';
import { isValidPhone, normalizePhone } from '../common/validators/phone';
import { isValidRut, normalizeRut } from '../common/validators/rut';
import { Commune, Customer } from '../database/entities';

const COLUMNS = [
  'taxId',
  'name',
  'email',
  'phone',
  'whatsappPhone',
  'addressStreet',
  'addressNumber',
  'communeName',
  'internalNotes',
] as const;
type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  taxId: 'RUT',
  name: 'Nombre',
  email: 'Email',
  phone: 'Telefono',
  whatsappPhone: 'WhatsApp',
  addressStreet: 'Direccion',
  addressNumber: 'Numero',
  communeName: 'Comuna',
  internalNotes: 'Notas internas',
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Importador masivo de clientes vía XLSX. Mismo patrón que Fase 10 productos:
 * subir → preview → confirmar. Estrategia UPSERT por RUT con partial success.
 *
 * Reglas de validación por fila:
 *  - `name` es obligatorio.
 *  - `taxId` (RUT) es obligatorio para upsert. Sin RUT no se puede determinar
 *    create vs update, y el cliente no podría facturarse luego.
 *  - `taxId` se valida con módulo 11 y se normaliza al formato canónico
 *    (`12345678-9`).
 *  - `phone` / `whatsappPhone` se validan con libphonenumber-js (default CL)
 *    y se normalizan a E.164.
 *  - `email` se valida con regex liviano.
 *  - `communeName` se mapea por nombre case-insensitive contra el catálogo
 *    de 346 comunas chilenas. Si no encuentra, error inline.
 */
@Injectable()
export class CustomersImportService {
  private readonly logger = new Logger(CustomersImportService.name);

  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Commune)
    private readonly communes: Repository<Commune>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async preview(buffer: Buffer): Promise<CustomerImportPreviewDto> {
    const parsed = await this.parseExcel(buffer);

    const taxIds = parsed.valid.map((r) => r.taxId);
    const existing = taxIds.length
      ? await this.customers.find({
          where: { taxId: In(taxIds) },
          select: { id: true, taxId: true },
        })
      : [];
    const existingMap = new Map(existing.map((c) => [c.taxId, c.id]));

    let createCount = 0;
    let updateCount = 0;
    const rowsWithAction: CustomerImportRowDto[] = parsed.valid.map((r) => {
      const existingId = (r.taxId && existingMap.get(r.taxId)) ?? null;
      const action: CustomerImportRowDto['action'] = existingId
        ? 'update'
        : 'create';
      if (action === 'create') createCount += 1;
      else updateCount += 1;
      return { ...r, action, existingCustomerId: existingId };
    });

    return {
      totalRows: parsed.totalRows,
      validCount: rowsWithAction.length,
      createCount,
      updateCount,
      errorCount: parsed.errors.length,
      previewRows: rowsWithAction.slice(0, 10),
      errors: parsed.errors,
    };
  }

  async confirm(buffer: Buffer): Promise<CustomerImportResultDto> {
    const parsed = await this.parseExcel(buffer);

    const taxIds = parsed.valid.map((r) => r.taxId);
    const existing = taxIds.length
      ? await this.customers.find({
          where: { taxId: In(taxIds) },
          select: { id: true, taxId: true },
        })
      : [];
    const existedBefore = new Set(
      existing.map((c) => c.taxId).filter((t): t is string => !!t),
    );

    const errors: ContactImportErrorDto[] = [...parsed.errors];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = parsed.errors.length;

    for (const row of parsed.valid) {
      try {
        await this.upsertCustomer(row);
        if (existedBefore.has(row.taxId)) {
          updatedCount += 1;
        } else {
          createdCount += 1;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err ?? 'unknown');
        errors.push({
          rowNumber: row.rowNumber,
          taxId: row.taxId,
          message,
        });
        failedCount += 1;
        this.logger.warn(
          `Row ${row.rowNumber} (RUT ${row.taxId}) failed: ${message}`,
        );
      }
    }

    return {
      importedCount: createdCount + updatedCount,
      createdCount,
      updatedCount,
      failedCount,
      errors,
    };
  }

  async generateTemplate(): Promise<Buffer> {
    const wb = new Workbook();
    wb.creator = 'Inventario';
    wb.created = new Date();

    const sheet = wb.addWorksheet('Clientes');
    sheet.columns = COLUMNS.map((col) => ({
      header: HEADERS[col],
      key: col,
      width: Math.max(HEADERS[col].length + 2, 18),
    }));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };
    sheet.addRow({
      taxId: '12345678-9',
      name: 'Juan Pérez',
      email: 'juan@example.cl',
      phone: '+56912345678',
      whatsappPhone: '+56912345678',
      addressStreet: 'Av. Providencia',
      addressNumber: '1234',
      communeName: 'Providencia',
      internalNotes: 'Cliente referido por Pedro',
    });

    const inst = wb.addWorksheet('Instrucciones');
    inst.columns = [
      { header: 'Columna', key: 'col', width: 24 },
      { header: 'Obligatoria', key: 'req', width: 12 },
      { header: 'Descripcion', key: 'desc', width: 90 },
    ];
    inst.getRow(1).font = { bold: true };
    const ROWS: Array<[Column, boolean, string]> = [
      ['taxId', true, 'RUT chileno con DV. Acepta con o sin puntos (12.345.678-9 o 12345678-9). Se usa como llave del upsert.'],
      ['name', true, 'Nombre del cliente.'],
      ['email', false, 'Email opcional. Si viene, debe ser válido.'],
      ['phone', false, 'Teléfono de contacto. Acepta formato local (912345678) o internacional (+56912345678).'],
      ['whatsappPhone', false, 'Teléfono específico para WhatsApp. Si vacío, los botones wa.me caen al "Telefono" general.'],
      ['addressStreet', false, 'Calle de la dirección.'],
      ['addressNumber', false, 'Numero de la dirección.'],
      ['communeName', false, 'Nombre exacto de la comuna (ej: "Providencia", "Las Condes"). Si no existe en el catálogo, la fila falla.'],
      ['internalNotes', false, 'Notas internas que NO aparecen en cotizaciones ni en el portal del cliente.'],
    ];
    for (const [col, req, desc] of ROWS) {
      inst.addRow({ col: HEADERS[col], req: req ? 'Si' : 'No', desc });
    }

    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  // ---------- helpers privados ----------

  private async parseExcel(buffer: Buffer): Promise<{
    totalRows: number;
    valid: Omit<CustomerImportRowDto, 'action' | 'existingCustomerId'>[];
    errors: ContactImportErrorDto[];
  }> {
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'archivo invalido';
      throw new BadRequestException(`No se pudo leer el Excel: ${message}`);
    }

    const sheet =
      wb.getWorksheet('Clientes') ??
      wb.worksheets.find((w) => w.rowCount > 0) ??
      wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El Excel no tiene hojas.');
    }

    const found = findHeaderRow(sheet, HEADERS, ['taxId', 'name']);
    if (!found) {
      throw new BadRequestException(
        'No encontré las columnas obligatorias "RUT" y "Nombre" en las primeras 5 filas. Descargá la plantilla.',
      );
    }
    const { headerRowNumber, colIndex } = found;

    // Catálogo de comunas (346) precargado en memoria para resolver el lookup
    // por nombre sin un query por fila. Se ignoran acentos para que "Ñuñoa" y
    // "Nunoa" matchéen.
    const allCommunes = await this.communes.find();
    const communeByKey = new Map<string, { id: string; name: string }>();
    for (const c of allCommunes) {
      communeByKey.set(normalizeHeader(c.name), { id: c.id, name: c.name });
    }

    const valid: Omit<CustomerImportRowDto, 'action' | 'existingCustomerId'>[] = [];
    const errors: ContactImportErrorDto[] = [];

    const lastRowNumber = lastDataRow(sheet);
    let totalDataRows = 0;
    let consecutiveEmpty = 0;
    const seenTaxIds = new Set<string>();

    for (let r = headerRowNumber + 1; r <= lastRowNumber; r += 1) {
      const row = sheet.getRow(r);
      const cellText = (col: Column): string => {
        const idx = colIndex[col];
        if (idx === undefined) return '';
        return readCellText(row.getCell(idx));
      };

      const isFullyEmpty = COLUMNS.every((col) => cellText(col) === '');
      if (isFullyEmpty) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= 50) break;
        continue;
      }
      consecutiveEmpty = 0;
      totalDataRows += 1;

      const taxIdRaw = cellText('taxId');
      const name = cellText('name');

      if (taxIdRaw === '') {
        errors.push({ rowNumber: r, taxId: null, message: 'RUT vacío' });
        continue;
      }
      if (!isValidRut(taxIdRaw)) {
        errors.push({
          rowNumber: r,
          taxId: taxIdRaw,
          message: `RUT inválido: "${taxIdRaw}" (formato esperado 12345678-9)`,
        });
        continue;
      }
      const taxId = normalizeRut(taxIdRaw);

      if (name === '') {
        errors.push({ rowNumber: r, taxId, message: 'Nombre vacío' });
        continue;
      }
      if (name.length > 180) {
        errors.push({
          rowNumber: r,
          taxId,
          message: `Nombre supera 180 caracteres (tiene ${name.length})`,
        });
        continue;
      }
      if (seenTaxIds.has(taxId)) {
        errors.push({
          rowNumber: r,
          taxId,
          message: `RUT "${taxId}" aparece más de una vez en el Excel`,
        });
        continue;
      }
      seenTaxIds.add(taxId);

      const email = cellText('email');
      if (email !== '' && !EMAIL_RX.test(email)) {
        errors.push({
          rowNumber: r,
          taxId,
          message: `Email inválido: "${email}"`,
        });
        continue;
      }

      const phoneRaw = cellText('phone');
      if (phoneRaw !== '' && !isValidPhone(phoneRaw)) {
        errors.push({
          rowNumber: r,
          taxId,
          message: `Teléfono inválido: "${phoneRaw}" (formato esperado +56 9 1234 5678)`,
        });
        continue;
      }
      const phone = phoneRaw === '' ? null : normalizePhone(phoneRaw);

      const whatsappRaw = cellText('whatsappPhone');
      if (whatsappRaw !== '' && !isValidPhone(whatsappRaw)) {
        errors.push({
          rowNumber: r,
          taxId,
          message: `WhatsApp inválido: "${whatsappRaw}"`,
        });
        continue;
      }
      const whatsappPhone =
        whatsappRaw === '' ? null : normalizePhone(whatsappRaw);

      const communeNameRaw = cellText('communeName');
      let communeId: string | null = null;
      let communeName: string | null = null;
      if (communeNameRaw !== '') {
        const found = communeByKey.get(normalizeHeader(communeNameRaw));
        if (!found) {
          errors.push({
            rowNumber: r,
            taxId,
            message: `Comuna "${communeNameRaw}" no existe en el catálogo de Chile`,
          });
          continue;
        }
        communeId = found.id;
        communeName = found.name;
      }

      valid.push({
        rowNumber: r,
        taxId,
        name,
        email: email || null,
        phone,
        whatsappPhone,
        addressStreet: cellText('addressStreet') || null,
        addressNumber: cellText('addressNumber') || null,
        communeName,
        communeId,
        internalNotes: cellText('internalNotes') || null,
      });
    }

    return { totalRows: totalDataRows, valid, errors };
  }

  private async upsertCustomer(
    row: Omit<CustomerImportRowDto, 'action' | 'existingCustomerId'>,
  ): Promise<void> {
    await this.ds.transaction(async (manager) => {
      const existing = await manager.findOne(Customer, {
        where: { taxId: row.taxId },
      });
      const patch: Partial<Customer> = {
        taxId: row.taxId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        whatsappPhone: row.whatsappPhone,
        addressStreet: row.addressStreet,
        addressNumber: row.addressNumber,
        communeId: row.communeId,
        internalNotes: row.internalNotes,
      };
      if (existing) {
        await manager.update(Customer, { id: existing.id }, patch);
      } else {
        const created = manager.create(Customer, {
          ...patch,
          // Si no existía, defaultea source a OTHER (el caller puede editarlo
          // luego). lifecycleStatus arranca en NEW por default de la entidad.
          source: CustomerSource.OTHER,
        });
        await manager.save(created);
      }
    });
  }
}
