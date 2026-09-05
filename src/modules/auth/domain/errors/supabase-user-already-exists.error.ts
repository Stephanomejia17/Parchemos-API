export class SupabaseUserAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`Supabase user already exists: ${email}`);
    this.name = 'SupabaseUserAlreadyExistsError';
  }
}
