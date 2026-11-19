import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AustralianState } from '../../../generated/prisma/client';
import { BranchDto } from './branch.dto';
import { abnOrNull, trim, trimOrNull } from './transforms';
import { IsAbnChecksum, IsAbnFormat } from './validators';

export const PAYMENT_TERMS_DEFAULT_DAYS = 14;
export const PAYMENT_TERMS_MAX_DAYS = 90;
const TERMS_MESSAGE = `Payment terms must be a whole number of days from 0 to ${PAYMENT_TERMS_MAX_DAYS}`;

export class CreateCustomerDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString({ message: 'Legal name is required' })
  @IsNotEmpty({ message: 'Legal name is required' })
  @MaxLength(200, { message: 'Legal name must be 200 characters or fewer' })
  legalName: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Trading name must be 200 characters or fewer' })
  tradingName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '51 824 753 556',
    description: 'Spaces are removed. Must be 11 digits and pass the ATO checksum.',
  })
  @Transform(abnOrNull)
  @IsOptional()
  @IsAbnChecksum()
  @IsAbnFormat()
  abn?: string | null;

  @ApiProperty({ maxLength: 254 })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254, { message: 'Enter a valid email address' })
  billingEmail: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Phone must be 30 characters or fewer' })
  phone?: string | null;

  @ApiPropertyOptional({
    type: Number,
    minimum: 0,
    maximum: PAYMENT_TERMS_MAX_DAYS,
    default: PAYMENT_TERMS_DEFAULT_DAYS,
    description: 'Whole days; 0 means due on issue. The default is an assumption (Q8).',
  })
  @IsOptional()
  @IsInt({ message: TERMS_MESSAGE })
  @Min(0, { message: TERMS_MESSAGE })
  @Max(PAYMENT_TERMS_MAX_DAYS, { message: TERMS_MESSAGE })
  paymentTermsDays?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Notes must be 2000 characters or fewer' })
  notes?: string | null;
}

/** legalName and billingEmail may be omitted but not null (checked in the service). */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export const CUSTOMER_STATUSES = ['active', 'inactive', 'all'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export class ListCustomersQuery {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({ maxLength: 100, description: 'Names, branch name/suburb, or ABN digits' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    enum: AustralianState,
    enumName: 'AustralianState',
    description: 'Customers with at least one active branch in this state',
  })
  @IsOptional()
  @IsIn(Object.values(AustralianState))
  state?: AustralianState;
}

export class CustomerListItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: 'tradingName, else legalName' }) displayName: string;
  @ApiProperty() legalName: string;
  @ApiProperty({ type: String, nullable: true }) tradingName: string | null;
  @ApiProperty({ type: String, nullable: true, description: '11 digits, no spaces' })
  abn: string | null;
  @ApiProperty() billingEmail: string;
  @ApiProperty({ type: String, nullable: true }) phone: string | null;
  @ApiProperty({ type: Number }) paymentTermsDays: number;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: Number }) activeBranchCount: number;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class CustomerDto extends CustomerListItemDto {
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deactivatedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: () => [BranchDto], description: 'Active first, then inactive' })
  branches: BranchDto[];
}

export class CustomerPageDto {
  @ApiProperty({ type: () => [CustomerListItemDto] }) items: CustomerListItemDto[];
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: Number }) totalItems: number;
  @ApiProperty({ type: Number, description: '0 when there are no items' }) totalPages: number;
}
