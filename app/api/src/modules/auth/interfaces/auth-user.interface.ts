import { Role } from '../../../common/enums/role.enum';

export interface AuthUser {
  sub: number;
  clientId?: number | null;
  warehouseId?: number | null;
  role: Role;
  username: string;
}
