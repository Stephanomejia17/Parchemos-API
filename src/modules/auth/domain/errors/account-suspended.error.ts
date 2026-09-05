export class AccountSuspendedError extends Error {
  constructor(
    public readonly userId: string,
    public readonly reason: string | null,
  ) {
    super(`Account suspended: ${userId}`);
    this.name = 'AccountSuspendedError';
  }
}
