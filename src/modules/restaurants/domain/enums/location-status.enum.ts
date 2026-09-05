/**
 * Estado de una sede (PU-08). Los valores coinciden con los que ya usa la
 * columna en Postgres (location_status): cambiarlos exigiria una migracion de
 * datos que no es parte de esta migracion de arquitectura.
 */
export enum LocationStatus {
  PENDING_APPROVAL = 'pendiente_aprobacion',
  ACTIVE = 'activa',
  REJECTED = 'rechazada',
}
