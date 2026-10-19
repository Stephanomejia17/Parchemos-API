import { Workbook } from 'exceljs';
import PDFDocument from 'pdfkit';
import type { RangoFechas } from '../../domain/rango-fechas';
import type { ResumenRestaurante } from '../../domain/repositories/estadisticas.repository';

export type FormatoReporte = 'pdf' | 'xlsx';

export interface ArchivoReporte {
  nombre: string;
  contentType: string;
  buffer: Buffer;
}

export type DatosReporte = ResumenRestaurante & { rango: RangoFechas };

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** RN5: el archivo contiene exactamente lo que muestra el dashboard. */
export function generarReporteRestaurante(
  datos: DatosReporte,
  formato: FormatoReporte,
): Promise<ArchivoReporte> {
  const base = `ingresos-${datos.rango.desde}_${datos.rango.hasta}`;
  return formato === 'xlsx'
    ? generarXlsx(datos, base)
    : generarPdf(datos, base);
}

async function generarXlsx(
  datos: DatosReporte,
  base: string,
): Promise<ArchivoReporte> {
  const libro = new Workbook();
  const hoja = libro.addWorksheet('Ingresos y comisiones');
  const { totales, rango } = datos;

  hoja.addRow(['Período', `${rango.desde} a ${rango.hasta}`]);
  hoja.addRow(['Ingresos totales', totales.ingresosBrutos]).getCell(2).numFmt =
    '#,##0.00';
  hoja.addRow(['Comisión total', totales.comisionTotal]).getCell(2).numFmt =
    '#,##0.00';
  hoja.addRow(['Número de pedidos', totales.pedidos]);
  hoja.addRow([]);
  hoja.addRow(['Fecha', 'Ingresos brutos', 'Comisión', 'Pedidos']).font = {
    bold: true,
  };
  for (const p of datos.serie) {
    const fila = hoja.addRow([
      p.fecha,
      p.ingresosBrutos,
      p.comision,
      p.pedidos,
    ]);
    fila.getCell(2).numFmt = '#,##0.00';
    fila.getCell(3).numFmt = '#,##0.00';
  }
  hoja.columns = [{ width: 22 }, { width: 20 }, { width: 18 }, { width: 12 }];

  return {
    nombre: `${base}.xlsx`,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await libro.xlsx.writeBuffer()),
  };
}

function generarPdf(
  datos: DatosReporte,
  base: string,
): Promise<ArchivoReporte> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () =>
      resolve({
        nombre: `${base}.pdf`,
        contentType: 'application/pdf',
        buffer: Buffer.concat(partes),
      }),
    );
    doc.on('error', reject);

    const { totales, rango } = datos;
    doc.fontSize(18).text('Ingresos y comisiones');
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Período: ${rango.desde} a ${rango.hasta}`);
    doc.moveDown().fillColor('#000').fontSize(12);
    doc.text(`Ingresos totales: ${cop.format(totales.ingresosBrutos)}`);
    doc.text(`Comisión total: ${cop.format(totales.comisionTotal)}`);
    doc.text(`Número de pedidos: ${totales.pedidos}`);
    doc.moveDown();

    const columnas = [40, 150, 300, 430];
    const fila = (celdas: string[], negrita = false) => {
      if (doc.y > 760) doc.addPage();
      const y = doc.y;
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      celdas.forEach((celda, i) =>
        doc.text(celda, columnas[i], y, { width: 120 }),
      );
      doc.moveDown(0.4);
    };
    fila(['Fecha', 'Ingresos brutos', 'Comisión', 'Pedidos'], true);
    for (const p of datos.serie) {
      fila([
        p.fecha,
        cop.format(p.ingresosBrutos),
        cop.format(p.comision),
        String(p.pedidos),
      ]);
    }
    doc.end();
  });
}
