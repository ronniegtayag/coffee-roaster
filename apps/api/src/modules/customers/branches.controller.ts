import { Body, Controller, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Permission, RequirePermission } from '../auth';
import type { AuthUser } from '../auth';
import { CustomersService } from './customers.service';
import { BranchDto, UpdateBranchDto } from './dto/branch.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly customersService: CustomersService) {}

  @Patch(':id')
  @RequirePermission(Permission.BranchesUpdateContact)
  @ApiOperation({
    summary:
      'Edit a branch (fields other than contact and delivery notes also need branches:write)',
  })
  @ApiOkResponse({ type: BranchDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentUser() user: AuthUser,
  ): Promise<BranchDto> {
    return this.customersService.updateBranch(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(Permission.BranchesDeactivate)
  @ApiOkResponse({ type: BranchDto })
  deactivate(@Param('id') id: string): Promise<BranchDto> {
    return this.customersService.deactivateBranch(id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission(Permission.BranchesDeactivate)
  @ApiOkResponse({ type: BranchDto })
  reactivate(@Param('id') id: string): Promise<BranchDto> {
    return this.customersService.reactivateBranch(id);
  }
}
