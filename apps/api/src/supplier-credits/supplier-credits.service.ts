import {
  SupplierCreditDto,
  SupplierCreditStatus,
} from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  PurchaseCreditApplication,
  Return,
  Supplier,
  SupplierCredit,
} from '../database/entities';
import {
  ApplyCreditInput,
  ListSupplierCreditsQueryDto,
  ManualSupplierCreditDto,
} from './dto';

@Injectable()
export class SupplierCreditsService {
  constructor(
    @InjectRepository(SupplierCredit)
    private readonly repo: Repository<SupplierCredit>,
    @InjectRepository(PurchaseCreditApplication)
    private readonly applicationRepo: Repository<PurchaseCreditApplication>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  // ---------- reads ----------

  async list(query: ListSupplierCreditsQueryDto = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.supplier', 'supplier')
      .leftJoinAndSelect('c.sourceReturn', 'sourceReturn')
      .leftJoinAndSelect('c.user', 'user')
      .orderBy('c.createdAt', 'DESC');
    if (query.supplierId)
      qb.andWhere('c.supplierId = :sid', { sid: query.supplierId });
    if (query.status) qb.andWhere('c.status = :st', { st: query.status });
    qb.take(pageSize).skip((page - 1) * pageSize);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((c) => this.toDto(c)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Créditos disponibles (status=ACTIVE y balance > 0) para un proveedor.
   * Usado por PurchaseForm para mostrar el panel "Aplicar crédito".
   */
  async listAvailableForSupplier(supplierId: string): Promise<SupplierCreditDto[]> {
    const items = await this.repo.find({
      where: { supplierId, status: SupplierCreditStatus.ACTIVE },
      relations: { supplier: true, sourceReturn: true, user: true },
      order: { createdAt: 'ASC' },
    });
    return items.filter((c) => parseFloat(c.balance) > 0).map((c) => this.toDto(c));
  }

  async getOne(id: string): Promise<SupplierCreditDto> {
    const c = await this.repo.findOne({
      where: { id },
      relations: { supplier: true, sourceReturn: true, user: true },
    });
    if (!c) throw new NotFoundException('Crédito no encontrado');
    return this.toDto(c);
  }

  // ---------- mutations ----------

  /**
   * Genera un crédito automático tras una devolución a proveedor con
   * refundMode=CREDIT. Se llama desde ReturnsService dentro de la misma
   * transacción atómica.
   */
  async createFromReturn(
    manager: EntityManager,
    input: {
      supplierId: string;
      sourceReturnId: string;
      amount: string;
      userId: string;
    },
  ): Promise<SupplierCredit> {
    const credit = manager.getRepository(SupplierCredit).create({
      supplierId: input.supplierId,
      sourceReturnId: input.sourceReturnId,
      amount: input.amount,
      balance: input.amount,
      status: SupplierCreditStatus.ACTIVE,
      userId: input.userId,
    });
    return manager.getRepository(SupplierCredit).save(credit);
  }

  /**
   * Crédito creado manualmente (cuando el proveedor avisa un saldo a favor
   * sin una devolución asociada). El historial queda con sourceReturnId=null.
   */
  async createManual(
    dto: ManualSupplierCreditDto,
    userId: string,
  ): Promise<SupplierCreditDto> {
    const supplier = await this.supplierRepo.findOne({
      where: { id: dto.supplierId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    const amount = parseFloat(dto.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser un número positivo');
    }
    const credit = this.repo.create({
      supplierId: dto.supplierId,
      sourceReturnId: null,
      amount: amount.toFixed(2),
      balance: amount.toFixed(2),
      status: SupplierCreditStatus.ACTIVE,
      notes: dto.notes?.trim() || null,
      userId,
    });
    const saved = await this.repo.save(credit);
    return this.getOne(saved.id);
  }

  /**
   * Aplica una lista de créditos a una compra recién creada. Se llama dentro
   * de la transacción del PurchasesService.create. Valida balances y crea
   * las filas en `purchase_credit_applications`. Decrementa el balance del
   * crédito y marca SPENT cuando llega a 0.
   *
   * Devuelve la suma total aplicada (descuento sobre el total de la compra).
   */
  async applyCreditsToPurchase(
    manager: EntityManager,
    input: {
      purchaseEntryId: string;
      supplierId: string;
      applications: ApplyCreditInput[];
      maxAmount: number;
    },
  ): Promise<number> {
    if (input.applications.length === 0) return 0;
    const creditIds = input.applications.map((a) => a.supplierCreditId);
    if (new Set(creditIds).size !== creditIds.length) {
      throw new BadRequestException(
        'Hay créditos duplicados en la aplicación. Sumá los montos.',
      );
    }
    const credits = await manager.getRepository(SupplierCredit).find({
      where: { id: In(creditIds) },
    });
    if (credits.length !== creditIds.length) {
      throw new NotFoundException('Algún crédito no existe');
    }

    let totalApplied = 0;
    for (const app of input.applications) {
      const credit = credits.find((c) => c.id === app.supplierCreditId)!;
      if (credit.supplierId !== input.supplierId) {
        throw new ConflictException(
          `El crédito ${credit.id.slice(0, 8)} no pertenece al proveedor de esta compra.`,
        );
      }
      if (credit.status !== SupplierCreditStatus.ACTIVE) {
        throw new ConflictException(
          `El crédito ${credit.id.slice(0, 8)} no está activo (status ${credit.status}).`,
        );
      }
      const amount = parseFloat(app.amount);
      if (!isFinite(amount) || amount <= 0) {
        throw new BadRequestException('El monto a aplicar debe ser > 0');
      }
      const balance = parseFloat(credit.balance);
      if (amount > balance + 0.001) {
        throw new ConflictException(
          `El crédito ${credit.id.slice(0, 8)} no tiene saldo suficiente (disponible ${balance.toFixed(2)}).`,
        );
      }
      totalApplied += amount;

      // Registrar la aplicación.
      const application = manager
        .getRepository(PurchaseCreditApplication)
        .create({
          purchaseEntryId: input.purchaseEntryId,
          supplierCreditId: credit.id,
          amount: amount.toFixed(2),
        });
      await manager.getRepository(PurchaseCreditApplication).save(application);

      // Decrementar balance + SPENT si llegó a 0.
      const newBalance = balance - amount;
      credit.balance = newBalance.toFixed(2);
      if (newBalance < 0.005) {
        credit.balance = '0.00';
        credit.status = SupplierCreditStatus.SPENT;
      }
      await manager.getRepository(SupplierCredit).save(credit);
    }

    if (totalApplied > input.maxAmount + 0.001) {
      throw new ConflictException(
        `El total de créditos aplicados (${totalApplied.toFixed(2)}) excede el total de la compra (${input.maxAmount.toFixed(2)}).`,
      );
    }

    return totalApplied;
  }

  /**
   * Anular un crédito que aún no se haya usado (balance == amount). Si ya
   * se gastó parcialmente, devuelve 409 con instrucciones.
   */
  async voidCredit(id: string, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(SupplierCredit)
      : this.repo;
    const credit = await repo.findOne({ where: { id } });
    if (!credit) throw new NotFoundException('Crédito no encontrado');
    if (credit.status === SupplierCreditStatus.VOIDED) return;
    if (parseFloat(credit.balance) !== parseFloat(credit.amount)) {
      throw new ConflictException(
        'El crédito ya tiene aplicaciones; no se puede anular. Reversá las compras primero.',
      );
    }
    credit.status = SupplierCreditStatus.VOIDED;
    credit.balance = '0.00';
    await repo.save(credit);
  }

  // ---------- helpers ----------

  private toDto(c: SupplierCredit): SupplierCreditDto {
    return {
      id: c.id,
      supplierId: c.supplierId,
      supplier: c.supplier
        ? { id: c.supplier.id, name: c.supplier.name }
        : undefined,
      sourceReturnId: c.sourceReturnId,
      sourceReturn: c.sourceReturn
        ? { id: c.sourceReturn.id, number: c.sourceReturn.number }
        : null,
      amount: c.amount,
      balance: c.balance,
      status: c.status,
      notes: c.notes,
      user: c.user
        ? { id: c.user.id, name: c.user.name, email: c.user.email }
        : undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
