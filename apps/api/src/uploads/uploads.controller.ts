import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StorageService } from './storage.service';
import {
  documentFileFilter,
  EXPENSE_RECEIPTS_SUBDIR,
  expenseReceiptStorage,
  MAX_DOCUMENT_BYTES,
  PURCHASE_INVOICES_SUBDIR,
  purchaseInvoiceStorage,
} from './upload-config';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post('purchase-invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: purchaseInvoiceStorage,
      fileFilter: documentFileFilter,
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  async uploadPurchaseInvoice(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const stored = await this.storage.store(file, PURCHASE_INVOICES_SUBDIR);
    return {
      ...stored,
      originalName: file.originalname,
    };
  }

  @Post('expense-receipt')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: expenseReceiptStorage,
      fileFilter: documentFileFilter,
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  async uploadExpenseReceipt(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    const stored = await this.storage.store(file, EXPENSE_RECEIPTS_SUBDIR);
    return {
      ...stored,
      originalName: file.originalname,
    };
  }
}
