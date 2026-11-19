import {
  Activity,
  BarChart3,
  Boxes,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Screens not built yet are listed but disabled. */
  ready: boolean;
}

/** One entry per backend module, in the order staff use them. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, ready: true },
  { label: 'Customers', to: '/customers', icon: Users, ready: false },
  { label: 'Orders', to: '/orders', icon: ShoppingCart, ready: false },
  { label: 'Invoicing', to: '/invoicing', icon: ReceiptText, ready: false },
  { label: 'Inventory', to: '/inventory', icon: Boxes, ready: false },
  { label: 'Suppliers', to: '/suppliers', icon: Truck, ready: false },
  { label: 'Supplier invoices', to: '/supplier-invoices', icon: FileText, ready: false },
  { label: 'Reports', to: '/reports', icon: BarChart3, ready: false },
  { label: 'System status', to: '/system/status', icon: Activity, ready: true },
];
