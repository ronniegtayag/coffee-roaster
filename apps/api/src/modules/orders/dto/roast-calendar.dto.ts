import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsPlainDate } from '../../../common/validators';
import { trim } from '../../../common/transforms';

const DAYS_MESSAGE = 'Choose weekdays from 1 (Monday) to 7 (Sunday)';
const LEAD_MESSAGE = 'Enter a whole number of days from 0 to 14';
const dedupeSort = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) ? [...new Set(value as number[])].sort((a, b) => a - b) : value;

export class RoastCalendarInput {
  @ApiProperty({ type: [Number], description: 'ISO weekdays, 1 = Monday ... 7 = Sunday' })
  @Transform(dedupeSort)
  @IsArray({ message: DAYS_MESSAGE })
  @ArrayNotEmpty({ message: DAYS_MESSAGE })
  @IsInt({ each: true, message: DAYS_MESSAGE })
  @Min(1, { each: true, message: DAYS_MESSAGE })
  @Max(7, { each: true, message: DAYS_MESSAGE })
  roastDays: number[];

  @ApiProperty({ type: [Number] })
  @Transform(dedupeSort)
  @IsArray({ message: DAYS_MESSAGE })
  @ArrayNotEmpty({ message: DAYS_MESSAGE })
  @IsInt({ each: true, message: DAYS_MESSAGE })
  @Min(1, { each: true, message: DAYS_MESSAGE })
  @Max(7, { each: true, message: DAYS_MESSAGE })
  deliveryDays: number[];

  @ApiProperty({ type: [Number] })
  @Transform(dedupeSort)
  @IsArray({ message: DAYS_MESSAGE })
  @ArrayNotEmpty({ message: DAYS_MESSAGE })
  @IsInt({ each: true, message: DAYS_MESSAGE })
  @Min(1, { each: true, message: DAYS_MESSAGE })
  @Max(7, { each: true, message: DAYS_MESSAGE })
  businessDays: number[];

  @ApiProperty({ example: '12:00', description: 'Sydney local time, HH:mm' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Enter a time as HH:mm' })
  cutoffTime: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 14 })
  @IsInt({ message: LEAD_MESSAGE })
  @Min(0, { message: LEAD_MESSAGE })
  @Max(14, { message: LEAD_MESSAGE })
  cutoffLeadBusinessDays: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: 14 })
  @IsInt({ message: LEAD_MESSAGE })
  @Min(0, { message: LEAD_MESSAGE })
  @Max(14, { message: LEAD_MESSAGE })
  deliveryLagBusinessDays: number;
}

export class RoastCalendarDto extends RoastCalendarInput {
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class CreateClosureDto {
  @ApiProperty({ type: String, format: 'date' })
  @IsPlainDate('Enter a date as YYYY-MM-DD')
  date: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString({ message: 'Description is required' })
  @IsNotEmpty({ message: 'Description is required' })
  @MaxLength(100, { message: 'Description must be 100 characters or fewer' })
  description: string;
}

export class ListClosuresQuery {
  @ApiProperty({ type: String, format: 'date', required: false, description: 'Default: today' })
  @IsOptional()
  @IsPlainDate('Enter a date as YYYY-MM-DD')
  from?: string;

  @ApiProperty({ type: String, format: 'date', required: false })
  @IsOptional()
  @IsPlainDate('Enter a date as YYYY-MM-DD')
  to?: string;
}

export class ClosureDayDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: String, format: 'date' }) date: string;
  @ApiProperty() description: string;
}

export class ClosureListDto {
  @ApiProperty({ type: () => [ClosureDayDto] }) items: ClosureDayDto[];
}
