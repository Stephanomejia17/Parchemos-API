import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../../../common/errors/validation-error';

/**
 * Geocodificador con la nomenclatura oficial de la Alcaldia de Medellin
 * (servicio ArcGIS publico, sin clave). Geoapify/OSM no tiene numeros de casa
 * en Medellin; el catastro si: un punto por placa domiciliaria y un eje por
 * cuadra. Coordenadas en WGS84 (outSR=4326).
 */
const SERVICIO =
  'https://www.medellin.gov.co/servidormapas/rest/services/mapas_nacionales/VC_Direccion/MapServer';
const CAPA_PLACAS = 0;
const CAPA_EJES = 2;
const TIMEOUT_MS = 10_000;

export type PrecisionCatastro = 'placa' | 'cuadra' | 'eje';

export interface CatastroResultado {
  latitude: number;
  longitude: number;
  precision: PrecisionCatastro;
  /** Direccion oficial, p. ej. "CR 82C 29-11". */
  direccionOficial: string;
}

export type Cuadrante = 'SUR' | 'ESTE';

export interface DireccionNomenclatura {
  /** Codigos de via posibles en el catastro (Avenida puede ser CL o CR). */
  tiposVia: string[];
  /** Numero y letras de la via principal: "51", "10C". */
  numeroVia: string;
  cuadranteVia: Cuadrante | null;
  /** Numero y letras del cruce: "62E", "18AA". */
  cruce: string;
  cuadranteCruce: Cuadrante | null;
  placa: number;
}

const TIPOS_VIA: Array<[RegExp, string[]]> = [
  [/^avenida\s+(calle|cl)$/, ['CL']],
  [/^avenida\s+(carrera|cr|kr|cra)$/, ['CR']],
  [/^(avenida|av)$/, ['CL', 'CR']],
  [/^(calle|cl|cll)$/, ['CL']],
  [/^(carrera|cr|kr|cra|kra)$/, ['CR']],
  [/^(transversal|tv)$/, ['TV']],
  [/^(diagonal|dg)$/, ['DG']],
  [/^(circular|cq)$/, ['CQ']],
];

const normalizar = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Solo aplica a direcciones urbanas de Medellin con nomenclatura completa. */
export function esDireccionDeMedellin(address: string): boolean {
  const partes = address.split(',').map((p) => normalizar(p));
  const idxPais = partes.lastIndexOf('colombia');
  return idxPais >= 3 && partes[idxPais - 2] === 'medellin';
}

/**
 * Nomenclatura con letras y cuadrantes, como la escribe el formulario:
 *   "Calle 51 Sur # 62E - 16", "Carrera 34 # 18AA Sur - 160",
 *   "Carrera 10C # 44AA - 60". Tambien acepta el cuadrante al final
 *   ("Calle 10 # 43 - 36 Sur"), que pertenece al cruce.
 */
const CUADRANTE = 'sur|este|norte|oeste';
const PATRON_DIRECCION = new RegExp(
  String.raw`^(?<tipo>[a-zA-ZÀ-ſ. ]+?)\s+(?<numero>\d{1,3})\s*(?<letras>[a-z]{0,2})(?=[\s#-]|$)` +
    String.raw`(?:\s+(?<cuadranteVia>${CUADRANTE}))?\s*(?:bis\s*)?(?:#|no\.?|n°)` +
    String.raw`\s*(?<cruce>\d{1,3})\s*(?<letrasCruce>[a-z]{0,2})(?=[\s-]|$)(?:\s+(?<cuadranteCruce>${CUADRANTE}))?` +
    String.raw`\s*-\s*(?<placa>\d{1,3})\s*[a-z]?(?=\s|$)(?:\s+(?<cuadranteFinal>${CUADRANTE}))?$`,
  'i',
);

/** En Medellin Norte y Oeste son el valor por defecto: el catastro no los escribe. */
function aCuadrante(valor?: string): Cuadrante | null {
  const v = valor?.toUpperCase();
  return v === 'SUR' || v === 'ESTE' ? v : null;
}

export function parsearNomenclatura(
  address: string,
): DireccionNomenclatura | null {
  const via = address.split(',')[0]?.trim() ?? '';
  const g = PATRON_DIRECCION.exec(via)?.groups;
  if (!g) return null;

  const tipo = normalizar(g.tipo).replace(/\./g, '');
  const tiposVia = TIPOS_VIA.find(([regex]) => regex.test(tipo))?.[1];
  if (!tiposVia) return null;

  return {
    tiposVia,
    numeroVia: `${g.numero}${g.letras}`.toUpperCase(),
    cuadranteVia: aCuadrante(g.cuadranteVia),
    cruce: `${g.cruce}${g.letrasCruce}`.toUpperCase(),
    cuadranteCruce: aCuadrante(g.cuadranteCruce ?? g.cuadranteFinal),
    placa: Number(g.placa),
  };
}

