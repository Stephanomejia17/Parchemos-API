import { BaseEntity } from '../../../../common/domain/base.entity';
import { Role } from '../../../../common/enums/role.enum';

export class User extends BaseEntity {
  constructor(
    id: string,
    public email: string,
    public passwordHash: string,
    public role: Role,
    public isActive: boolean = true,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
  }
}
