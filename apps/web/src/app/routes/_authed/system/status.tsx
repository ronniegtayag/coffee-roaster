import { createFileRoute } from '@tanstack/react-router';
import { SystemStatus } from '@/features/health';

export const Route = createFileRoute('/_authed/system/status')({
  component: SystemStatus,
});
