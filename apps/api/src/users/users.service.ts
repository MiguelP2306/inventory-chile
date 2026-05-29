import { UserRole } from '@inventory/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Brackets, Repository } from 'typeorm';
import { User } from '../database/entities';
import {
  ChangeOwnPasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  ResetUserPasswordDto,
  UpdateUserDto,
} from './dto';

const BCRYPT_ROUNDS = 10;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toDto(u: User): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async list(query: ListUsersQueryDto): Promise<UserDto[]> {
    const qb = this.users
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC');
    if (query.q) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('u.name LIKE :q', { q: `%${query.q}%` }).orWhere(
            'u.email LIKE :q',
            { q: `%${query.q}%` },
          );
        }),
      );
    }
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    const items = await qb.getMany();
    return items.map(toDto);
  }

  async getOne(id: string): Promise<UserDto> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return toDto(u);
  }

  async create(dto: CreateUserDto): Promise<UserDto> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.users.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException(`Ya existe un usuario con email "${email}"`);
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const u = this.users.create({
      name: dto.name.trim(),
      email,
      role: dto.role,
      passwordHash,
      isActive: true,
    });
    await this.users.save(u);
    return toDto(u);
  }

  async update(id: string, dto: UpdateUserDto, actingUserId: string): Promise<UserDto> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');

    // Auto-protección: el admin no puede desactivarse a sí mismo ni rebajarse
    // a USER (perdería acceso al módulo de usuarios y quedaría locked out).
    if (actingUserId === id) {
      if (dto.isActive === false) {
        throw new BadRequestException(
          'No podés desactivarte a vos mismo. Pedile a otro admin que lo haga.',
        );
      }
      if (dto.role && dto.role !== UserRole.ADMIN) {
        throw new BadRequestException(
          'No podés cambiar tu propio rol a USER. Pedile a otro admin que lo haga.',
        );
      }
    }

    if (dto.name !== undefined) u.name = dto.name.trim();
    if (dto.role !== undefined) u.role = dto.role;
    if (dto.isActive !== undefined) u.isActive = dto.isActive;
    await this.users.save(u);
    return toDto(u);
  }

  async resetPassword(
    id: string,
    dto: ResetUserPasswordDto,
  ): Promise<{ ok: true }> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    u.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.users.save(u);
    return { ok: true };
  }

  async changeOwnPassword(
    userId: string,
    dto: ChangeOwnPasswordDto,
  ): Promise<{ ok: true }> {
    const u = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash'],
    });
    if (!u) throw new UnauthorizedException();
    const ok = await bcrypt.compare(dto.currentPassword, u.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('La contraseña actual no coincide');
    }
    u.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.users.save(u);
    return { ok: true };
  }
}
