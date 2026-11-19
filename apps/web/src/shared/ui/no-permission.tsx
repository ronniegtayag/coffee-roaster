import { Link } from '@tanstack/react-router';

export function NoPermission({
  backTo = '/customers',
}: {
  backTo?: '/customers' | '/orders' | '/products' | '/coffees';
}) {
  return (
    <div role="alert" className="py-12 text-center">
      <p className="font-medium">You don't have permission to do this</p>
      <Link to={backTo} className="text-sm underline underline-offset-4">
        Go back
      </Link>
    </div>
  );
}
