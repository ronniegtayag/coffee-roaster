import { Injectable } from '@nestjs/common';

/** Injectable "now" so tests can fake the time (cut-offs depend on it). */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
