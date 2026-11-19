import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, RequirePermission } from '../auth';
import {
  ClosureDayDto,
  ClosureListDto,
  CreateClosureDto,
  ListClosuresQuery,
  RoastCalendarDto,
  RoastCalendarInput,
} from './dto/roast-calendar.dto';
import { RoastCalendarService } from './schedule/roast-calendar.service';

@ApiTags('roast-calendar')
@ApiBearerAuth()
@Controller('roast-calendar')
export class RoastCalendarController {
  constructor(private readonly calendar: RoastCalendarService) {}

  @Get()
  @RequirePermission(Permission.OrdersRead)
  @ApiOkResponse({ type: RoastCalendarDto })
  get(): Promise<RoastCalendarDto> {
    return this.calendar.getSettings();
  }

  @Put()
  @RequirePermission(Permission.SettingsRoastCalendar)
  @ApiOkResponse({ type: RoastCalendarDto })
  update(@Body() dto: RoastCalendarInput): Promise<RoastCalendarDto> {
    return this.calendar.updateSettings(dto);
  }

  @Get('closures')
  @RequirePermission(Permission.OrdersRead)
  @ApiOkResponse({ type: ClosureListDto })
  closures(@Query() query: ListClosuresQuery): Promise<ClosureListDto> {
    return this.calendar.listClosures(query.from, query.to);
  }

  @Post('closures')
  @RequirePermission(Permission.SettingsRoastCalendar)
  @ApiCreatedResponse({ type: ClosureDayDto })
  addClosure(@Body() dto: CreateClosureDto): Promise<ClosureDayDto> {
    return this.calendar.addClosure(dto.date, dto.description);
  }

  @Delete('closures/:id')
  @HttpCode(204)
  @RequirePermission(Permission.SettingsRoastCalendar)
  @ApiNoContentResponse()
  removeClosure(@Param('id') id: string): Promise<void> {
    return this.calendar.removeClosure(id);
  }
}