/** Nombres de via en el catastro: "CL 51 SUR", "CR 10C". */
const viasCatastro = (dir: DireccionNomenclatura): string[] =>
  dir.tiposVia.map((t) =>
    [t, dir.numeroVia, dir.cuadranteVia].filter(Boolean).join(' '),
  );

/** Cruce como lo escribe el catastro en la placa: "18AA SUR", "62E". */
const cruceCatastro = (dir: DireccionNomenclatura): string =>
  [dir.cruce, dir.cuadranteCruce].filter(Boolean).join(' ');

const placaCatastro = (dir: DireccionNomenclatura): string =>
  `${cruceCatastro(dir)}-${String(dir.placa).padStart(2, '0')}`;

interface Feature<A, G> {
  attributes: A;
  geometry?: G;
}
type Punto = { x: number; y: number };
type Linea = { paths: number[][][] };

const lista = (valores: string[]): string =>
  valores.map((v) => `'${v.replace(/'/g, "''")}'`).join(',');

/** Distancia en metros entre dos puntos [lon, lat]. */
function metros(a: number[], b: number[]): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2));
  const y = rad(b[1] - a[1]);
  return Math.hypot(x, y) * 6_371_000;
}

/**
 * Punto a `distancia` metros desde el inicio de la linea. Por convencion la
 * placa ("39-72") son los metros desde la esquina de la via generadora, que
 * es donde empieza el eje de la cuadra en el catastro.
 */
export function puntoSobreLinea(
  vertices: number[][],
  distancia: number,
): number[] {
  let restante = distancia;
  for (let i = 1; i < vertices.length; i++) {
    const tramo = metros(vertices[i - 1], vertices[i]);
    if (restante <= tramo && tramo > 0) {
      const t = restante / tramo;
      return [
        vertices[i - 1][0] + (vertices[i][0] - vertices[i - 1][0]) * t,
        vertices[i - 1][1] + (vertices[i][1] - vertices[i - 1][1]) * t,
      ];
    }
    restante -= tramo;
  }
  return vertices[vertices.length - 1];
}

@Injectable()
export class MedellinCatastroGeocoder {
  async geocode(address: string): Promise<CatastroResultado | null> {
    const dir = parsearNomenclatura(address);
    if (!dir) return null;

    return (
      (await this.porPlacaExacta(dir)) ??
      (await this.porPlacaDeLaCuadra(dir)) ??
      (await this.porEjeDeLaCuadra(dir))
    );
  }

  /**
   * Cuadras reales de la via con el mismo numero de cruce, p. ej. para
   * "Carrera 80 # 32 - 05" devuelve ["32D", "32E", "32EE", "32F"]. Sirve para
   * explicar por que una direccion no existe.
   */
  async cuadrasParecidas(address: string): Promise<string[]> {
    const dir = parsearNomenclatura(address);
    if (!dir) return [];
    const numeroCruce = /^\d+/.exec(dir.cruce)?.[0];
    if (!numeroCruce) return [];

    const filas = await this.consultar<
      Feature<{ name: string; orientacion_cruce: string | null }, Linea>
    >(
      CAPA_EJES,
      `label IN (${lista(viasCatastro(dir))}) AND name LIKE '${dir.numeroVia}-${numeroCruce}%'`,
      'name,orientacion_cruce',
    );
    const cruces = filas
      .map(({ attributes: { name, orientacion_cruce } }) => {
        const cruce = name.slice(dir.numeroVia.length + 1);
        const cuadrante =
          orientacion_cruce === 'S'
            ? 'SUR'
            : orientacion_cruce === 'E'
              ? 'ESTE'
              : null;
        return cuadrante && !cruce.endsWith(cuadrante)
          ? `${cruce} ${cuadrante}`
          : cruce;
      })
      // Solo el mismo numero con o sin letras: "32D" si, "320" no.
      .filter((c) => new RegExp(`^${numeroCruce}[A-Z]*( SUR| ESTE)?$`).test(c));
    return [...new Set(cruces)].sort().slice(0, 8);
  }

  private async porPlacaExacta(
    dir: DireccionNomenclatura,
  ): Promise<CatastroResultado | null> {
    const placa = placaCatastro(dir);
    // Algunas placas traen el codigo de interior: "46C-281 (0110)".
    const filas = await this.consultar<
      Feature<{ direccion: string; via: string }, Punto>
    >(
      CAPA_PLACAS,
      `via IN (${lista(viasCatastro(dir))}) AND (placa = '${placa}' OR placa LIKE '${placa} (%')`,
      'direccion,via',
    );
    const elegida = this.unicaPorVia(filas);
    return elegida?.geometry
      ? {
          latitude: elegida.geometry.y,
          longitude: elegida.geometry.x,
          precision: 'placa',
          direccionOficial: elegida.attributes.direccion,
        }
      : null;
  }

