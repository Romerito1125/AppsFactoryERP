import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  ValidateNested,
} from 'class-validator';
import { permissionCodes } from '../../../common/permissions/permission.constants';

export class UpdateUserPermissionDto {
  @IsString()
  @IsIn(permissionCodes)
  code: string;

  @IsBoolean()
  isAllowed: boolean;
}

export class UpdateUserPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateUserPermissionDto)
  permissions: UpdateUserPermissionDto[];
}
