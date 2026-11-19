import { Module } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { CoffeesController, GrindsController, ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [CoffeesController, GrindsController, ProductsController],
  providers: [ProductsService, Clock],
  exports: [ProductsService],
})
export class ProductsModule {}