  private async porPlacaDeLaCuadra(
    dir: DireccionNomenclatura,
  ): Promise<CatastroResultado | null> {
    const filas = await this.consultar<
      Feature<{ direccion: string; via: string; placa: string }, Punto>
    >(
      CAPA_PLACAS,
      `via IN (${lista(viasCatastro(dir))}) AND placa LIKE '${cruceCatastro(dir)}-%'`,
      'direccion,via,placa',
    );
    const deLaVia = this.filasDeUnaVia(filas);
    const prefijo = `${cruceCatastro(dir)}-`;
    let mejor: (typeof deLaVia)[number] | null = null;
    let mejorDiferencia = Infinity;
    for (const fila of deLaVia) {
      // Solo placas de esta cuadra: "29-03" si, "29 SUR-11" no (es otra cuadra).
      if (!fila.attributes.placa.startsWith(prefijo)) continue;
      const numero = /^\d+/.exec(
        fila.attributes.placa.slice(prefijo.length),
      )?.[0];
      if (!numero || !fila.geometry) continue;
      const diferencia = Math.abs(Number(numero) - dir.placa);
      if (diferencia < mejorDiferencia) {
        mejor = fila;
        mejorDiferencia = diferencia;
      }
    }
    return mejor?.geometry
      ? {
          latitude: mejor.geometry.y,
          longitude: mejor.geometry.x,
          precision: 'cuadra',
          direccionOficial: `${mejor.attributes.via} ${placaCatastro(dir)}`,
        }
      : null;
  }

  private async porEjeDeLaCuadra(
    dir: DireccionNomenclatura,
  ): Promise<CatastroResultado | null> {
    // El nombre del eje no lleva el cuadrante de la via ("51-62E" en CL 51
    // SUR); el del cruce va en el nombre o solo en orientacion_cruce.
    const nombres = [
      `${dir.numeroVia}-${dir.cruce}`,
      `${dir.numeroVia}-${cruceCatastro(dir)}`,
      `${dir.numeroVia}-CL ${dir.cruce}`,
      `${dir.numeroVia}-CR ${dir.cruce}`,
    ];
    const orientacion = dir.cuadranteCruce
      ? `(orientacion_cruce = '${dir.cuadranteCruce[0]}' OR name LIKE '% ${dir.cuadranteCruce}')`
      : `orientacion_cruce IS NULL AND name NOT LIKE '% SUR' AND name NOT LIKE '% ESTE'`;
    const filas = await this.consultar<Feature<{ label: string }, Linea>>(
      CAPA_EJES,
      `label IN (${lista(viasCatastro(dir))}) AND name IN (${lista([...new Set(nombres)])}) AND ${orientacion}`,
      'label',
    );
    const deLaVia = this.filasDeUnaVia(
      filas.map((f) => ({ ...f, attributes: { via: f.attributes.label } })),
    );
    const vertices = deLaVia[0]?.geometry?.paths.flat();
    if (!vertices?.length) return null;

    // Si el catastro tiene dos ejes con ese nombre lejos entre si, la cuadra
    // no es unica (pasa con vias partidas): no se adivina.
    const inicio = vertices[0];
    const lejanos = deLaVia.some((f) => {
      const otro = f.geometry?.paths[0]?.[0];
      return otro ? metros(inicio, otro) > 300 : false;
    });
    if (lejanos) return null;

    const [lon, lat] = puntoSobreLinea(vertices, dir.placa);
    return {
      latitude: lat,
      longitude: lon,
      precision: 'eje',
      direccionOficial: `${deLaVia[0].attributes.via} ${placaCatastro(dir)}`,
    };
  }

  /** Avenida puede existir como CL y como CR: si aparecen ambas, es ambigua. */
  private filasDeUnaVia<F extends { attributes: { via: string } }>(
    filas: F[],
  ): F[] {
    const vias = new Set(filas.map((f) => f.attributes.via));
    if (vias.size > 1) {
      throw new ValidationError(
        'La dirección existe como calle y como carrera. Indica si es "Avenida Calle" o "Avenida Carrera".',
        'GEOCODING_AMBIGUOUS',
      );
    }
    return filas;
  }

  private unicaPorVia<F extends { attributes: { via: string } }>(
    filas: F[],
  ): F | null {
    return this.filasDeUnaVia(filas)[0] ?? null;
  }

  private async consultar<F>(
    capa: number,
    where: string,
    campos: string,
  ): Promise<F[]> {
    const url = new URL(`${SERVICIO}/${capa}/query`);
    url.searchParams.set('where', where);
    url.searchParams.set('outFields', campos);
    url.searchParams.set('returnGeometry', 'true');
    url.searchParams.set('outSR', '4326');
    url.searchParams.set('resultRecordCount', '200');
    url.searchParams.set('f', 'json');

    let datos: { features?: F[]; error?: { message?: string } };
    try {
      const respuesta = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      datos = (await respuesta.json()) as typeof datos;
    } catch {
      throw new ValidationError(
        'No fue posible consultar la nomenclatura oficial de Medellín. Intenta nuevamente.',
        'GEOCODING_FAILED',
      );
    }
    if (datos.error) {
      throw new ValidationError(
        'La nomenclatura oficial de Medellín no respondió correctamente. Intenta nuevamente.',
        'GEOCODING_FAILED',
      );
    }
    return datos.features ?? [];
  }
}
