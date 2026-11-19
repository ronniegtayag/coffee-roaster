import { Link } from '@tanstack/react-router';
import { Button } from '@/shared/ui/button';

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">This page doesn't exist, or it hasn't been built yet.</p>
      <Button asChild size="lg">
        <Link to="/">Back to overview</Link>
      </Button>
    </div>
  );
}
