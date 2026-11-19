import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { apiError } from '../../../common/api-error';
import {
  dateToString,
  SydneyNow,
  stringToDate,
  toBusinessNow,
} from '../../../common/business-date';
import { Clock } from '../../../common/clock';
import type { Env } from '../../../config/env';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  ClosureDayDto,
  RoastCalendarDto,
  RoastCalendarInput,
} from '../dto/roast-calendar.dto';
import { CalendarContext } from './calendar-context';

const CACHE_MS = 60_000;

export interface CalendarView {
  ctx: CalendarContext;
  now: SydneyNow;
}

@Injectable()
export class RoastCalendarService {
  private cache: { ctx: CalendarContext; loadedAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sydney wall-clock "now" from the injectable clock. */
  now(): SydneyNow {
    return toBusinessNow(this.clock.now(), this.config.get('APP_TIMEZONE', { infer: true }));
  }

  async view(): Promise<CalendarView> {
    return { ctx: await this.context(), now: this.now() };
  }

  /** Settings and closures are cached for at most 60 s; changes through the API clear it. */
  async context(): Promise<CalendarContext> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_MS) return this.cache.ctx;
    const [settings, closures] = await Promise.all([
      this.prisma.roastCalendarSettings.findUniqueOrThrow({ where: { id: 1 } }),
      this.prisma.closureDay.findMany({ select: { date: true } }),
    ]);
    const ctx = new CalendarContext(settings, new Set(closures.map((c) => dateToString(c.date))));
    this.cache = { ctx, loadedAt: Date.now() };
    return ctx;
  }

  invalidate(): void {
    this.cache = null;
  }

  /** Suggestion for the schedule endpoint and order forms; 409 if nothing fits within a year. */
  async suggest(deliveryDate?: string) {
    const { ctx, now } = await this.view();
    if (deliveryDate && deliveryDate < now.date) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', {
        fieldErrors: [
          {
            field: 'deliveryDate',
            code: 'pastDate',
            message: "Delivery date can't be in the past",
          },
        ],
      });
    }
    const suggestion = deliveryDate
      ? ctx.suggestFromDelivery(deliveryDate, now.dateTime, now.date)
      : ctx.suggestFromNow(now.date, now.dateTime);
    if (!suggestion) {
      throw apiError(409, 'NO_SCHEDULE_AVAILABLE', 'No roast and delivery day is available');
    }
    return suggestion;
  }

  // ── Settings and closures (admin) ────────────────────────────────────────

  async getSettings(): Promise<RoastCalendarDto> {
    const s = (await this.context()).settings;
    return { ...s, updatedAt: s.updatedAt.toISOString() };
  }

  async updateSettings(input: RoastCalendarInput): Promise<RoastCalendarDto> {
    const saved = await this.prisma.roastCalendarSettings.update({ where: { id: 1 }, data: input });
    this.invalidate();
    return { ...saved, updatedAt: saved.updatedAt.toISOString() };
  }

  async listClosures(from?: string, to?: string): Promise<{ items: ClosureDayDto[] }> {
    const start = from ?? this.now().date;
    const rows = await this.prisma.closureDay.findMany({
      where: { date: { gte: stringToDate(start), ...(to ? { lte: stringToDate(to) } : {}) } },
      orderBy: { date: 'asc' },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        date: dateToString(r.date),
        description: r.description,
      })),
    };
  }

  async addClosure(date: string, description: string): Promise<ClosureDayDto> {
    try {
      const row = await this.prisma.closureDay.create({
        data: { date: stringToDate(date), description },
      });
      this.invalidate();
      return { id: row.id, date, description: row.description };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const message = `A closure is already set for ${date}`;
        throw apiError(409, 'CLOSURE_EXISTS', message, {
          fieldErrors: [{ field: 'date', code: 'closureExists', message }],
        });
      }
      throw err;
    }
  }

  async removeClosure(id: string): Promise<void> {
    const result = isUUID(id)
      ? await this.prisma.closureDay.deleteMany({ where: { id } })
      : { count: 0 };
    if (result.count === 0) throw apiError(404, 'CLOSURE_NOT_FOUND', 'Closure day not found');
    this.invalidate();
  }
}
