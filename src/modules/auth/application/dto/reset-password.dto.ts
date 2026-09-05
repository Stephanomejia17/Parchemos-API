import { IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  // El token es el access token de recuperacion que emite Supabase: un JWT,
  // bastante mas largo que el token propio que se usaba antes.
  @IsString()
  @Length(20, 4096)
  token!: string;

  @IsString()
  @Length(8, 128)
  @Matches(/[A-Z]/)
  @Matches(/\d/)
  password!: string;
}
