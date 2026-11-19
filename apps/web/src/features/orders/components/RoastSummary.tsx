import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { formatBusinessDateLong, todayInSydney } from '@/shared/lib/dates';
import { formatKg } from '@/shared/lib/weight';
import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { roastSummaryQuery } from '../queries';

export function RoastSummary({ roastDate }: { roastDate: string | undefined }) {
  const navigate = useNavigate({ from: '/orders/roast-summary' });
  const date = roastDate ?? todayInSydney();
  const query = useQuery(roastSummaryQuery(date));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Roast summary" back={{ label: 'Orders', to: '/orders' }} />
      <Field id="summary-date" label="Roast date" className="w-48">
        <Input
          className="h-10"
          type="date"
          value={date}
          onChange={(e) => void navigate({ search: { roastDate: e.target.value || undefined } })}
        />
      </Field>
      <p className="text-sm text-muted-foreground">
        Kilograms to roast for {formatBusinessDateLong(date)}, from confirmed orders only.
      </p>
      <QueryView
        query={query}
        loadingLabel="Loading roast summary"
        notFound={<p>Nothing found.</p>}
      >
        {(summary) =>
          summary.coffees.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center">
              <p className="font-medium">No confirmed orders for this roast date</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coffee</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.coffees.map((coffee) => (
                    <TableRow key={coffee.coffeeId}>
                      <TableCell>{coffee.coffeeName}</TableCell>
                      <TableCell className="text-right">{coffee.orderCount}</TableCell>
                      <TableCell className="text-right">
                        {formatKg(coffee.totalWeightGrams)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-medium">
                      {formatKg(summary.totalWeightGrams)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )
        }
      </QueryView>
    </div>
  );
}
