import { Inject, Injectable } from '@nestjs/common';
import { inicioDelDiaEnBogota } from '../../domain/entities/resumen-sede';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

@Injectable()
export class ListarPedidosEntregadosDeSedeUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(sedeId: string, actor: Actor, ahora = new Date()) {
    await this.access.assertPuedeGestionarSede(sedeId, actor);
    return this.pedidos.findEntregadosDeSede(
      sedeId,
      inicioDelDiaEnBogota(ahora),
    );
  }
}
