import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';

const DEFAULT_FROM = 'onboarding@resend.dev';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private client: Resend | null = null;

  private getClient(): Resend {
    if (this.client) return this.client;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new InternalServerErrorException(
        'RESEND_API_KEY no está configurada. No se puede enviar email.',
      );
    }
    this.client = new Resend(apiKey);
    return this.client;
  }

  private getFrom(): string {
    return process.env.EMAIL_FROM ?? DEFAULT_FROM;
  }

  async sendQuotation(input: SendEmailInput): Promise<{ id: string }> {
    const client = this.getClient();
    const from = this.getFrom();

    const result = await client.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (result.error) {
      this.logger.error(
        `Resend rechazó el envío: ${JSON.stringify(result.error)}`,
      );
      throw new BadGatewayException(
        `No se pudo enviar el email: ${result.error.message ?? 'error desconocido'}`,
      );
    }
    if (!result.data?.id) {
      throw new BadGatewayException(
        'Resend no devolvió un id de envío. El correo puede no haberse enviado.',
      );
    }
    return { id: result.data.id };
  }
}
