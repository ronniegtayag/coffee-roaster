import { createFileRoute } from '@tanstack/react-router';
import { SystemStatus } from '@/features/health';

export const Route = createFileRoute('/system/status')({
  component: SystemStatus,
});
