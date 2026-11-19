import { hasPermission, Permission, permissionsForRole } from './permissions';

const sorted = (list: Permission[]) => [...list].sort();

describe('permissions matrix', () => {
  it('gives ADMIN every permission, including settings:roast-calendar', () => {
    expect(sorted(permissionsForRole('ADMIN'))).toEqual(sorted(Object.values(Permission)));
    expect(permissionsForRole('ADMIN')).toContain(Permission.SettingsRoastCalendar);
  });

  it('MANAGER is no longer all-permissions: everything except settings:roast-calendar', () => {
    const manager = permissionsForRole('MANAGER');
    expect(manager).not.toContain(Permission.SettingsRoastCalendar);
    expect(sorted(manager)).toEqual(
      sorted(Object.values(Permission).filter((p) => p !== Permission.SettingsRoastCalendar)),
    );
  });

  it('MANAGER keeps product, order, late-change, fulfil and short-supply rights', () => {
    const manager = permissionsForRole('MANAGER');
    for (const p of [
      Permission.ProductsWrite,
      Permission.OrdersWrite,
      Permission.OrdersLateChange,
      Permission.OrdersFulfil,
      Permission.OrdersShortSupply,
      Permission.CustomersWrite,
    ]) {
      expect(manager).toContain(p);
    }
  });

  it('STAFF can read, take and fulfil orders but not change late, short-supply or the catalogue', () => {
    expect(sorted(permissionsForRole('STAFF'))).toEqual(
      sorted([
        Permission.CustomersRead,
        Permission.BranchesUpdateContact,
        Permission.ProductsRead,
        Permission.OrdersRead,
        Permission.OrdersWrite,
        Permission.OrdersFulfil,
      ]),
    );
    const staff = permissionsForRole('STAFF');
    for (const p of [
      Permission.ProductsWrite,
      Permission.OrdersLateChange,
      Permission.OrdersShortSupply,
      Permission.SettingsRoastCalendar,
      Permission.CustomersWrite,
    ]) {
      expect(staff).not.toContain(p);
    }
  });

  it('does not let callers mutate the matrix', () => {
    permissionsForRole('STAFF').push(Permission.ProductsWrite);
    expect(permissionsForRole('STAFF')).not.toContain(Permission.ProductsWrite);
  });

  it('hasPermission checks membership', () => {
    const staff = { permissions: permissionsForRole('STAFF') };
    expect(hasPermission(staff, Permission.OrdersWrite)).toBe(true);
    expect(hasPermission(staff, Permission.OrdersLateChange)).toBe(false);
  });
});
