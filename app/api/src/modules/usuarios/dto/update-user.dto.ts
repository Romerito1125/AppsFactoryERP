import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un número entero.' })
  @IsPositive({ message: 'El ID debe ser positivo.' })
  id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El cliente debe ser un número entero.' })
  @IsPositive({ message: 'El cliente debe ser positivo.' })
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La bodega debe ser un número entero.' })
  @IsPositive({ message: 'La bodega debe ser positiva.' })
  warehouseId?: number;

  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido.' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'La contraseña debe ser texto.' })
  @MinLength(6, {
    message: 'La contraseña debe tener al menos 6 caracteres.',
  })
  password?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'El rol seleccionado no es válido.' })
  role?: Role;

  @IsOptional()
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso.' })
  isActive?: boolean;
}
