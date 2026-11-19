import { http } from '@/shared/api/http';
import type { SessionDto } from '@/shared/api/session';

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(input: LoginInput): Promise<SessionDto> {
  // withCredentials so the browser accepts the refresh cookie when the API is on another origin.
  // X-Requested-With is the CSRF guard the API requires on every cookie-setting auth call.
  const { data } = await http.post<SessionDto>('/auth/login', input, {
    withCredentials: true,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  return data;
}
