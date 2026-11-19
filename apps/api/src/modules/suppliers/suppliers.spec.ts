import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

describe('SuppliersModule', () => {
  let controller: SuppliersController;
  let service: SuppliersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [SuppliersService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(SuppliersController);
    service = moduleRef.get(SuppliersService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(SuppliersController);
    expect(service).toBeInstanceOf(SuppliersService);
  });
});
