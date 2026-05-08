import { Controller, Get, Query } from '@nestjs/common';
import { CashboxService } from './cashbox.service';
import { ListCashTransactionsQueryDto } from './dto';

@Controller('cashbox')
export class CashboxController {
  constructor(private readonly svc: CashboxService) {}

  @Get('transactions')
  list(@Query() query: ListCashTransactionsQueryDto) {
    return this.svc.list(query);
  }

  @Get('balance')
  balance() {
    return this.svc.balance();
  }
}
