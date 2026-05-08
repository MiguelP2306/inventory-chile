import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { PdfService } from './pdf.service';

@Module({
  providers: [EmailService, PdfService],
  exports: [EmailService, PdfService],
})
export class NotificationsModule {}
