import { MesaStatus } from '../enums/mesa-status.enum';

export interface MesaProps {
  id: string;
  locationId: string;
  code: string;
  capacity: number;
  status: MesaStatus;
  qrToken: string;
}

/** Entidad de dominio: no conoce Prisma, Nest ni la representación HTTP. */
export class Mesa {
  private currentStatus: MesaStatus;

  constructor(public readonly props: MesaProps) {
    this.currentStatus = props.status;
  }

  get id(): string {
    return this.props.id;
  }
  get locationId(): string {
    return this.props.locationId;
  }
  get code(): string {
    return this.props.code;
  }
  get capacity(): number {
    return this.props.capacity;
  }
  get status(): MesaStatus {
    return this.currentStatus;
  }
  get qrToken(): string {
    return this.props.qrToken;
  }

  changeStatus(status: MesaStatus): void {
    this.currentStatus = status;
  }
}
