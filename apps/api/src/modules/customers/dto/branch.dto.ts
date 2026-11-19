import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AustralianState } from '../../../generated/prisma/client';
import { trim, trimOrNull } from './transforms';

const required = (label: string, max: number) => ({
  string: { message: `${label} is required` },
  notEmpty: { message: `${label} is required` },
  max: { message: `${label} must be ${max} characters or fewer` },
});

const NAME = required('Branch name', 200);
const LINE1 = required('Address line 1', 200);
const SUBURB = required('Suburb', 100);

export class CreateBranchDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString(NAME.string)
  @IsNotEmpty(NAME.notEmpty)
  @MaxLength(200, NAME.max)
  name: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString(LINE1.string)
  @IsNotEmpty(LINE1.notEmpty)
  @MaxLength(200, LINE1.max)
  addressLine1: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Address line 2 must be 200 characters or fewer' })
  addressLine2?: string | null;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString(SUBURB.string)
  @IsNotEmpty(SUBURB.notEmpty)
  @MaxLength(100, SUBURB.max)
  suburb: string;

  @ApiProperty({ enum: AustralianState, enumName: 'AustralianState' })
  @IsEnum(AustralianState, { message: 'Choose a state or territory' })
  state: AustralianState;

  @ApiProperty({ example: '0800', description: 'Exactly 4 digits, kept as text' })
  @Transform(trim)
  @Matches(/^\d{4}$/, { message: 'Postcode must be 4 digits' })
  postcode: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Contact name must be 200 characters or fewer' })
  contactName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 30 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Contact phone must be 30 characters or fewer' })
  contactPhone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Delivery notes must be 2000 characters or fewer' })
  deliveryNotes?: string | null;
}

/** No customerId: a branch cannot move between customers (D-PO-5). Null name/address fields are rejected in the service. */
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class BranchDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) customerId: string;
  @ApiProperty() name: string;
  @ApiProperty() addressLine1: string;
  @ApiProperty({ type: String, nullable: true }) addressLine2: string | null;
  @ApiProperty() suburb: string;
  @ApiProperty({ enum: AustralianState, enumName: 'AustralianState' }) state: AustralianState;
  @ApiProperty({ example: '0800' }) postcode: string;
  @ApiProperty({ type: String, nullable: true }) contactName: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone: string | null;
  @ApiProperty({ type: String, nullable: true }) deliveryNotes: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deactivatedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}
