export class InvalidTokenError extends Error {
  constructor(reason?: string) {
    super(
      reason ? `Invalid Supabase token: ${reason}` : 'Invalid Supabase token',
    );
    this.name = 'InvalidTokenError';
  }
}
