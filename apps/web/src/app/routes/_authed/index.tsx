import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/')({
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="text-muted-foreground">
        Screens appear in the sidebar as each module is built.
      </p>
    </div>
  );
}
