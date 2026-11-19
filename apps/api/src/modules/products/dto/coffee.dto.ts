import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CoffeeType } from '../../../generated/prisma/client';
import { trim, trimOrNull } from '../../../common/transforms';
import { ProductDto } from './product.dto';

export const STATUS_FILTERS = ['active', 'inactive', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export class CreateCoffeeDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString({ message: 'Coffee name is required' })
  @IsNotEmpty({ message: 'Coffee name is required' })
  @MaxLength(100, { message: 'Coffee name must be 100 characters or fewer' })
  name: string;

  @ApiProperty({ enum: CoffeeType, enumName: 'CoffeeType' })
  @IsEnum(CoffeeType, { message: 'Choose single origin or blend' })
  type: CoffeeType;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 100 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Origin must be 100 characters or fewer' })
  origin?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must be 1000 characters or fewer' })
  description?: string | null;
}

export class UpdateCoffeeDto extends PartialType(CreateCoffeeDto) {}

export class ListCoffeesQuery {
  @ApiPropertyOptional({ enum: STATUS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CoffeeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: CoffeeType, enumName: 'CoffeeType' }) type: CoffeeType;
  @ApiProperty({ type: String, nullable: true }) origin: string | null;
  @ApiProperty({ type: String, nullable: true }) description: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ type: Number }) activeProductCount: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deactivatedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class CoffeeDetailDto extends CoffeeDto {
  @ApiProperty({ type: () => [ProductDto], description: 'All its products, active first' })
  products: ProductDto[];
}

export class CoffeeListDto {
  @ApiProperty({ type: () => [CoffeeDto] }) items: CoffeeDto[];
}
