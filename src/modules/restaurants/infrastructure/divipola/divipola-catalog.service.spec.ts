import { DivipolaCatalogService } from './divipola-catalog.service';

describe('DivipolaCatalogService', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('usa la copia local si el DANE no responde', async () => {
    fetchMock.mockResolvedValue({ ok: false } as Response);

    const catalogo = await new DivipolaCatalogService().getCatalog();

    expect(catalogo.departments).toHaveLength(33);
    expect(catalogo.municipalities).toHaveLength(1122);
    expect(catalogo.municipalities).toContainEqual({
      departmentCode: '05',
      municipalityCode: '05001',
      department: 'ANTIOQUIA',
      municipality: 'MEDELLÍN',
    });
  });

  it('no vuelve a consultar al DANE durante una hora tras un fallo', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    const service = new DivipolaCatalogService();

    await service.getCatalog();
    await service.getCatalog();

    // Una consulta por capa (departamentos y municipios) en el primer intento.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('quita las comas de los nombres para no romper las direcciones', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    const { departments } = await new DivipolaCatalogService().getCatalog();

    expect(departments.map((d) => d.name)).toContain('BOGOTÁ D.C.');
    expect(departments.every((d) => !d.name.includes(','))).toBe(true);
  });
});
