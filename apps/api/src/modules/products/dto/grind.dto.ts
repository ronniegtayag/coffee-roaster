import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { trim } from '../../../common/transforms';

export class CreateGrindDto {
  @ApiProperty({ maxLength: 50 })
  @Transform(trim)
  @IsString({ message: 'Grind name is required' })
  @IsNotEmpty({ message: 'Grind name is required' })
  @MaxLength(50, { message: 'Grind name must be 50 characters or fewer' })
  name: string;

  @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1000 })
  @IsOptional()
  @IsInt({ message: 'Sort order must be a whole number' })
  @Min(0, { message: 'Sort order must be a whole number from 0 to 1000' })
  @Max(1000, { message: 'Sort order must be a whole number from 0 to 1000' })
  sortOrder?: number;
}

export class UpdateGrindDto extends PartialType(CreateGrindDto) {}

export class GrindDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: Number }) sortOrder: number;
  @ApiProperty() isActive: boolean;
}

export class GrindListDto {
  @ApiProperty({ type: () => [GrindDto] }) items: GrindDto[];
}
