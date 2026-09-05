export class AccountDisabledError extends Error {
  constructor(public readonly userId: string) {
    super(`Account disabled: ${userId}`);
    this.name = 'AccountDisabledError';
  }
}
