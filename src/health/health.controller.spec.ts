import { Test } from '@nestjs/testing';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const healthCheckService = { check: jest.fn() };
  const prismaHealth = { pingCheck: jest.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: PrismaHealthIndicator, useValue: prismaHealth },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('pings the database', async () => {
    healthCheckService.check.mockImplementation((checks: Array<() => unknown>) =>
      Promise.all(checks.map((c) => c())),
    );
    prismaHealth.pingCheck.mockResolvedValue({ database: { status: 'up' } });

    await expect(controller.check()).resolves.toEqual([{ database: { status: 'up' } }]);
    expect(prismaHealth.pingCheck).toHaveBeenCalledWith('database', expect.anything());
  });
});
