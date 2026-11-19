import { Link } from '@tanstack/react-router';
import { Button } from '@/shared/ui/button';

export function CustomerNotFound({ what = 'Customer' }: { what?: 'Customer' | 'Branch' }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{what} not found</h1>
      <p className="text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Button asChild size="lg">
        <Link to="/customers">Back to customers</Link>
      </Button>
    </div>
  );
}
