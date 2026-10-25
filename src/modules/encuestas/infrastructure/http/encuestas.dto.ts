import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const SURVEY_TYPES = ['calificacion', 'opciones', 'texto'] as const;

export class SurveyQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  prompt!: string;

  @IsIn(SURVEY_TYPES)
  type!: (typeof SURVEY_TYPES)[number];

  @IsBoolean()
  required!: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  position!: number;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  options!: string[];
}

export class SaveSurveyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SurveyQuestionDto)
  questions!: SurveyQuestionDto[];
}

export class CreateSurveyDto extends SaveSurveyDto {
  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class AssignSurveyRestaurantsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  restaurantIds!: string[];
}

export class SurveyAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsString()
  @MaxLength(2000)
  value!: string;
}

export class SubmitSurveyDto {
  @IsUUID()
  surveyId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SurveyAnswerDto)
  answers!: SurveyAnswerDto[];
}

export class SurveyReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  surveyId?: string;
}
