import { Link } from '@tanstack/react-router';
import { useCan } from '@/features/auth';
import { BranchForm } from './BranchForm';
import { CustomerDetail } from './CustomerDetail';
import { CustomerForm } from './CustomerForm';
import { CustomerQuery } from './CustomerQuery';
import { CustomerNotFound } from './CustomerNotFound';

function PageShell({
  title,
  back,
  children,
}: {
  title: string;
  back?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      {back}
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

function NoPermission() {
  return (
    <div role="alert" className="py-12 text-center">
      <p className="font-medium">You don't have permission to do this</p>
      <Link to="/customers" className="text-sm underline underline-offset-4">
        Back to customers
      </Link>
    </div>
  );
}

function BackLink({ customerId, label }: { customerId?: string; label: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      {customerId ? (
        <Link
          to="/customers/$customerId"
          params={{ customerId }}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          {label}
        </Link>
      ) : (
        <Link to="/customers" className="text-muted-foreground underline-offset-4 hover:underline">
          {label}
        </Link>
      )}
    </nav>
  );
}

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  return (
    <CustomerQuery customerId={customerId}>{(c) => <CustomerDetail customer={c} />}</CustomerQuery>
  );
}

export function NewCustomerPage() {
  const canWrite = useCan('customers:write');
  if (!canWrite) return <NoPermission />;
  return (
    <PageShell title="Create customer" back={<BackLink label="Customers" />}>
      <CustomerForm />
    </PageShell>
  );
}

export function EditCustomerPage({ customerId }: { customerId: string }) {
  const canWrite = useCan('customers:write');
  if (!canWrite) return <NoPermission />;
  return (
    <CustomerQuery customerId={customerId}>
      {(customer) => (
        <PageShell
          title={`Edit ${customer.displayName}`}
          back={<BackLink customerId={customer.id} label={customer.displayName} />}
        >
          <CustomerForm customer={customer} />
        </PageShell>
      )}
    </CustomerQuery>
  );
}

export function NewBranchPage({ customerId }: { customerId: string }) {
  const canWrite = useCan('branches:write');
  if (!canWrite) return <NoPermission />;
  return (
    <CustomerQuery customerId={customerId}>
      {(customer) => (
        <PageShell
          title={`Add branch to ${customer.displayName}`}
          back={<BackLink customerId={customer.id} label={customer.displayName} />}
        >
          <BranchForm customer={customer} />
        </PageShell>
      )}
    </CustomerQuery>
  );
}

export function EditBranchPage({ customerId, branchId }: { customerId: string; branchId: string }) {
  const canWriteBranch = useCan('branches:write');
  const canEditContact = useCan('branches:update-contact');
  const canEdit = canWriteBranch || canEditContact;
  if (!canEdit) return <NoPermission />;
  return (
    <CustomerQuery customerId={customerId}>
      {(customer) => {
        const branch = customer.branches.find((b) => b.id === branchId);
        if (!branch) return <CustomerNotFound what="Branch" />;
        return (
          <PageShell
            title={`Edit ${branch.name}`}
            back={<BackLink customerId={customer.id} label={customer.displayName} />}
          >
            <BranchForm customer={customer} branch={branch} />
          </PageShell>
        );
      }}
    </CustomerQuery>
  );
}
