import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class CreateEmployeeDto {
  @IsString({ message: 'La identificación debe ser texto.' })
  @MinLength(3, {
    message: 'La identificación debe tener al menos 3 caracteres.',
  })
  identification: string;

  @IsString({ message: 'Los nombres deben ser texto.' })
  @MinLength(2, { message: 'Los nombres deben tener al menos 2 caracteres.' })
  firstName: string;

  @IsString({ message: 'Los apellidos deben ser texto.' })
  @MinLength(2, {
    message: 'Los apellidos deben tener al menos 2 caracteres.',
  })
  lastName: string;

  @IsOptional()
  @IsString({ message: 'El teléfono debe ser texto.' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'La dirección debe ser texto.' })
  address?: string;

  @IsEmail({}, { message: 'El correo no es válido.' })
  email: string;

  @IsString({ message: 'La contraseña debe ser texto.' })
  @MinLength(6, {
    message: 'La contraseña debe tener al menos 6 caracteres.',
  })
  password: string;

  @IsEnum(Role, { message: 'El rol seleccionado no es válido.' })
  role: Role;
}
