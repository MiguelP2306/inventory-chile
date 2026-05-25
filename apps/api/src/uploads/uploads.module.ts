import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

/**
 * Endpoints comunes para upload de documentos transversales (facturas de
 * compra, comprobantes de gasto). El upload de imágenes de producto vive
 * dentro del módulo de productos porque tiene lógica adicional (galería,
 * cover, posición).
 *
 * `@Global()` para que `StorageService` esté disponible en cualquier módulo
 * sin tener que importar `UploadsModule` explícitamente.
 */
@Global()
@Module({
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class UploadsModule {}
