import type {
  ContactImportErrorDto,
  SupplierImportPreviewDto,
  SupplierImportResultDto,
  SupplierImportRowDto,
} from '@inventory/shared';
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
  readCellText,
} from '../common/xlsx-import';
import { isValidPhone, normalizePhone } from '../common/validators/phone';
import { isValidRut, normalizeRut } from '../common/validators/rut';
import { Supplier } from '../database/entities';

const COLUMNS = [
  'taxId',
  'name',
  'legalName',
  'contactPerson',
  'email',
  'phone',
  'address',
  'notes',
] as const;
type Column = (typeof COLUMNS)[number];

const HEADERS: Record<Column, string> = {
  taxId: 'RUT',
  name: 'Nombre comercial',
  legalName: 'Razon social',
  contactPerson: 'Persona de contacto',
  email: 'Email',
  phone: 'Telefono',
  address: 'Direccion',
  notes: 'Notas',
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Importador masivo de proveedores. Mismo patrón que Fase 10 productos:
 * subir → preview → confirmar. UPSERT por RUT.
 *
 * Reglas:
 *  - `name` y `taxId` son obligatorios.
 *  - `taxId` se valida con módulo 11 y se normaliza.
 *  - `phone` se valida con libphonenumber-js (default CL).
 *  - `email` se valida con regex.
 */
@Injectable()
export class SuppliersImportService {
  private readonly logger = new Logger(SuppliersImportService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  async preview(buffer: Buffer): Promise<SupplierImportPreviewDto> {
    const parsed = await this.parseExcel(buffer);

    const taxIds = parsed.valid.map((r) => r.taxId);
    const existing = taxIds.length
      ? await this.suppliers.find({
          where: { taxId: In(taxIds) },
          select: { id: true, taxId: true },
        })
      : [];
    const existingMap = new Map(
      existing
        .filter((s) => !!s.taxId)
        .map((s) => [s.taxId as string, s.id]),
    );

    let createCount = 0;
    let updateCount = 0;
    const rowsWithAction: SupplierImportRowDto[] = parsed.valid.map((r) => {
      const existingId = existingMap.get(r.taxId) ?? null;
      const action: SupplierImportRowDto['action'] = existingId
        ? 'update'
        : 'create';
      if (action === 'create') createCount += 1;
      else updateCount += 1;
      return { ...r, action, existingSupplierId: existingId };
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

  async confirm(buffer: Buffer): Promise<SupplierImportResultDto> {
    const parsed = await this.parseExcel(buffer);

    const taxIds = parsed.valid.map((r) => r.taxId);
    const existing = taxIds.length
      ? await this.suppliers.find({
          where: { taxId: In(taxIds) },
          select: { id: true, taxId: true },
        })
      : [];
    const existedBefore = new Set(
      existing.map((s) => s.taxId).filter((t): t is string => !!t),
    );

    const errors: ContactImportErrorDto[] = [...parsed.errors];
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = parsed.errors.length;

    for (const row of parsed.valid) {
      try {
        await this.upsertSupplier(row);
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

    const sheet = wb.addWorksheet('Proveedores');
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
      taxId: '76123456-7',
      name: 'Bosch Chile',
      legalName: 'Robert Bosch SpA',
      contactPerson: 'Marta Soto',
      email: 'ventas@bosch.cl',
      phone: '+56222345678',
      address: 'Av. Apoquindo 4501, Las Condes',
      notes: 'Vendedor habitual de filtros',
    });

    const inst = wb.addWorksheet('Instrucciones');
    inst.columns = [
      { header: 'Columna', key: 'col', width: 24 },
      { header: 'Obligatoria', key: 'req', width: 12 },
      { header: 'Descripcion', key: 'desc', width: 90 },
    ];
    inst.getRow(1).font = { bold: true };
    const ROWS: Array<[Column, boolean, string]> = [
      ['taxId', true, 'RUT del proveedor con DV (12345678-9). Llave del upsert — si ya existe, se actualiza.'],
      ['name', true, 'Nombre comercial.'],
      ['legalName', false, 'Razón social formal cuando difiere del nombre comercial.'],
      ['contactPerson', false, 'Persona de contacto / vendedor habitual.'],
      ['email', false, 'Email opcional. Si viene, debe ser válido.'],
      ['phone', false, 'Teléfono. Acepta formato local (912345678) o internacional (+56912345678).'],
      ['address', false, 'Dirección como texto libre.'],
      ['notes', false, 'Notas internas.'],
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
    valid: Omit<SupplierImportRowDto, 'action' | 'existingSupplierId'>[];
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
      wb.getWorksheet('Proveedores') ??
      wb.worksheets.find((w) => w.rowCount > 0) ??
      wb.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El Excel no tiene hojas.');
    }

    const found = findHeaderRow(sheet, HEADERS, ['taxId', 'name']);
    if (!found) {
      throw new BadRequestException(
        'No encontré las columnas obligatorias "RUT" y "Nombre comercial" en las primeras 5 filas. Descargá la plantilla.',
      );
    }
    const { headerRowNumber, colIndex } = found;

    const valid: Omit<SupplierImportRowDto, 'action' | 'existingSupplierId'>[] = [];
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
          message: `Teléfono inválido: "${phoneRaw}"`,
        });
        continue;
      }
      const phone = phoneRaw === '' ? null : normalizePhone(phoneRaw);

      valid.push({
        rowNumber: r,
        taxId,
        name,
        legalName: cellText('legalName') || null,
        contactPerson: cellText('contactPerson') || null,
        email: email || null,
        phone,
        address: cellText('address') || null,
        notes: cellText('notes') || null,
      });
    }

    return { totalRows: totalDataRows, valid, errors };
  }

  private async upsertSupplier(
    row: Omit<SupplierImportRowDto, 'action' | 'existingSupplierId'>,
  ): Promise<void> {
    await this.ds.transaction(async (manager) => {
      const existing = await manager.findOne(Supplier, {
        where: { taxId: row.taxId },
      });
      const patch: Partial<Supplier> = {
        taxId: row.taxId,
        name: row.name,
        legalName: row.legalName,
        contactPerson: row.contactPerson,
        email: row.email,
        phone: row.phone,
        address: row.address,
        notes: row.notes,
      };
      if (existing) {
        await manager.update(Supplier, { id: existing.id }, patch);
      } else {
        const created = manager.create(Supplier, patch);
        await manager.save(created);
      }
    });
  }
}
