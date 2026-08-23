import { BaseEntity } from '../../../../common/domain/base.entity';
import { ResenaEstado } from '../enums/resena-estado.enum';

export class Resena extends BaseEntity {
  constructor(
    id: string,
    public comensalId: string,
    public restauranteId: string,
    public calificacion: number,
    public comentario: string,
    public estado: ResenaEstado = ResenaEstado.PENDIENTE_MODERACION,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
  }
}
