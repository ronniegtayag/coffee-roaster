import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { CustomersModule } from './modules/customers';
import { InventoryModule } from './modules/inventory';
import { OrdersModule } from './modules/orders';
import { SupplierInvoicesModule } from './modules/supplier-invoices';
import { SuppliersModule } from './modules/suppliers';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    CustomersModule,
    OrdersModule,
    InventoryModule,
    SuppliersModule,
    SupplierInvoicesModule,
  ],
})
export class AppModule {}
