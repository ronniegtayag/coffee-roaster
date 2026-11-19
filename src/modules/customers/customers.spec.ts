import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersModule', () => {
  let controller: CustomersController;
  let service: CustomersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [CustomersService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(CustomersController);
    service = moduleRef.get(CustomersService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(CustomersController);
    expect(service).toBeInstanceOf(CustomersService);
  });
});
