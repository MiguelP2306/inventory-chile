import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateVehicleMakeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateVehicleMakeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}

export class CreateVehicleModelDto {
  @IsUUID()
  makeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}

export class UpdateVehicleModelDto {
  @IsOptional()
  @IsUUID()
  makeId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
