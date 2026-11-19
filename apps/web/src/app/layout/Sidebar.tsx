import { Link } from '@tanstack/react-router';
import { Coffee } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { NAV_ITEMS } from './nav';

const itemClass =
  'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 bg-sidebar p-3">
      <div className="mb-4 flex h-10 items-center gap-2 px-3 font-semibold">
        <Coffee className="size-5" aria-hidden />
        Coffee Roaster CRM
      </div>
      {NAV_ITEMS.map(({ label, to, icon: Icon, ready }) =>
        ready ? (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            activeOptions={{ exact: to === '/' }}
            className={cn(itemClass, 'hover:bg-sidebar-accent')}
            activeProps={{ className: 'bg-sidebar-accent text-sidebar-accent-foreground' }}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ) : (
          <span key={to} aria-disabled="true" className={cn(itemClass, 'opacity-50')}>
            <Icon className="size-4" aria-hidden />
            {label}
            <Badge variant="outline" className="ml-auto">
              Soon
            </Badge>
          </span>
        ),
      )}
    </nav>
  );
}
