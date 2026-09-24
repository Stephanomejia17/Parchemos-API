import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PedidoEstado } from '../../domain/enums/pedido-estado.enum';

/** Estados a los que el restaurante puede mover un pedido desde este endpoint. */
export const ESTADOS_GESTIONABLES = [
  PedidoEstado.CONFIRMADO,
  PedidoEstado.EN_PREPARACION,
  PedidoEstado.LISTO,
  PedidoEstado.EN_CAMINO,
  PedidoEstado.ENTREGADO,
] as const;

export class CambiarEstadoPedidoDto {
  @IsIn(ESTADOS_GESTIONABLES, {
    message: `estado debe ser uno de: ${ESTADOS_GESTIONABLES.join(', ')}.`,
  })
  estado!: (typeof ESTADOS_GESTIONABLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  nota?: string;
}
