import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicingController } from './invoicing.controller';
import { InvoicingService } from './invoicing.service';

describe('InvoicingModule', () => {
  let controller: InvoicingController;
  let service: InvoicingService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InvoicingController],
      providers: [InvoicingService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(InvoicingController);
    service = moduleRef.get(InvoicingService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(InvoicingController);
    expect(service).toBeInstanceOf(InvoicingService);
  });
});
