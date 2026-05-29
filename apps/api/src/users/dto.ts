import { UserRole } from '@inventory/shared';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(120)
  password!: string;

  @IsEnum(UserRole, { message: 'Rol inválido. Usá ADMIN o USER.' })
  role!: UserRole;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(UserRole, { message: 'Rol inválido. Usá ADMIN o USER.' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(120)
  newPassword!: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Ingresá tu contraseña actual' })
  currentPassword!: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  @MaxLength(120)
  newPassword!: string;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
