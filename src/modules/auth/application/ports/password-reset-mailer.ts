export const PASSWORD_RESET_MAILER = Symbol('PASSWORD_RESET_MAILER');

export interface PasswordResetMailer {
  sendPasswordResetEmail(data: {
    email: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void>;
}
