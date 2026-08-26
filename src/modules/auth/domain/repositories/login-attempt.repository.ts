export const LOGIN_ATTEMPT_REPOSITORY = Symbol('LOGIN_ATTEMPT_REPOSITORY');

export interface LoginAttemptData {
  emailAttempted: string;
  userId?: string | null;
  successful: boolean;
  /** Solo se guarda en intentos fallidos; nunca se expone al cliente. */
  failureReason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LoginAttemptRepository {
  record(data: LoginAttemptData): Promise<void>;
}
