import { BaseEntity } from '../../../../common/domain/base.entity';

export interface RestaurantProps {
  id: string;
  ownerId: string;
  businessName: string;
  legalName: string | null;
  taxId: string | null;
  /** Prisma.Decimal serializado como string: asi es como ya viaja hoy en la respuesta. */
  commissionRate: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Empresa propietaria de una o varias sedes (PU-06 multi-sede).
 *
 * legalName/taxId/commissionRate no los usa ningun caso de uso todavia
 * (AE-01/AE-02 son trabajo futuro), pero ya viajan en la respuesta de la API
 * hoy: se conservan para no romper ese contrato.
 */
export class Restaurant extends BaseEntity {
  readonly ownerId: string;
  readonly businessName: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly commissionRate: string;

  constructor(props: RestaurantProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.ownerId = props.ownerId;
    this.businessName = props.businessName;
    this.legalName = props.legalName;
    this.taxId = props.taxId;
    this.commissionRate = props.commissionRate;
  }

  isOwnedBy(userId: string): boolean {
    return this.ownerId === userId;
  }
}
