import {
  Controller,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PdfService } from '../notifications/pdf.service';
import { GeneratePdfQueryDto } from './dto';
import { QuotationsService } from './quotations.service';

@Controller('public/quotations')
export class PublicQuotationsController {
  constructor(
    private readonly svc: QuotationsService,
    private readonly pdf: PdfService,
  ) {}

  @Public()
  @Get(':token')
  async getByToken(@Param('token') token: string) {
    const { quotation, items } = await this.svc.findByPublicToken(token);
    this.svc.assertPublicTokenLive(quotation);
    // Hidratamos manualmente los productos para tener todos los campos en el DTO público.
    return this.svc.toPublicDto(quotation, items);
  }

  @Public()
  @Get(':token/pdf')
  async getPdf(
    @Param('token') token: string,
    @Query() query: GeneratePdfQueryDto,
    @Res() res: Response,
  ) {
    const { quotation, items } = await this.svc.findByPublicToken(token);
    this.svc.assertPdfTokenLive(quotation);
    const dto = await this.svc.toPublicDto(quotation, items);
    const buffer = await this.pdf.generate(
      this.pdf.fromPublicDto(dto),
      query.format ?? 'letter',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${quotation.number}.pdf"`,
    );
    res.send(buffer);
  }
}
