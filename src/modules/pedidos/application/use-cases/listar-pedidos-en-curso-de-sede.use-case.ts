import { Inject, Injectable } from '@nestjs/common';
import { Pedido } from '../../domain/entities/pedido.entity';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

/** GP-08: pedidos que el personal de la sede tiene por atender (panel de sala). */
@Injectable()
export class ListarPedidosEnCursoDeSedeUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(sedeId: string, actor: Actor): Promise<Pedido[]> {
    await this.access.assertPuedeGestionarSede(sedeId, actor);
    return this.pedidos.findEnCursoDeSede(sedeId);
  }
}
