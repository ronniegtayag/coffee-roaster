import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CoffeeType, TaxCode } from '../../../generated/prisma/client';
import { IsPrice } from '../../../common/validators';
import { trim } from '../../../common/transforms';

const upperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const SKU_MESSAGE =
  'SKU must be 1 to 40 letters, digits or hyphens, starting with a letter or digit';
const BAG_MESSAGE = 'Bag size must be a whole number of grams above 0';

export class CreateProductDto {
  @ApiProperty({ maxLength: 40, example: 'HE-1KG-WB', description: 'Stored upper-case' })
  @Transform(upperTrim)
  @IsString({ message: SKU_MESSAGE })
  @MaxLength(40, { message: SKU_MESSAGE })
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, { message: SKU_MESSAGE })
  sku: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Coffee products: with bagSizeGrams and grindId, no name',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'Choose a coffee' })
  coffeeId?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100000 })
  @IsOptional()
  @IsInt({ message: BAG_MESSAGE })
  @Min(1, { message: BAG_MESSAGE })
  @Max(100000, { message: BAG_MESSAGE })
  bagSizeGrams?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(undefined, { message: 'Choose a grind' })
  grindId?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Non-coffee products only' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(200, { message: 'Product name must be 200 characters or fewer' })
  name?: string;

  @ApiProperty({
    type: String,
    example: '34.00',
    description: 'Ex-GST per unit, more than 0 up to 9999.99',
  })
  @IsPrice()
  listPriceExGst: string;

  @ApiProperty({ enum: TaxCode, enumName: 'TaxCode' })
  @IsEnum(TaxCode, { message: 'Choose GST or GST-free' })
  taxCode: TaxCode;
}

/** coffeeId, bagSizeGrams and grindId never change after creation, so they are not accepted. */
export class UpdateProductDto {
  @ApiPropertyOptional({ maxLength: 40 })
  @Transform(upperTrim)
  @IsOptional()
  @IsString({ message: SKU_MESSAGE })
  @MaxLength(40, { message: SKU_MESSAGE })
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, { message: SKU_MESSAGE })
  sku?: string;

  @ApiPropertyOptional({ maxLength: 200, description: 'Non-coffee products only' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  @MaxLength(200, { message: 'Product name must be 200 characters or fewer' })
  name?: string;

  @ApiPropertyOptional({ type: String, example: '34.00' })
  @IsOptional()
  @IsPrice()
  listPriceExGst?: string;

  @ApiPropertyOptional({ enum: TaxCode, enumName: 'TaxCode' })
  @IsOptional()
  @IsEnum(TaxCode, { message: 'Choose GST or GST-free' })
  taxCode?: TaxCode;
}

export const PRODUCT_KINDS = ['coffee', 'other'] as const;

export class ListProductsQuery {
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

  @ApiPropertyOptional({ maxLength: 100, description: 'Coffee name, product name or SKU' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  coffeeId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_KINDS })
  @IsOptional()
  @IsIn(PRODUCT_KINDS)
  kind?: 'coffee' | 'other';
}

export class ProductCoffeeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: CoffeeType, enumName: 'CoffeeType' }) type: CoffeeType;
  @ApiProperty() isActive: boolean;
}

export class ProductGrindDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() sku: string;
  @ApiProperty({ enum: ['COFFEE', 'OTHER'] }) kind: 'COFFEE' | 'OTHER';
  @ApiProperty({
    description: 'e.g. "House Espresso — 1 kg — Whole bean"; the web never builds it',
  })
  displayName: string;
  @ApiProperty({ type: String, nullable: true }) name: string | null;
  @ApiProperty({ type: () => ProductCoffeeDto, nullable: true }) coffee: ProductCoffeeDto | null;
  @ApiProperty({ type: Number, nullable: true }) bagSizeGrams: number | null;
  @ApiProperty({ type: () => ProductGrindDto, nullable: true }) grind: ProductGrindDto | null;
  @ApiProperty({ type: String, example: '34.00' }) listPriceExGst: string;
  @ApiProperty({ enum: TaxCode, enumName: 'TaxCode' }) taxCode: TaxCode;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: 'isActive and its coffee (if any) is active' }) orderable: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deactivatedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class ProductPageDto {
  @ApiProperty({ type: () => [ProductDto] }) items: ProductDto[];
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: Number }) totalItems: number;
  @ApiProperty({ type: Number }) totalPages: number;
}

export class ProductListDto {
  @ApiProperty({ type: () => [ProductDto] }) items: ProductDto[];
}
