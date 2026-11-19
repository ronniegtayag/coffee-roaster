import { Link } from '@tanstack/react-router';
import { Button } from './button';

/** A 404 for one record, with a way back to its list. */
export function NotFoundView({
  title,
  backTo,
  backLabel,
}: {
  title: string;
  backTo: '/orders' | '/products' | '/coffees';
  backLabel: string;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Button asChild size="lg">
        <Link to={backTo}>{backLabel}</Link>
      </Button>
    </div>
  );
}
