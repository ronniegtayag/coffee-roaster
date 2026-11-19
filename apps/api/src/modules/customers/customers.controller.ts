import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Permission, RequirePermission } from '../auth';
import type { AuthUser } from '../auth';
import { CustomersService } from './customers.service';
import { BranchDto, CreateBranchDto } from './dto/branch.dto';
import {
  CreateCustomerDto,
  CustomerDto,
  CustomerPageDto,
  ListCustomersQuery,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequirePermission(Permission.CustomersRead)
  @ApiOperation({ summary: 'List customers (paginated, searchable)' })
  @ApiOkResponse({ type: CustomerPageDto })
  list(@Query() query: ListCustomersQuery): Promise<CustomerPageDto> {
    return this.customersService.list(query);
  }

  @Post()
  @RequirePermission(Permission.CustomersWrite)
  @ApiOperation({ summary: 'Create a customer (paymentTermsDays also needs customers:edit-terms)' })
  @ApiCreatedResponse({ type: CustomerDto })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() user: AuthUser): Promise<CustomerDto> {
    return this.customersService.create(dto, user);
  }

  @Get(':id')
  @RequirePermission(Permission.CustomersRead)
  @ApiOkResponse({ type: CustomerDto })
  get(@Param('id') id: string): Promise<CustomerDto> {
    return this.customersService.get(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.CustomersWrite)
  @ApiOperation({ summary: 'Edit a customer (paymentTermsDays also needs customers:edit-terms)' })
  @ApiOkResponse({ type: CustomerDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ): Promise<CustomerDto> {
    return this.customersService.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(Permission.CustomersDeactivate)
  @ApiOkResponse({ type: CustomerDto })
  deactivate(@Param('id') id: string): Promise<CustomerDto> {
    return this.customersService.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission(Permission.CustomersDeactivate)
  @ApiOkResponse({ type: CustomerDto })
  reactivate(@Param('id') id: string): Promise<CustomerDto> {
    return this.customersService.reactivate(id);
  }

  @Post(':id/branches')
  @RequirePermission(Permission.BranchesWrite)
  @ApiCreatedResponse({ type: BranchDto })
  createBranch(@Param('id') id: string, @Body() dto: CreateBranchDto): Promise<BranchDto> {
    return this.customersService.createBranch(id, dto);
  }
}
