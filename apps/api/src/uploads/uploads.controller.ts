import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  documentFileFilter,
  EXPENSE_RECEIPTS_SUBDIR,
  expenseReceiptStorage,
  MAX_DOCUMENT_BYTES,
  publicUploadUrl,
  PURCHASE_INVOICES_SUBDIR,
  purchaseInvoiceStorage,
} from './upload-config';

@Controller('uploads')
export class UploadsController {
  @Post('purchase-invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: purchaseInvoiceStorage,
      fileFilter: documentFileFilter,
      limits: { fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  uploadPurchaseInvoice(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return {
      url: publicUploadUrl(PURCHASE_INVOICES_SUBDIR, file.filename),
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
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
  uploadExpenseReceipt(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return {
      url: publicUploadUrl(EXPENSE_RECEIPTS_SUBDIR, file.filename),
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  }
}
