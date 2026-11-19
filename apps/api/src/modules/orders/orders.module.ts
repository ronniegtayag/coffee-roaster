import { Module } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { CustomersModule } from '../customers';
import { ProductsModule } from '../products';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RoastCalendarController } from './roast-calendar.controller';
import { RoastCalendarService } from './schedule/roast-calendar.service';

@Module({
  imports: [ProductsModule, CustomersModule],
  controllers: [OrdersController, RoastCalendarController],
  providers: [OrdersService, RoastCalendarService, Clock],
  exports: [OrdersService, RoastCalendarService],
})
export class OrdersModule {}
