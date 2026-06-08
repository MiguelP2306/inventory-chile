import {
  CashTransactionSource,
  CashTransactionType,
} from '@inventory/shared';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { CashboxService } from '../cashbox/cashbox.service';
import { CountersService } from '../common/counters.service';
import { dayRange } from '../common/date-range';
import { businessTodayStr, parseBusinessDate } from '../common/timezone';
import {
  CashTransaction,
  Expense,
  ExpenseCategory,
} from '../database/entities';
import {
  CreateExpenseDto,
  ListExpensesQueryDto,
  UpdateExpenseDto,
} from './dto';

const COUNTER_KIND = 'EXPENSE';
const NUMBER_PREFIX = 'GAS';
const PAGE_SIZE_DEFAULT = 20;

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly repo: Repository<Expense>,
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly counters: CountersService,
    private readonly cashbox: CashboxService,
  ) {}

  async list(query: ListExpensesQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? PAGE_SIZE_DEFAULT;

    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.category', 'category')
      .leftJoinAndSelect('e.user', 'user');

    if (query.categoryId) {
      qb.andWhere('e.categoryId = :cid', { cid: query.categoryId });
    }
    if (query.paymentMethod) {
      qb.andWhere('e.paymentMethod = :pm', { pm: query.paymentMethod });
    }
    if (query.dateFrom || query.dateTo) {
      const { from, to } = dayRange(query.dateFrom, query.dateTo);
      qb.andWhere('e.date BETWEEN :from AND :to', { from, to });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) => {
          b.where('e.description LIKE :q', { q: `%${query.q}%` }).orWhere(
            'e.number LIKE :q',
            { q: `%${query.q}%` },
          );
        }),
      );
    }
    if (!query.includeVoided) {
      qb.andWhere('e.voidedAt IS NULL');
    }
    qb.orderBy('e.date', 'DESC').addOrderBy('e.createdAt', 'DESC');
    qb.take(pageSize).skip((page - 1) * pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async getOne(id: string) {
    const expense = await this.repo.findOne({
      where: { id },
      relations: { category: true, user: true },
    });
    if (!expense) throw new NotFoundException('Gasto no encontrado');
    return expense;
  }

  async create(dto: CreateExpenseDto, userId: string): Promise<Expense> {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');

    const expenseDate = parseBusinessDate(dto.date);
    const year = expenseDate.getFullYear();

    return this.ds.transaction(async (manager) => {
      const seq = await this.counters.nextNumber(COUNTER_KIND, year, manager);
      const number = CountersService.format(NUMBER_PREFIX, year, seq);

      const cashTx = await this.cashbox.recordTransaction(
        {
          date: expenseDate,
          type: CashTransactionType.EXPENSE,
          source: CashTransactionSource.MANUAL,
          sourceId: null,
          description: `${number} · ${dto.description}`,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod,
          expenseCategoryId: category.id,
          userId,
        },
        manager,
      );

      const expense = manager.getRepository(Expense).create({
        number,
        date: expenseDate,
        categoryId: category.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        description: dto.description,
        receiptUrl: dto.receiptUrl ?? null,
        cashTxId: cashTx.id,
        userId,
      });
      return manager.getRepository(Expense).save(expense);
    });
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    userId: string,
  ): Promise<Expense> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    if (existing.voidedAt) {
      throw new ConflictException('El gasto está anulado y no puede editarse');
    }
    if (!isInCurrentMonth(existing.date)) {
      throw new ConflictException(
        'No se puede editar un gasto de un mes anterior. Anulalo y creá uno nuevo.',
      );
    }

    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Categoría no encontrada');
    }

    return this.ds.transaction(async (manager) => {
      // Refrescamos el cash_transaction asociado.
      const cashTx = await manager.getRepository(CashTransaction).findOne({
        where: { id: existing.cashTxId },
      });
      if (!cashTx) {
        // Caso de borde: la transacción quedó huérfana. La recreamos.
        const newTx = await this.cashbox.recordTransaction(
          {
            date: dto.date ? parseBusinessDate(dto.date) : existing.date,
            type: CashTransactionType.EXPENSE,
            source: CashTransactionSource.MANUAL,
            sourceId: null,
            description: `${existing.number} · ${dto.description ?? existing.description}`,
            amount: dto.amount ?? existing.amount,
            paymentMethod: dto.paymentMethod ?? existing.paymentMethod,
            expenseCategoryId: dto.categoryId ?? existing.categoryId,
            userId,
          },
          manager,
        );
        existing.cashTxId = newTx.id;
      } else {
        cashTx.date = dto.date ? parseBusinessDate(dto.date) : cashTx.date;
        cashTx.amount = dto.amount ?? cashTx.amount;
        cashTx.paymentMethod = dto.paymentMethod ?? cashTx.paymentMethod;
        cashTx.expenseCategoryId = dto.categoryId ?? cashTx.expenseCategoryId;
        cashTx.description = `${existing.number} · ${dto.description ?? existing.description}`;
        await manager.getRepository(CashTransaction).save(cashTx);
      }

      if (dto.date) existing.date = parseBusinessDate(dto.date);
      if (dto.categoryId) existing.categoryId = dto.categoryId;
      if (dto.amount) existing.amount = dto.amount;
      if (dto.paymentMethod) existing.paymentMethod = dto.paymentMethod;
      if (dto.description) existing.description = dto.description;
      if (dto.receiptUrl !== undefined) existing.receiptUrl = dto.receiptUrl;

      return manager.getRepository(Expense).save(existing);
    });
  }

  /**
   * Anula un gasto: marca `voidedAt`, anula la transacción original y crea una
   * compensatoria (INCOME) por el mismo monto. Reversible solo creando un
   * nuevo gasto.
   */
  async voidOne(id: string, userId: string): Promise<Expense> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    if (existing.voidedAt) {
      throw new ConflictException('El gasto ya está anulado');
    }

    return this.ds.transaction(async (manager) => {
      const { compensation } = await this.cashbox.voidTransaction(
        existing.cashTxId,
        userId,
        manager,
      );

      existing.voidedAt = new Date();
      existing.voidedById = userId;
      existing.voidCashTxId = compensation.id;
      return manager.getRepository(Expense).save(existing);
    });
  }
}

function isInCurrentMonth(d: Date): boolean {
  // Comparamos año-mes en la zona del negocio (no en la del servidor).
  const currentYm = businessTodayStr().slice(0, 7); // YYYY-MM
  const dYm = businessTodayStr(d).slice(0, 7);
  return dYm === currentYm;
}
