import { IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(20, 200)
  token!: string;

  @IsString()
  @Length(8, 128)
  @Matches(/[A-Z]/)
  @Matches(/\d/)
  password!: string;
}
