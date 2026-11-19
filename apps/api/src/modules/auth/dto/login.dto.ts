import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@roaster.example', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'Email is required' })
  @MinLength(1, { message: 'Email is required' })
  @MaxLength(254, { message: 'Email is too long' })
  email: string;

  @ApiProperty({ minLength: 1, maxLength: 256 })
  @IsString({ message: 'Password is required' })
  @MinLength(1, { message: 'Password is required' })
  @MaxLength(256, { message: 'Password is too long' })
  password: string;
}
