import { AccountStatus } from '../../../auth/domain/enums/account-status.enum';

export interface StaffLocation {
  id: string;
  name: string;
  restaurantId: string;
}

export interface StaffMemberProps {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: AccountStatus;
  createdAt: Date;
  location: StaffLocation;
}

/**
 * Cuenta personal_restaurante vinculada a una sede (GU-05). Es un User visto
 * desde el restaurante, no una entidad de negocio nueva.
 */
export class StaffMember {
  readonly id: string;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly status: AccountStatus;
  readonly createdAt: Date;
  readonly location: StaffLocation;

  constructor(props: StaffMemberProps) {
    this.id = props.id;
    this.fullName = props.fullName;
    this.email = props.email;
    this.phone = props.phone;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.location = props.location;
  }
}
