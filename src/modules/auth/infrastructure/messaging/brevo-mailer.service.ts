import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PasswordResetMailer } from '../../application/ports/password-reset-mailer';

@Injectable()
export class BrevoMailerService implements PasswordResetMailer {
  private readonly logger = new Logger(BrevoMailerService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(data: {
    email: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void> {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': this.config.getOrThrow<string>('BREVO_API_KEY'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: this.config.get<string>('BREVO_SENDER_NAME', 'Parchemos'),
          email: this.config.getOrThrow<string>('BREVO_SENDER_EMAIL'),
        },
        to: [{ email: data.email, name: data.fullName }],
        subject: 'Recupera tu contraseña de Parchemos',
       htmlContent: `
                    <div style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#27303a;">
                      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
                        Recupera el acceso a tu cuenta de Parchemos.
                      </div>

                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:32px 16px;">
                        <tr>
                          <td align="center">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(39,48,58,.08);">
                              
                              <tr>
                                <td style="background:#ff6b35;padding:28px 32px;text-align:center;">
                                  <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:.5px;">
                                    Parchemos
                                  </div>
                                  <div style="margin-top:6px;font-size:14px;color:#fff4ef;">
                                    Tu experiencia gastronómica comienza aquí
                                  </div>
                                </td>
                              </tr>

                              <tr>
                                <td style="padding:36px 32px 20px;">
                                  <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#1f2933;">
                                    Recupera tu contraseña
                                  </h1>

                                  <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                                    Hola <strong>${escapeHtml(data.fullName)}</strong>,
                                  </p>

                                  <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#52606d;">
                                    Recibimos una solicitud para cambiar la contraseña de tu cuenta de Parchemos.
                                    Haz clic en el siguiente botón para crear una nueva:
                                  </p>

                                  <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 28px;">
                                    <tr>
                                      <td align="center" style="border-radius:12px;background:#ff6b35;">
                                        <a
                                          href="${escapeHtml(data.resetUrl)}"
                                          style="display:inline-block;padding:15px 26px;border-radius:12px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;"
                                        >
                                          Cambiar mi contraseña
                                        </a>
                                      </td>
                                    </tr>
                                  </table>

                                  <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#7b8794;">
                                    Por seguridad, este enlace es temporal y solo puede utilizarse una vez.
                                  </p>

                                  <p style="margin:0;font-size:14px;line-height:1.6;color:#7b8794;">
                                    Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña actual
                                    permanecerá sin cambios.
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </div>
                  `,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(`Brevo rechazó el correo: ${response.status} ${details}`);
      throw new InternalServerErrorException('No se pudo enviar el correo.');
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}
