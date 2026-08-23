import { BaseEntity } from '../../../../common/domain/base.entity';

export class MenuItem {
  constructor(
    public readonly id: string,
    public nombre: string,
    public descripcion: string,
    public precio: number,
    public disponible: boolean = true,
  ) {}
}

export class Restaurante extends BaseEntity {
  constructor(
    id: string,
    public propietarioId: string,
    public nombre: string,
    public descripcion: string,
    public direccion: string,
    public horarios: string,
    public verificado: boolean = false,
    public menu: MenuItem[] = [],
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(id, createdAt, updatedAt);
  }
}
