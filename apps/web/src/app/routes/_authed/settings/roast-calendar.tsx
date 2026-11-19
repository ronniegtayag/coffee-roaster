import { createFileRoute } from '@tanstack/react-router';
import { useCan } from '@/features/auth';
import { RoastCalendarSettings } from '@/features/orders';
import { NoPermission } from '@/shared/ui/no-permission';

export const Route = createFileRoute('/_authed/settings/roast-calendar')({
  component: Page,
});

function Page() {
  const allowed = useCan('settings:roast-calendar');
  return allowed ? <RoastCalendarSettings /> : <NoPermission backTo="/orders" />;
}
