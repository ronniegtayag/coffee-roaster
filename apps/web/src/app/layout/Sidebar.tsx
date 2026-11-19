import { Link, useNavigate } from '@tanstack/react-router';
import { Coffee, LogOut } from 'lucide-react';
import { logoutSession } from '@/shared/api/session';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { NAV_ITEMS } from './nav';

const ROLE_LABELS = { ADMIN: 'Admin', MANAGER: 'Manager', STAFF: 'Staff' } as const;

const itemClass =
  'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  async function logout() {
    await logoutSession();
    onNavigate?.();
    await navigate({ to: '/login', search: {}, replace: true });
  }

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 bg-sidebar p-3">
      <div className="mb-4 flex h-10 items-center gap-2 px-3 font-semibold">
        <Coffee className="size-5" aria-hidden />
        Coffee Roaster CRM
      </div>
      {NAV_ITEMS.filter(
        ({ permission }) => !permission || user?.permissions.includes(permission),
      ).map(({ label, to, icon: Icon, ready }) =>
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
      {user && (
        <div className="mt-auto flex flex-col gap-2 border-t px-3 pt-3">
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button variant="outline" size="lg" onClick={() => void logout()}>
            <LogOut aria-hidden />
            Log out
          </Button>
        </div>
      )}
    </nav>
  );
}
