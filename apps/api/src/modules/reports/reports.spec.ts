import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsModule', () => {
  let controller: ReportsController;
  let service: ReportsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [ReportsService, { provide: PrismaService, useValue: {} }],
    }).compile();

    controller = moduleRef.get(ReportsController);
    service = moduleRef.get(ReportsService);
  });

  it('wires the controller and service', () => {
    expect(controller).toBeInstanceOf(ReportsController);
    expect(service).toBeInstanceOf(ReportsService);
  });
});
