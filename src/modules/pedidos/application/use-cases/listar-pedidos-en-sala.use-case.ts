import { Inject, Injectable } from '@nestjs/common';
import {
  MesaConPedidos,
  agruparPorMesa,
} from '../../domain/entities/pedido-en-sala';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

/**
 * GP-05 CA1/CA2: pedidos en curso de la sede agrupados por mesa, con sus
 * productos, cantidades y modalidad, y lo que falta pagar en cada mesa (CA3).
 * Solo los ve el personal activo de esa sede, el dueño o el administrador.
 */
@Injectable()
export class ListarPedidosEnSalaUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(sedeId: string, actor: Actor): Promise<MesaConPedidos[]> {
    await this.access.assertPuedeGestionarSede(sedeId, actor);
    const [enSala, cuentas] = await Promise.all([
      this.pedidos.findEnSalaDeSede(sedeId),
      this.pedidos.findCuentasPendientesDeSede(sedeId),
    ]);
    return agruparPorMesa(enSala, cuentas);
  }
}
