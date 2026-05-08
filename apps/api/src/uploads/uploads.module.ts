import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';

/**
 * Endpoints comunes para upload de documentos transversales (facturas de
 * compra, comprobantes de gasto). El upload de imágenes de producto vive
 * dentro del módulo de productos porque tiene lógica adicional (galería,
 * cover, posición).
 */
@Module({
  controllers: [UploadsController],
})
export class UploadsModule {}
