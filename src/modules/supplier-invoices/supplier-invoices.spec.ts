import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { SupplierInvoicesService } from './supplier-invoices.service';

describe('SupplierInvoicesModule', () => {
  let controller: SupplierInvoicesController;
  let service: SupplierInvoicesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SupplierInvoicesController],
      providers: [SupplierInvoicesService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(SupplierInvoicesController);
    service = moduleRef.get(SupplierInvoicesService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(SupplierInvoicesController);
    expect(service).toBeInstanceOf(SupplierInvoicesService);
  });
});
