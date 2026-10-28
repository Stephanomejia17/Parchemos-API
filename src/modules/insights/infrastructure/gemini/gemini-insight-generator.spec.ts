import { parsearInsight } from './gemini-insight-generator';

describe('parsearInsight', () => {
  it('acepta un JSON con la forma esperada', () => {
    const texto = JSON.stringify({
      resumen: 'Ventas estables.',
      hallazgos: [
        {
          titulo: 'Pico',
          detalle: 'El sábado vendió $1.200.000',
          tipo: 'positivo',
        },
      ],
      recomendaciones: [
        { accion: 'Promo martes', motivo: 'Día flojo', prioridad: 'alta' },
      ],
    });

    expect(parsearInsight(texto)).toEqual(JSON.parse(texto));
  });

  it('normaliza enums desconocidos y descarta items incompletos', () => {
    const resultado = parsearInsight(
      JSON.stringify({
        resumen: 'x',
        hallazgos: [
          { titulo: 'a', detalle: 'b', tipo: 'raro' },
          { titulo: 'sin detalle' },
        ],
        recomendaciones: [{ accion: 'c', motivo: 'd', prioridad: 'urgente' }],
      }),
    );

    expect(resultado?.hallazgos).toEqual([
      { titulo: 'a', detalle: 'b', tipo: 'neutral' },
    ]);
    expect(resultado?.recomendaciones[0].prioridad).toBe('media');
  });

  it('rechaza JSON inválido o sin resumen', () => {
    expect(parsearInsight('{"resumen": "cortado')).toBeNull();
    expect(
      parsearInsight(JSON.stringify({ hallazgos: [], recomendaciones: [] })),
    ).toBeNull();
  });
});
