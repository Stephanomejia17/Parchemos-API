import { PedidoEstado } from '../enums/pedido-estado.enum';
import { PedidoModalidad } from '../enums/pedido-modalidad.enum';
import {
  ESTADO_INICIAL_PEDIDO,
  esTransicionValida,
  siguientesEstados,
} from './pedido-estado-flujo';

describe('pedido-estado-flujo', () => {
  it('el estado inicial de un pedido confirmado es pendiente', () => {
    expect(ESTADO_INICIAL_PEDIDO).toBe(PedidoEstado.PENDIENTE);
  });

  it('permite marcar como listo un pedido en preparación', () => {
    expect(
      esTransicionValida(
        PedidoEstado.EN_PREPARACION,
        PedidoEstado.LISTO,
        PedidoModalidad.EN_MESA,
      ),
    ).toBe(true);
  });

  it('no permite retroceder de listo a en preparación', () => {
    expect(
      esTransicionValida(
        PedidoEstado.LISTO,
        PedidoEstado.EN_PREPARACION,
        PedidoModalidad.EN_MESA,
      ),
    ).toBe(false);
  });

  it('un pedido en mesa pasa de listo a entregado sin ir en camino', () => {
    expect(
      siguientesEstados(PedidoEstado.LISTO, PedidoModalidad.EN_MESA),
    ).toEqual([PedidoEstado.ENTREGADO]);
  });

  it('un domicilio listo debe salir en camino antes de entregarse', () => {
    expect(
      siguientesEstados(PedidoEstado.LISTO, PedidoModalidad.DOMICILIO),
    ).toEqual([PedidoEstado.EN_CAMINO]);
  });

  it('entregado y cancelado son estados finales', () => {
    expect(
      siguientesEstados(PedidoEstado.ENTREGADO, PedidoModalidad.EN_MESA),
    ).toEqual([]);
    expect(
      siguientesEstados(PedidoEstado.CANCELADO, PedidoModalidad.EN_MESA),
    ).toEqual([]);
  });
});
