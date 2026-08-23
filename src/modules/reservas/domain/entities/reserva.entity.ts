import { BaseEntity } from '../../../../common/domain/base.entity';
import { ReservaEstado } from '../enums/reserva-estado.enum';

export class Reserva extends BaseEntity {
  constructor(
    id: string,
    public comensalId: string,
    public restauranteId: string,
    public fechaHora: Date,
    public numeroPersonas: number,
    public estado: ReservaEstado = ReservaEstado.PENDIENTE,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
  }
}
