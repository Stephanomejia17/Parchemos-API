import { IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReportReason } from '../../../../../generated/prisma/client';

export class CreateReportDto {
  @IsEnum(ReportReason)
  reason!: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ModerationReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ModerationReportsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(['pending', 'reviewed', 'all'])
  status?: 'pending' | 'reviewed' | 'all';
}

export class ReviewReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  result!: string;
}
