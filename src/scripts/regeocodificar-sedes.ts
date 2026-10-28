/**
 * Recalcula las coordenadas de todas las sedes con el geocodificador actual
 * (nomenclatura oficial de Medellin).
 *
 *   npm run geo:regeocodificar            -> solo muestra lo que cambiaria
 *   npm run geo:regeocodificar -- --aplicar
 *
 * Con --aplicar, las sedes cuya direccion no se puede verificar quedan sin
 * coordenadas (no se muestran en el mapa) en vez de conservar una ubicacion
 * aproximada. No toca el estado de aprobacion de las sedes.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DomainError } from '../common/errors/domain-error';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { AddressGeocodingService } from '../modules/restaurants/infrastructure/geocoding/address-geocoding.service';

async function main(): Promise<void> {
  const aplicar = process.argv.includes('--aplicar');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const prisma = app.get(PrismaService);
  const geocoding = app.get(AddressGeocodingService, { strict: false });

  const sedes = await prisma.location.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      latitude: true,
      longitude: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let actualizadas = 0;
  let sinVerificar = 0;
  for (const sede of sedes) {
    let nueva: { latitude: number; longitude: number } | null = null;
    let motivo = '';
    try {
      nueva = await geocoding.geocode(sede.address);
    } catch (error) {
      motivo = error instanceof DomainError ? error.message : String(error);
    }

    const antes =
      sede.latitude === null
        ? 'sin ubicación'
        : `${sede.latitude.toFixed(6)},${sede.longitude?.toFixed(6)}`;
    if (nueva) {
      console.log(
        `✔ ${sede.name} | ${sede.address}\n    ${antes} -> ${nueva.latitude.toFixed(6)},${nueva.longitude.toFixed(6)}`,
      );
      if (aplicar) {
        await prisma.location.update({
          where: { id: sede.id },
          data: { latitude: nueva.latitude, longitude: nueva.longitude },
        });
      }
      actualizadas++;
    } else {
      console.log(
        `✘ ${sede.name} | ${sede.address}\n    ${antes} -> sin ubicación (${motivo})`,
      );
      if (aplicar && sede.latitude !== null) {
        await prisma.location.update({
          where: { id: sede.id },
          data: { latitude: null, longitude: null },
        });
      }
      sinVerificar++;
    }
  }

  console.log(
    `\n${actualizadas} sedes ubicadas, ${sinVerificar} sin dirección verificable.` +
      (aplicar
        ? ' Cambios guardados.'
        : ' Modo prueba: ejecuta con --aplicar para guardar.'),
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
