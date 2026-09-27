import { Inject, Injectable } from '@nestjs/common';
import {
  ResumenSede,
  inicioDelDiaEnBogota,
} from '../../domain/entities/resumen-sede';
import { PEDIDO_REPOSITORY } from '../../domain/repositories/pedido.repository';
import type { PedidoRepository } from '../../domain/repositories/pedido.repository';
import { PedidoAccess } from './pedido-access';
import type { Actor } from './pedido-access';

/** GP-05: indicadores del día (hora de Colombia) del panel de sala. */
@Injectable()
export class ConsultarResumenSedeUseCase {
  constructor(
    private readonly access: PedidoAccess,
    @Inject(PEDIDO_REPOSITORY) private readonly pedidos: PedidoRepository,
  ) {}

  async execute(
    sedeId: string,
    actor: Actor,
    ahora = new Date(),
  ): Promise<ResumenSede> {
    await this.access.assertPuedeGestionarSede(sedeId, actor);
    return this.pedidos.resumenDeSede(sedeId, inicioDelDiaEnBogota(ahora));
  }
}
