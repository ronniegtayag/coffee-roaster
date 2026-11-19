import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

describe('OrdersModule', () => {
  let controller: OrdersController;
  let service: OrdersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [OrdersService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(OrdersController);
    service = moduleRef.get(OrdersService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(OrdersController);
    expect(service).toBeInstanceOf(OrdersService);
  });
});
