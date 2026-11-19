import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Permission, RequirePermission } from '../auth';
import type { AuthUser } from '../auth';
import {
  CopyOrderDto,
  CopyOrderResultDto,
  CreateOrderDto,
  DeleteOrderQuery,
  ListOrdersQuery,
  OrderDto,
  OrderPageDto,
  RoastSummaryDto,
  RoastSummaryQuery,
  ScheduleQuery,
  ScheduleSuggestionDto,
  UpdateOrderDto,
  VersionDto,
  VersionReasonDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermission(Permission.OrdersRead)
  @ApiOkResponse({ type: OrderPageDto })
  list(@Query() query: ListOrdersQuery, @CurrentUser() user: AuthUser): Promise<OrderPageDto> {
    return this.orders.list(query, user);
  }

  // Fixed paths must come before ':id'.
  @Get('schedule')
  @RequirePermission(Permission.OrdersRead)
  @ApiOperation({ summary: 'Suggested roast and delivery dates, from now or from a delivery date' })
  @ApiOkResponse({ type: ScheduleSuggestionDto })
  schedule(@Query() query: ScheduleQuery): Promise<ScheduleSuggestionDto> {
    return this.orders.schedule(query.deliveryDate);
  }

  @Get('roast-summary')
  @RequirePermission(Permission.OrdersRead)
  @ApiOperation({ summary: 'Weight to roast per coffee for a roast date (confirmed orders)' })
  @ApiOkResponse({ type: RoastSummaryDto })
  roastSummary(@Query() query: RoastSummaryQuery): Promise<RoastSummaryDto> {
    return this.orders.roastSummary(query.roastDate);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission(Permission.OrdersWrite)
  @ApiOperation({
    summary: 'Create an order (200 with the existing order if requestId was already used)',
  })
  @ApiCreatedResponse({ type: OrderDto })
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderDto> {
    const { order, created } = await this.orders.create(dto, user);
    if (!created) res.status(200);
    return order;
  }

  @Get(':id')
  @RequirePermission(Permission.OrdersRead)
  @ApiOkResponse({ type: OrderDto })
  get(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<OrderDto> {
    return this.orders.get(id, user);
  }

  @Patch(':id')
  @RequirePermission(Permission.OrdersWrite)
  @ApiOperation({ summary: 'Edit dates, notes or lines (lines are the full desired set)' })
  @ApiOkResponse({ type: OrderDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDto> {
    return this.orders.update(id, dto, user);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission(Permission.OrdersWrite)
  @ApiOperation({ summary: 'Delete a draft that was never confirmed' })
  @ApiNoContentResponse()
  remove(
    @Param('id') id: string,
    @Query() query: DeleteOrderQuery,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    return this.orders.remove(id, query.version, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersWrite)
  @ApiOkResponse({ type: OrderDto })
  confirm(@Param('id') id: string, @Body() dto: VersionDto, @CurrentUser() user: AuthUser) {
    return this.orders.confirm(id, dto, user);
  }

  @Post(':id/pack')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersFulfil)
  @ApiOkResponse({ type: OrderDto })
  pack(@Param('id') id: string, @Body() dto: VersionDto, @CurrentUser() user: AuthUser) {
    return this.orders.pack(id, dto, user);
  }

  @Post(':id/dispatch')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersFulfil)
  @ApiOkResponse({ type: OrderDto })
  dispatch(@Param('id') id: string, @Body() dto: VersionDto, @CurrentUser() user: AuthUser) {
    return this.orders.dispatch(id, dto, user);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersFulfil)
  @ApiOkResponse({ type: OrderDto })
  deliver(@Param('id') id: string, @Body() dto: VersionDto, @CurrentUser() user: AuthUser) {
    return this.orders.deliver(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersWrite)
  @ApiOkResponse({ type: OrderDto })
  cancel(@Param('id') id: string, @Body() dto: VersionReasonDto, @CurrentUser() user: AuthUser) {
    return this.orders.cancel(id, dto, user);
  }

  @Post(':id/revert')
  @HttpCode(200)
  @RequirePermission(Permission.OrdersLateChange)
  @ApiOkResponse({ type: OrderDto })
  revert(@Param('id') id: string, @Body() dto: VersionReasonDto, @CurrentUser() user: AuthUser) {
    return this.orders.revert(id, dto, user);
  }

  @Post(':id/copy')
  @HttpCode(201)
  @RequirePermission(Permission.OrdersWrite)
  @ApiOperation({
    summary: "Copy an order into a new draft at today's prices (200 on a repeat requestId)",
  })
  @ApiCreatedResponse({ type: CopyOrderResultDto })
  async copy(
    @Param('id') id: string,
    @Body() dto: CopyOrderDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CopyOrderResultDto> {
    const { result, created } = await this.orders.copy(id, dto, user);
    if (!created) res.status(200);
    return result;
  }
}
