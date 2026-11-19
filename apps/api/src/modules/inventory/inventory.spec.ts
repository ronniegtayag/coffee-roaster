import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

describe('InventoryModule', () => {
  let controller: InventoryController;
  let service: InventoryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [InventoryService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(InventoryController);
    service = moduleRef.get(InventoryService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(InventoryController);
    expect(service).toBeInstanceOf(InventoryService);
  });
});
