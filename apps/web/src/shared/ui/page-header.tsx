import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

type Crumb = { label: string; to: '/orders' | '/products' | '/coffees' | '/customers' };

/** Page title with an optional back link and action buttons. */
export function PageHeader({
  title,
  back,
  actions,
  badges,
}: {
  title: string;
  back?: Crumb;
  actions?: ReactNode;
  badges?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {back && (
        <nav aria-label="Breadcrumb" className="text-sm">
          <Link to={back.to} className="text-muted-foreground underline-offset-4 hover:underline">
            {back.label}
          </Link>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {badges}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
