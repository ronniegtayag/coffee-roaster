import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController, BranchesController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
