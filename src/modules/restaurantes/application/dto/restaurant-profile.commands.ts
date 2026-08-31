/**
 * Inputs de aplicación de AN-01 y GU-05.
 *
 * No contienen decoradores HTTP: el controlador adapta los DTO validados a
 * estos contratos y los casos de uso no dependen de Nest ni de transporte.
 */
export interface CreateRestaurantCommand {
  businessName: string;
}

export interface CreateLocationCommand {
  name: string;
  description?: string;
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface UpdateLocationCommand {
  name?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface SchedulePeriodCommand {
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}

export interface CreateStaffCommand {
  fullName: string;
  email: string;
  phone?: string;
  locationId: string;
  initialPassword: string;
}

export interface UpdateStaffCommand {
  fullName?: string;
  phone?: string;
}
