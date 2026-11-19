import { rootHttp } from '@/shared/api/http';

type IndicatorStatus = 'up' | 'down';

/** Response of GET /health (NestJS Terminus). */
export interface HealthResponse {
  status: 'ok' | 'error' | 'shutting_down';
  info?: Record<string, { status: IndicatorStatus; message?: string }>;
  error?: Record<string, { status: IndicatorStatus; message?: string }>;
  details: Record<string, { status: IndicatorStatus; message?: string }>;
}

export async function getHealth(): Promise<HealthResponse> {
  // Terminus answers 503 with the same body when a check fails; we want that body, not an error.
  const { data } = await rootHttp.get<HealthResponse>('/health', {
    validateStatus: (status) => status === 200 || status === 503,
  });
  return data;
}
