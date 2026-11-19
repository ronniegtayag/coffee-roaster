import { formatMoney } from '../../common/money';
import type { Coffee, Grind, Product } from '../../generated/prisma/client';
import { CoffeeDto } from './dto/coffee.dto';
import { GrindDto } from './dto/grind.dto';
import { ProductDto } from './dto/product.dto';
import { productDisplayName } from './product-display-name';
import type { OrderableProduct } from './products.types';

export type ProductWithRelations = Product & { coffee: Coffee | null; grind: Grind | null };

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function isOrderable(p: ProductWithRelations): boolean {
  return p.isActive && (p.coffee?.isActive ?? true);
}

export function toProductDto(p: ProductWithRelations): ProductDto {
  return {
    id: p.id,
    sku: p.sku,
    kind: p.coffeeId ? 'COFFEE' : 'OTHER',
    displayName: productDisplayName(p),
    name: p.name,
    coffee: p.coffee
      ? { id: p.coffee.id, name: p.coffee.name, type: p.coffee.type, isActive: p.coffee.isActive }
      : null,
    bagSizeGrams: p.bagSizeGrams,
    grind: p.grind ? { id: p.grind.id, name: p.grind.name } : null,
    listPriceExGst: formatMoney(p.listPriceExGst),
    taxCode: p.taxCode,
    isActive: p.isActive,
    orderable: isOrderable(p),
    deactivatedAt: iso(p.deactivatedAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toOrderableProduct(p: ProductWithRelations): OrderableProduct {
  const reason = !p.isActive
    ? 'PRODUCT_INACTIVE'
    : p.coffee && !p.coffee.isActive
      ? 'COFFEE_INACTIVE'
      : null;
  return {
    id: p.id,
    sku: p.sku,
    displayName: productDisplayName(p),
    coffeeId: p.coffeeId,
    bagSizeGrams: p.bagSizeGrams,
    listPriceExGst: p.listPriceExGst,
    taxCode: p.taxCode,
    orderable: reason === null,
    unavailableReason: reason,
  };
}

export function toCoffeeDto(c: Coffee, activeProductCount: number): CoffeeDto {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    origin: c.origin,
    description: c.description,
    isActive: c.isActive,
    activeProductCount,
    deactivatedAt: iso(c.deactivatedAt),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export const toGrindDto = (g: Grind): GrindDto => ({
  id: g.id,
  name: g.name,
  sortOrder: g.sortOrder,
  isActive: g.isActive,
});
