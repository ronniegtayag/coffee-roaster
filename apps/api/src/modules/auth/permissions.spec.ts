import { hasPermission, Permission, permissionsForRole } from './permissions';

describe('permissions matrix', () => {
  it('gives ADMIN and MANAGER every permission', () => {
    const all = Object.values(Permission).sort();
    expect([...permissionsForRole('ADMIN')].sort()).toEqual(all);
    expect([...permissionsForRole('MANAGER')].sort()).toEqual(all);
  });

  it('limits STAFF to reading customers and updating branch contact details', () => {
    expect([...permissionsForRole('STAFF')].sort()).toEqual(
      [Permission.CustomersRead, Permission.BranchesUpdateContact].sort(),
    );
  });

  it('does not let callers mutate the matrix', () => {
    permissionsForRole('STAFF').push(Permission.CustomersWrite);
    expect(permissionsForRole('STAFF')).not.toContain(Permission.CustomersWrite);
  });

  it('hasPermission checks membership', () => {
    const staff = { permissions: permissionsForRole('STAFF') };
    expect(hasPermission(staff, Permission.CustomersRead)).toBe(true);
    expect(hasPermission(staff, Permission.CustomersEditTerms)).toBe(false);
  });
});
