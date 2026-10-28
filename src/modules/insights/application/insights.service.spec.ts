import type { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { Role } from '../../../common/enums/role.enum';
import type { EstadisticasService } from '../../estadisticas/application/estadisticas.service';
import type { Insight, InsightContent } from '../domain/insight';
import type { InsightGenerator } from '../domain/insight-generator';
import type { InsightRepository } from '../domain/insight.repository';
import { InsightsService } from './insights.service';

const dueno: AuthenticatedUser = {
  id: 'user-1',
  email: 'dueno@parchemos.co',
  role: Role.RESTAURANTE,
  status: 'activa',
};
const contenido: InsightContent = {
  resumen: 'Buen mes.',
  hallazgos: [],
  recomendaciones: [],
};
// 2026-10-28 23:30 en Bogota = 2026-10-29 04:30 UTC: debe contar como el 28.
const ahora = new Date('2026-10-29T04:30:00Z');
const consulta = { desde: '2026-10-01', hasta: '2026-10-28' };

function insightListo(): Insight {
  return {
    id: 'ins-1',
    scope: 'restaurante',
    fecha: '2026-10-28',
    rango: consulta,
    restauranteId: null,
    contenido,
    modelo: 'gemini-flash-latest',
    generadoEn: ahora.toISOString(),
  };
}

function setup() {
  const repo: jest.Mocked<InsightRepository> = {
    delDia: jest
      .fn()
      .mockResolvedValue({ insight: null, generandoDesde: null }),
    reservar: jest.fn().mockResolvedValue('ins-1'),
    liberarSiEstancada: jest.fn().mockResolvedValue(true),
    completar: jest.fn().mockResolvedValue(insightListo()),
    liberar: jest.fn().mockResolvedValue(undefined),
  };
  const generator: jest.Mocked<InsightGenerator> = {
    generar: jest
      .fn()
      .mockResolvedValue({ contenido, modelo: 'gemini-flash-latest' }),
  };
  const estadisticas = {
    resumenRestaurante: jest.fn().mockResolvedValue({
      rango: consulta,
      totales: { ingresosBrutos: 100, comisionTotal: 10, pedidos: 2 },
      serie: [],
      sinDatos: false,
    }),
    tendencias: jest.fn().mockResolvedValue({
      rango: consulta,
      suficiente: true,
      serie: [],
      topContenido: [
        {
          postId: 'p1',
          descripcion: 'Bandeja paisa',
          autor: 'Ana Pérez',
          sede: 'Centro',
          likes: 3,
          visualizaciones: 9,
          imagenes: 1,
          videos: 0,
        },
      ],
    }),
    ingresosAfiliados: jest
      .fn()
      .mockResolvedValue({ rango: consulta, filas: [], sinDatos: true }),
  };
  const service = new InsightsService(
    estadisticas as unknown as EstadisticasService,
    repo,
    generator,
    () => ahora,
  );
  return { service, repo, generator, estadisticas };
}

describe('InsightsService', () => {
  it('genera y guarda el insight cargandolo al dia de Colombia', async () => {
    const { service, repo, generator } = setup();

    await service.generarRestaurante(dueno, consulta);

    expect(repo.reservar).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: '2026-10-28', scope: 'restaurante' }),
    );
    expect(generator.generar).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'restaurante', rango: consulta }),
    );
    expect(repo.completar).toHaveBeenCalledWith(
      'ins-1',
      contenido,
      'gemini-flash-latest',
    );
  });

  it('rechaza una segunda solicitud el mismo dia sin llamar a la IA', async () => {
    const { service, repo, generator } = setup();
    repo.reservar.mockResolvedValue(null);
    repo.delDia.mockResolvedValue({
      insight: insightListo(),
      generandoDesde: null,
    });

    await expect(
      service.generarRestaurante(dueno, consulta),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'INSIGHT_DAILY_LIMIT',
      details: { proximoDisponible: '2026-10-29' },
    });
    expect(generator.generar).not.toHaveBeenCalled();
  });

  it('responde 409 si la generacion de hoy sigue en curso', async () => {
    const { service, repo, generator } = setup();
    repo.reservar.mockResolvedValue(null);
    repo.delDia.mockResolvedValue({
      insight: null,
      generandoDesde: new Date(ahora.getTime() - 30_000),
    });

    await expect(
      service.generarRestaurante(dueno, consulta),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INSIGHT_IN_PROGRESS',
    });
    expect(generator.generar).not.toHaveBeenCalled();
  });

  it('recupera una reserva abandonada hace mas de 5 minutos', async () => {
    const { service, repo, generator } = setup();
    repo.reservar.mockResolvedValueOnce(null).mockResolvedValueOnce('ins-2');
    repo.delDia.mockResolvedValue({
      insight: null,
      generandoDesde: new Date(ahora.getTime() - 10 * 60_000),
    });

    await service.generarRestaurante(dueno, consulta);

    expect(repo.liberarSiEstancada).toHaveBeenCalled();
    expect(generator.generar).toHaveBeenCalled();
    expect(repo.completar).toHaveBeenCalledWith(
      'ins-2',
      contenido,
      'gemini-flash-latest',
    );
  });

  it('libera el cupo si la IA falla', async () => {
    const { service, repo, generator } = setup();
    generator.generar.mockRejectedValue(new Error('timeout'));

    await expect(service.generarRestaurante(dueno, consulta)).rejects.toThrow(
      'timeout',
    );
    expect(repo.liberar).toHaveBeenCalledWith('ins-1');
    expect(repo.completar).not.toHaveBeenCalled();
  });

  it('valida el acceso al restaurante antes de reservar el cupo', async () => {
    const { service, repo, estadisticas } = setup();
    estadisticas.resumenRestaurante.mockRejectedValue(new Error('403'));

    await expect(
      service.generarRestaurante(dueno, { ...consulta, restauranteId: 'r-1' }),
    ).rejects.toThrow('403');
    expect(repo.reservar).not.toHaveBeenCalled();
  });

  it('rechaza rangos de mas de un año', async () => {
    const { service, repo } = setup();

    await expect(
      service.generarRestaurante(dueno, {
        desde: '2025-01-01',
        hasta: '2026-10-28',
      }),
    ).rejects.toMatchObject({ code: 'INSIGHT_RANGE_TOO_LONG' });
    expect(repo.reservar).not.toHaveBeenCalled();
  });

  it('no envia el nombre de los autores al modelo en el insight de admin', async () => {
    const { service, generator } = setup();

    await service.generarAdministrador(
      { ...dueno, role: Role.ADMINISTRADOR },
      consulta,
    );

    const datos = generator.generar.mock.calls[0][0].datos;
    expect(JSON.stringify(datos)).not.toContain('Ana Pérez');
    expect(JSON.stringify(datos)).toContain('Bandeja paisa');
  });

  it('informa si el cupo de hoy esta disponible', async () => {
    const { service, repo } = setup();
    expect(await service.estado(dueno, 'restaurante')).toMatchObject({
      insight: null,
      disponible: true,
      proximoDisponible: '2026-10-28',
    });

    repo.delDia.mockResolvedValue({
      insight: insightListo(),
      generandoDesde: null,
    });
    expect(await service.estado(dueno, 'restaurante')).toMatchObject({
      disponible: false,
      proximoDisponible: '2026-10-29',
    });
  });
});
