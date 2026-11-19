import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../../generated/prisma/client';
import { Permission } from '../permissions';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role: UserRole;

  @ApiProperty({ enum: Permission, enumName: 'Permission', isArray: true })
  permissions: Permission[];
}

export class SessionDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ description: 'Seconds until accessToken expires', example: 900 })
  expiresIn: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'After this the user must log in again',
  })
  sessionExpiresAt: string;

  @ApiProperty({ type: UserDto })
  user: UserDto;
}
