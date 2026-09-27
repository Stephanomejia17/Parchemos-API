import { Inject, Injectable } from '@nestjs/common';
import {
  MesaConPedidos,
  agruparPorMesa,
} from '../../domain/entities/pedido-en-sala';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';

/**
 * GP-05 CA1/CA2: pedidos en curso de la sede agrupados por mesa, con sus
 * productos, cantidades y modalidad, y lo que falta pagar en cada mesa (CA3).
 */
@Injectable()
export class ListarPedidosEnSalaUseCase {
  constructor(
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(sedeId: string): Promise<MesaConPedidos[]> {
    const [enSala, cuentas] = await Promise.all([
      this.pedidos.findEnSalaDeSede(sedeId),
      this.pedidos.findCuentasPendientesDeSede(sedeId),
    ]);
    return agruparPorMesa(enSala, cuentas);
  }
}
