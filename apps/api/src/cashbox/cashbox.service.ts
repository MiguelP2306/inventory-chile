import {
  CashTransactionSource,
  CashTransactionType,
  PaymentMethod,
} from '@inventory/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { dayRange } from '../common/date-range';
import { CashTransaction } from '../database/entities';
import { ListCashTransactionsQueryDto } from './dto';

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

    const byMethod: Record<PaymentMethod, number> = {
      [PaymentMethod.CASH]: 0,
      [PaymentMethod.TRANSFER]: 0,
      [PaymentMethod.CARD]: 0,
    };
    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const amount = parseFloat(r.sum ?? '0');
      const signed = r.type === CashTransactionType.INCOME ? amount : -amount;
      byMethod[r.paymentMethod] = (byMethod[r.paymentMethod] ?? 0) + signed;
      if (r.type === CashTransactionType.INCOME) income += amount;
      else expense += amount;
    }

    const total = byMethod.CASH + byMethod.TRANSFER + byMethod.CARD;
    const fmt = (n: number) => n.toFixed(2);
    return {
      total: fmt(total),
      byMethod: {
        [PaymentMethod.CASH]: fmt(byMethod.CASH),
        [PaymentMethod.TRANSFER]: fmt(byMethod.TRANSFER),
        [PaymentMethod.CARD]: fmt(byMethod.CARD),
      },
      income: fmt(income),
      expense: fmt(expense),
    };
  }
}
