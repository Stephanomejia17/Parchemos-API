import { StaffMember } from '../entities/staff-member.entity';

export const STAFF_REPOSITORY = Symbol('STAFF_REPOSITORY');

export interface CreateStaffData {
  /** Id de la cuenta en Supabase Auth: coincide con public.users.id. */
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  locationId: string;
}

export interface UpdateStaffProfileData {
  fullName?: string;
  phone?: string | null;
}

export interface StaffRepository {
  findManyByOwner(ownerId: string): Promise<StaffMember[]>;
  /** Ownership check de GU-05: null si el personal no trabaja para ese dueno. */
  findByIdAndOwner(
    ownerId: string,
    staffId: string,
  ): Promise<StaffMember | null>;
  emailInUse(email: string): Promise<boolean>;
  create(data: CreateStaffData): Promise<StaffMember>;
  updateProfile(
    staffId: string,
    data: UpdateStaffProfileData,
  ): Promise<StaffMember>;
  reassignLocation(staffId: string, locationId: string): Promise<StaffMember>;
  setEnabled(staffId: string, enabled: boolean): Promise<StaffMember>;
}
