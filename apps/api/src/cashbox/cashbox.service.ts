import {
  CashTransactionSource,
  CashTransactionType,
  PaymentMethod,
} from '@inventory/shared';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Not, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import { CashTransaction } from '../database/entities';
import { ListCashTransactionsQueryDto, SetOpeningBalanceDto } from './dto';

const CASHBOX_PAGE_SIZE = 50;

export interface RecordTransactionInput {
  date: Date;
  type: CashTransactionType;
  source: CashTransactionSource;
  sourceId?: string | null;
  description?: string | null;
  amount: string; // siempre POSITIVO; el signo lo da `type`
  paymentMethod: PaymentMethod;
  expenseCategoryId?: string | null;
  userId: string;
}

@Injectable()
export class CashboxService {
  constructor(
    @InjectRepository(CashTransaction)
    private readonly txRepo: Repository<CashTransaction>,
  ) {}

  /**
   * Registra una transacción de caja. Si se pasa `manager`, se ejecuta dentro
   * de la transacción del caller (caso típico: compras y ventas que llaman
   * desde dentro de su propia transacción atómica).
   */
  async recordTransaction(
    input: RecordTransactionInput,
    manager?: EntityManager,
  ): Promise<CashTransaction> {
    const repo = manager ? manager.getRepository(CashTransaction) : this.txRepo;
    const tx = repo.create({
      date: input.date,
      type: input.type,
      source: input.source,
      sourceId: input.sourceId ?? null,
      description: input.description ?? null,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      expenseCategoryId: input.expenseCategoryId ?? null,
      isVoided: false,
      userId: input.userId,
    });
    return repo.save(tx);
  }

