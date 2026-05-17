import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseItemInputDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumberString({ no_symbols: false })
  unitCost!: string;
}

export class CreatePurchaseEntryDto {
  @IsUUID()
  supplierId!: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Ronda 7 — N archivos de factura (devueltos por POST /uploads/purchase-invoice,
  // que ahora acepta múltiples llamadas). Cada item es la URL relativa
  // retornada por el upload. Opcional: compra puede crearse sin factura
  // y agregarse después vía POST /purchases/:id/invoices.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  invoiceUrls?: string[];

  // Override del IVA calculado por el sistema. Si no se manda, se computa
  // desde `total / (1 + companySettings.taxRate)`.
  @IsOptional()
  @IsNumberString({ no_symbols: false })
  taxAmountOverride?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemInputDto)
  items!: PurchaseItemInputDto[];
}

export class AddInvoiceFileDto {
  @IsString()
  url!: string;

  @IsString()
  filename!: string;

  @IsString()
  originalName!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  size!: number;
}

export class AddInvoicesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AddInvoiceFileDto)
  files!: AddInvoiceFileDto[];
}

export class ListPurchasesQueryDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  // Ronda 7 — filtro por bodega destino de la compra.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // Ronda 7 — filtros por rango del `total` (bruto, con IVA) de la compra.
  // Aceptan string para soportar tipeo libre y se parsean numéricamente
  // en el service. Valores razonables: 0..1_000_000_000.
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  totalMin?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  totalMax?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
