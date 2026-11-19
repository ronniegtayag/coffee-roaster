import { Permission } from '../auth';
import { permissionsForRole } from '../auth/permissions';
import type { OrderStatus, UserRole } from '../../generated/prisma/client';
import { computeAllowedActions } from './orders.rules';

const STATUSES: OrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
];
const user = (role: UserRole) => ({ permissions: permissionsForRole(role) });
const actions = (
  status: OrderStatus,
  role: UserRole,
  pastCutoff: boolean,
  confirmedAt: Date | null = status === 'DRAFT' ? null : new Date(),
) => computeAllowedActions({ status, pastCutoff, confirmedAt }, user(role));

describe('computeAllowedActions (role x status x cut-off, design §4 and §6.3)', () => {
  // Expected true flags per [role, status, pastCutoff]; everything else must be false.
  type Flag = keyof ReturnType<typeof actions>;
  const T = (...f: Flag[]) => f;

  const table: [UserRole, OrderStatus, boolean, Flag[], 'full' | 'reduceOnly' | 'none'][] = [
    // STAFF
    [
      'STAFF',
      'DRAFT',
      false,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'confirm', 'cancel', 'delete', 'copy'),
      'full',
    ],
    [
      'STAFF',
      'DRAFT',
      true,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'confirm', 'cancel', 'delete', 'copy'),
      'full',
    ],
    [
      'STAFF',
      'CONFIRMED',
      false,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'pack', 'cancel', 'copy'),
      'full',
    ],
    ['STAFF', 'CONFIRMED', true, T('editNotes', 'pack', 'copy'), 'none'],
    ['STAFF', 'PACKED', false, T('editNotes', 'dispatch', 'deliver', 'copy'), 'none'],
    ['STAFF', 'DISPATCHED', false, T('editNotes', 'deliver', 'copy'), 'none'],
    ['STAFF', 'DELIVERED', false, T('editNotes', 'copy'), 'none'],
    ['STAFF', 'CANCELLED', false, T('editNotes', 'copy'), 'none'],
    // MANAGER
    [
      'MANAGER',
      'DRAFT',
      false,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'confirm', 'cancel', 'delete', 'copy'),
      'full',
    ],
    [
      'MANAGER',
      'CONFIRMED',
      false,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'pack', 'cancel', 'revert', 'copy'),
      'full',
    ],
    [
      'MANAGER',
      'CONFIRMED',
      true,
      T('editRoastDate', 'editDeliveryDate', 'editNotes', 'pack', 'cancel', 'revert', 'copy'),
      'full',
    ],
    [
      'MANAGER',
      'PACKED',
      false,
      T('editDeliveryDate', 'editNotes', 'dispatch', 'deliver', 'cancel', 'revert', 'copy'),
      'reduceOnly',
    ],
    [
      'MANAGER',
      'DISPATCHED',
      false,
      T('editDeliveryDate', 'editNotes', 'deliver', 'cancel', 'revert', 'copy'),
      'reduceOnly',
    ],
    ['MANAGER', 'DELIVERED', false, T('editNotes', 'copy'), 'none'],
    ['MANAGER', 'CANCELLED', false, T('editNotes', 'copy'), 'none'],
  ];

  const flags: Flag[] = [
    'editRoastDate',
    'editDeliveryDate',
    'editNotes',
    'confirm',
    'pack',
    'dispatch',
    'deliver',
    'cancel',
    'revert',
    'delete',
    'copy',
  ];

  it.each(table)('%s, %s, pastCutoff=%s', (role, status, pastCutoff, allowed, editLines) => {
    const a = actions(status, role, pastCutoff);
    expect(a.editLines).toBe(editLines);
    for (const f of flags) expect([f, a[f]]).toEqual([f, allowed.includes(f)]);
  });

  it('ADMIN behaves like MANAGER for orders', () => {
    for (const status of STATUSES) {
      for (const past of [false, true]) {
        expect(actions(status, 'ADMIN', past)).toEqual(actions(status, 'MANAGER', past));
      }
    }
  });

  it('delete is offered only for a never-confirmed draft', () => {
    expect(actions('DRAFT', 'STAFF', false, null).delete).toBe(true);
    expect(actions('DRAFT', 'STAFF', false, new Date()).delete).toBe(false);
  });

  it('a user with no permissions can do nothing', () => {
    const a = computeAllowedActions(
      { status: 'DRAFT', pastCutoff: false, confirmedAt: null },
      { permissions: [] },
    );
    expect(a.editLines).toBe('none');
    for (const f of flags) expect(a[f]).toBe(false);
  });

  it('short-supply (reduceOnly) needs the orders:short-supply permission, not just late-change', () => {
    const lateOnly = {
      permissions: [Permission.OrdersRead, Permission.OrdersLateChange, Permission.OrdersWrite],
    };
    expect(
      computeAllowedActions(
        { status: 'PACKED', pastCutoff: false, confirmedAt: new Date() },
        lateOnly,
      ).editLines,
    ).toBe('none');
  });
});
