import { createFileRoute } from '@tanstack/react-router';
import { RoastSummary } from '@/features/orders';
import { isBusinessDateString } from '@/shared/lib/dates';

export const Route = createFileRoute('/_authed/orders/roast-summary')({
  validateSearch: (search: Record<string, unknown>): { roastDate?: string } => ({
    roastDate: isBusinessDateString(search.roastDate) ? search.roastDate : undefined,
  }),
  component: Page,
});

function Page() {
  return <RoastSummary roastDate={Route.useSearch().roastDate} />;
}
