import { Controller, Post } from '@nestjs/common';
import { HubspotService } from './hubspot.service';

@Controller('hubspot')
export class HubspotController {
  constructor(private readonly svc: HubspotService) {}

  /**
   * Endpoint usado por el botón "Test sync" del panel de configuración.
   * Valida que el toggle esté activo y la API key esté presente sin tocar
   * datos reales. Cuando se instale `@hubspot/api-client` esto pasa a hacer
   * una llamada read-only a `GET /crm/v3/properties/contacts`.
   */
  @Post('test')
  async test() {
    return this.svc.testSync();
  }
}