  /**
   * Marca una transacción existente como anulada y crea una compensatoria del
   * tipo opuesto por el mismo monto. Usado por anulación de gastos manuales,
   * y (en Fase 7) por cancelación de ventas y compras.
   */
  async voidTransaction(
    id: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<{ original: CashTransaction; compensation: CashTransaction }> {
    const repo = manager ? manager.getRepository(CashTransaction) : this.txRepo;
    const original = await repo.findOne({ where: { id } });
    if (!original) throw new NotFoundException('Transacción no encontrada');
    if (original.isVoided) {
      throw new NotFoundException('Transacción ya anulada');
    }

    original.isVoided = true;
    await repo.save(original);

    const compensation = repo.create({
      date: new Date(),
      type:
        original.type === CashTransactionType.INCOME
          ? CashTransactionType.EXPENSE
          : CashTransactionType.INCOME,
      source: original.source,
      sourceId: original.sourceId,
      description: `Compensación de anulación · ${original.description ?? ''}`.trim(),
      amount: original.amount,
      paymentMethod: original.paymentMethod,
      expenseCategoryId: original.expenseCategoryId,
      isVoided: false,
      userId,
    });
    const saved = await repo.save(compensation);
    return { original, compensation: saved };
  }

  async list(query: ListCashTransactionsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? CASHBOX_PAGE_SIZE;

    const qb = this.txRepo
      .createQueryBuilder('tx')
      .leftJoinAndSelect('tx.expenseCategory', 'expenseCategory')
      .leftJoinAndSelect('tx.user', 'user');

    if (query.type) qb.andWhere('tx.type = :type', { type: query.type });
    if (query.source) qb.andWhere('tx.source = :source', { source: query.source });
    if (query.paymentMethod)
      qb.andWhere('tx.paymentMethod = :paymentMethod', {
        paymentMethod: query.paymentMethod,
      });
    if (query.expenseCategoryId)
      qb.andWhere('tx.expenseCategoryId = :ecId', {
        ecId: query.expenseCategoryId,
      });

    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('tx.date BETWEEN :from AND :to', { from, to });
    }

    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('tx.description LIKE :q', { q: `%${query.q}%` });
        }),
      );
    }

    if (!query.includeVoided) {
      qb.andWhere('tx.isVoided = FALSE');
    }

    qb.orderBy('tx.date', 'DESC').addOrderBy('tx.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /**
   * Saldo agregado por método de pago + total + ingresos/egresos. Excluye las
   * transacciones marcadas como `isVoided` (las compensaciones SÍ cuentan,
   * porque son su contrapartida).
   */
  async balance(): Promise<{
    total: string;
    byMethod: Record<PaymentMethod, string>;
    income: string;
    expense: string;
  }> {
    const rows: Array<{
      paymentMethod: PaymentMethod;
      type: CashTransactionType;
      sum: string | null;
    }> = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.paymentMethod', 'paymentMethod')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'sum')
      .where('tx.isVoided = FALSE')
      .groupBy('tx.paymentMethod')
      .addGroupBy('tx.type')
      .getRawMany();

    // Ronda 9 — un bucket por método (5 valores tras el split del CARD).
    const byMethod: Record<PaymentMethod, number> = {
      [PaymentMethod.CASH]: 0,
      [PaymentMethod.TRANSFER]: 0,
      [PaymentMethod.CARD_DEBIT]: 0,
      [PaymentMethod.CARD_CREDIT]: 0,
      [PaymentMethod.PAYMENT_LINK]: 0,
    };
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const amount = parseFloat(r.sum ?? '0');
      const signed = r.type === CashTransactionType.INCOME ? amount : -amount;
      const m = r.paymentMethod as PaymentMethod;
      if (m in byMethod) {
        byMethod[m] = byMethod[m] + signed;
      }
      if (r.type === CashTransactionType.INCOME) income += amount;
      else expense += amount;
    }

    const total = Object.values(byMethod).reduce((acc, v) => acc + v, 0);
    const fmt = (n: number) => n.toFixed(2);
    return {
      total: fmt(total),
      byMethod: {
        [PaymentMethod.CASH]: fmt(byMethod[PaymentMethod.CASH]),
        [PaymentMethod.TRANSFER]: fmt(byMethod[PaymentMethod.TRANSFER]),
        [PaymentMethod.CARD_DEBIT]: fmt(byMethod[PaymentMethod.CARD_DEBIT]),
        [PaymentMethod.CARD_CREDIT]: fmt(byMethod[PaymentMethod.CARD_CREDIT]),
        [PaymentMethod.PAYMENT_LINK]: fmt(byMethod[PaymentMethod.PAYMENT_LINK]),
      },
      income: fmt(income),
      expense: fmt(expense),
    };
  }

  // ============================================================
  // Fase 12 — Capital inicial
  // ============================================================
  //
  // El capital inicial se persiste como una sola transacción con
  // source=OPENING y type=INCOME. Reusa la misma infraestructura del libro
  // de caja: aparece en listados, exports, y se suma en `balance()` como
  // cualquier ingreso. La restricción "una sola" se asegura por código
  // (no por un UNIQUE en DB, porque la columna source admite múltiples
  // valores). El editar/borrar solo se permite si NO existen otros
  // movimientos en el libro — una vez que hay actividad, queda inmutable
  // y cualquier corrección debe ser un ingreso o egreso manual.

  /**
   * Devuelve la transacción OPENING activa, si existe. Filtramos por
   * `type=INCOME` para ignorar eventuales compensaciones generadas por
   * anulación (que tendrían `source=OPENING` + `type=EXPENSE`).
   */
  async getOpeningBalance(): Promise<CashTransaction | null> {
    return this.txRepo.findOne({
      where: {
        source: CashTransactionSource.OPENING,
        type: CashTransactionType.INCOME,
        isVoided: false,
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Crea (o reemplaza, si todavía no hay otros movimientos) la transacción
   * de capital inicial. Lanza 400 si:
   *  - el monto no es > 0
   *  - ya existen movimientos distintos de OPENING (no se permite recargar)
   */
  async setOpeningBalance(
    input: SetOpeningBalanceDto,
    userId: string,
  ): Promise<CashTransaction> {
    const amount = Number(input.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor que 0.');
    }

    // Si ya hay movimientos no-OPENING (vivos o anulados), el saldo inicial
    // queda bloqueado. Esto protege la integridad histórica del balance.
    const otherCount = await this.txRepo.count({
      where: { source: Not(CashTransactionSource.OPENING) },
    });
    if (otherCount > 0) {
      throw new BadRequestException(
        'No se puede modificar el capital inicial porque ya existen otros movimientos. ' +
          'Registrá la diferencia como un ingreso o egreso manual.',
      );
    }

    // Reemplazar cualquier registro previo de OPENING (todavía no hay
    // actividad real). Borrado en bulk para cubrir tanto el caso normal
    // (1 fila) como cualquier compensación residual de un void anterior.
    await this.txRepo.delete({ source: CashTransactionSource.OPENING });

    const tx = this.txRepo.create({
      date: input.date ? new Date(input.date) : new Date(),
      type: CashTransactionType.INCOME,
      source: CashTransactionSource.OPENING,
      sourceId: null,
      description: 'Capital inicial',
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      expenseCategoryId: null,
      isVoided: false,
      userId,
    });
    return this.txRepo.save(tx);
  }

  /**
   * Borra la transacción de capital inicial. Solo permitido si no hay otros
   * movimientos en el libro de caja (mismo criterio que `setOpeningBalance`).
   */
  async deleteOpeningBalance(): Promise<{ deleted: boolean }> {
    const otherCount = await this.txRepo.count({
      where: { source: Not(CashTransactionSource.OPENING) },
    });
    if (otherCount > 0) {
      throw new BadRequestException(
        'No se puede borrar el capital inicial porque ya existen otros movimientos.',
      );
    }
    const result = await this.txRepo.delete({
      source: CashTransactionSource.OPENING,
    });
    if (!result.affected) {
      throw new NotFoundException('No hay capital inicial cargado.');
    }
    return { deleted: true };
  }
}
