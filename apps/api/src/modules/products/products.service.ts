import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Clock } from '../../common/clock';
import { apiError } from '../../common/api-error';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CoffeeDetailDto,
  CoffeeDto,
  CoffeeListDto,
  CreateCoffeeDto,
  ListCoffeesQuery,
  UpdateCoffeeDto,
} from './dto/coffee.dto';
import { CreateGrindDto, GrindDto, GrindListDto, UpdateGrindDto } from './dto/grind.dto';
import {
  CreateProductDto,
  ListProductsQuery,
  ProductDto,
  ProductListDto,
  ProductPageDto,
  UpdateProductDto,
} from './dto/product.dto';
import { productDisplayName } from './product-display-name';
import {
  ProductWithRelations,
  toCoffeeDto,
  toGrindDto,
  toOrderableProduct,
  toProductDto,
} from './products.mapper';
import type { OrderableProduct } from './products.types';

const DEFAULT_PAGE_SIZE = 25;
const WITH_RELATIONS = { coffee: true, grind: true } as const;
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (c) => `\\${c}`);

const sortProducts = (a: ProductWithRelations, b: ProductWithRelations): number =>
  Number(b.isActive) - Number(a.isActive) ||
  (a.name ?? a.coffee?.name ?? '')
    .toLowerCase()
    .localeCompare((b.name ?? b.coffee?.name ?? '').toLowerCase()) ||
  (a.bagSizeGrams ?? 0) - (b.bagSizeGrams ?? 0) ||
  (a.grind?.sortOrder ?? 0) - (b.grind?.sortOrder ?? 0);

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  // ── Public (cross-module) ────────────────────────────────────────────────

  /** Products for order lines, keyed by id. Missing ids are absent from the map. */
  async findForOrderLines(ids: string[]): Promise<Map<string, OrderableProduct>> {
    const valid = ids.filter((id) => isUUID(id));
    const products = valid.length
      ? await this.prisma.product.findMany({
          where: { id: { in: valid } },
          include: WITH_RELATIONS,
        })
      : [];
    return new Map(products.map((p) => [p.id, toOrderableProduct(p)]));
  }

  // ── Coffees ──────────────────────────────────────────────────────────────

  async listCoffees(query: ListCoffeesQuery): Promise<CoffeeListDto> {
    const status = query.status ?? 'active';
    const coffees = await this.prisma.coffee.findMany({
      where: {
        ...(status === 'all' ? {} : { isActive: status === 'active' }),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    coffees.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    return { items: coffees.map(({ _count, ...c }) => toCoffeeDto(c, _count.products)) };
  }

  async getCoffee(id: string): Promise<CoffeeDetailDto> {
    const coffee = isUUID(id)
      ? await this.prisma.coffee.findUnique({
          where: { id },
          include: { products: { include: WITH_RELATIONS } },
        })
      : null;
    if (!coffee) throw apiError(404, 'COFFEE_NOT_FOUND', 'Coffee not found');
    const { products, ...rest } = coffee;
    return {
      ...toCoffeeDto(rest, products.filter((p) => p.isActive).length),
      products: products.sort(sortProducts).map(toProductDto),
    };
  }

  async createCoffee(dto: CreateCoffeeDto): Promise<CoffeeDto> {
    await this.assertCoffeeNameFree(dto.name);
    try {
      const coffee = await this.prisma.coffee.create({ data: dto });
      return toCoffeeDto(coffee, 0);
    } catch (err) {
      throw await this.mapNameConflict(err, () => this.assertCoffeeNameFree(dto.name));
    }
  }

  async updateCoffee(id: string, dto: UpdateCoffeeDto): Promise<CoffeeDto> {
    const existing = await this.findCoffee(id);
    this.rejectNulls(dto, {
      name: 'Coffee name is required',
      type: 'Choose single origin or blend',
    });
    if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertCoffeeNameFree(dto.name, id);
    }
    try {
      const coffee = await this.prisma.coffee.update({
        where: { id },
        data: dto,
        include: { _count: { select: { products: { where: { isActive: true } } } } },
      });
      const { _count, ...rest } = coffee;
      return toCoffeeDto(rest, _count.products);
    } catch (err) {
      throw await this.mapNameConflict(err, () =>
        dto.name === undefined ? Promise.resolve() : this.assertCoffeeNameFree(dto.name, id),
      );
    }
  }

  async setCoffeeActive(id: string, active: boolean): Promise<CoffeeDto> {
    await this.findCoffee(id);
    await this.prisma.coffee.updateMany({
      where: { id, isActive: !active },
      data: { isActive: active, deactivatedAt: active ? null : this.clock.now() },
    });
    const coffee = await this.prisma.coffee.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    const { _count, ...rest } = coffee;
    return toCoffeeDto(rest, _count.products);
  }

  // ── Grinds ───────────────────────────────────────────────────────────────

  async listGrinds(status: 'active' | 'inactive' | 'all' = 'active'): Promise<GrindListDto> {
    const grinds = await this.prisma.grind.findMany({
      where: status === 'all' ? {} : { isActive: status === 'active' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { items: grinds.map(toGrindDto) };
  }

  async createGrind(dto: CreateGrindDto): Promise<GrindDto> {
    await this.assertGrindNameFree(dto.name);
    try {
      return toGrindDto(await this.prisma.grind.create({ data: dto }));
    } catch (err) {
      throw await this.mapNameConflict(err, () => this.assertGrindNameFree(dto.name));
    }
  }

  async updateGrind(id: string, dto: UpdateGrindDto): Promise<GrindDto> {
    const existing = await this.findGrind(id);
    this.rejectNulls(dto, { name: 'Grind name is required' });
    if (dto.name !== undefined && dto.name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertGrindNameFree(dto.name, id);
    }
    try {
      return toGrindDto(await this.prisma.grind.update({ where: { id }, data: dto }));
    } catch (err) {
      throw await this.mapNameConflict(err, () =>
        dto.name === undefined ? Promise.resolve() : this.assertGrindNameFree(dto.name, id),
      );
    }
  }

  async setGrindActive(id: string, active: boolean): Promise<GrindDto> {
    await this.findGrind(id);
    await this.prisma.grind.updateMany({
      where: { id, isActive: !active },
      data: { isActive: active },
    });
    return toGrindDto(await this.prisma.grind.findUniqueOrThrow({ where: { id } }));
  }

  // ── Products ─────────────────────────────────────────────────────────────

  async listProducts(query: ListProductsQuery): Promise<ProductPageDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = this.productsWhere(query);
    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT count(*) AS total FROM products p LEFT JOIN coffees c ON c.id = p."coffeeId" ${where}`),
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id FROM products p
        LEFT JOIN coffees c ON c.id = p."coffeeId"
        LEFT JOIN grinds g ON g.id = p."grindId"
        ${where}
        ORDER BY (p."coffeeId" IS NULL) ASC, lower(coalesce(c.name, p.name)) ASC,
          p."bagSizeGrams" ASC NULLS LAST, g."sortOrder" ASC NULLS LAST, g.name ASC NULLS LAST, p.id ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    ]);
    const totalItems = Number(countRows[0]?.total ?? 0);
    const items = await this.loadInOrder(idRows.map((r) => r.id));
    return {
      items: items.map(toProductDto),
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  async listOrderable(): Promise<ProductListDto> {
    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id FROM products p
      LEFT JOIN coffees c ON c.id = p."coffeeId"
      LEFT JOIN grinds g ON g.id = p."grindId"
      WHERE p."isActive" = true AND coalesce(c."isActive", true) = true
      ORDER BY (p."coffeeId" IS NULL) ASC, lower(coalesce(c.name, p.name)) ASC,
        p."bagSizeGrams" ASC NULLS LAST, g."sortOrder" ASC NULLS LAST, g.name ASC NULLS LAST, p.id ASC`);
    const items = await this.loadInOrder(idRows.map((r) => r.id));
    return { items: items.map(toProductDto) };
  }

  async getProduct(id: string): Promise<ProductDto> {
    return toProductDto(await this.findProduct(id));
  }

  async createProduct(dto: CreateProductDto): Promise<ProductDto> {
    const kindFields = [dto.coffeeId, dto.bagSizeGrams, dto.grindId];
    const isCoffee = kindFields.every((f) => f !== undefined) && dto.name === undefined;
    const isOther = kindFields.every((f) => f === undefined) && dto.name !== undefined;
    if (!isCoffee && !isOther) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', {
        fieldErrors: [
          {
            field: 'kind',
            code: 'productKind',
            message:
              'A coffee product needs a coffee, bag size and grind (and no name). Any other product needs a name only.',
          },
        ],
      });
    }

    const notFound = [];
    if (isCoffee) {
      const [coffee, grind] = await Promise.all([
        this.prisma.coffee.findUnique({ where: { id: dto.coffeeId } }),
        this.prisma.grind.findUnique({ where: { id: dto.grindId } }),
      ]);
      if (!coffee)
        notFound.push({ field: 'coffeeId', code: 'notFound', message: 'Coffee not found' });
      if (!grind || !grind.isActive) {
        notFound.push({ field: 'grindId', code: 'notFound', message: 'Choose an active grind' });
      }
    }
    if (notFound.length > 0) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', {
        fieldErrors: notFound,
      });
    }

    await this.assertSkuFree(dto.sku);
    if (isCoffee) await this.assertVariantFree(dto.coffeeId!, dto.bagSizeGrams!, dto.grindId!);
    try {
      const product = await this.prisma.product.create({
        data: {
          sku: dto.sku,
          name: dto.name,
          coffeeId: dto.coffeeId,
          bagSizeGrams: dto.bagSizeGrams,
          grindId: dto.grindId,
          listPriceExGst: dto.listPriceExGst,
          taxCode: dto.taxCode,
        },
        include: WITH_RELATIONS,
      });
      return toProductDto(product);
    } catch (err) {
      throw await this.mapProductConflict(err, dto);
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<ProductDto> {
    const existing = await this.findProduct(id);
    this.rejectNulls(dto, {});
    if (dto.name !== undefined && existing.coffeeId) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', {
        fieldErrors: [
          {
            field: 'name',
            code: 'productKind',
            message: "A coffee product's name is built from its coffee, size and grind",
          },
        ],
      });
    }
    if (dto.sku !== undefined && dto.sku !== existing.sku) await this.assertSkuFree(dto.sku);
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: dto,
        include: WITH_RELATIONS,
      });
      return toProductDto(product);
    } catch (err) {
      throw await this.mapProductConflict(err, dto);
    }
  }

  async setProductActive(id: string, active: boolean): Promise<ProductDto> {
    const existing = await this.findProduct(id);
    if (active && !existing.isActive && existing.coffeeId) {
      await this.assertVariantFree(
        existing.coffeeId,
        existing.bagSizeGrams!,
        existing.grindId!,
        id,
      );
    }
    try {
      await this.prisma.product.updateMany({
        where: { id, isActive: !active },
        data: { isActive: active, deactivatedAt: active ? null : this.clock.now() },
      });
    } catch (err) {
      if (active && existing.coffeeId) {
        await this.assertVariantFree(
          existing.coffeeId,
          existing.bagSizeGrams!,
          existing.grindId!,
          id,
        );
      }
      throw err;
    }
    return this.getProduct(id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private productsWhere(query: ListProductsQuery): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    const status = query.status ?? 'active';
    if (status === 'active') conditions.push(Prisma.sql`p."isActive" = true`);
    else if (status === 'inactive') conditions.push(Prisma.sql`p."isActive" = false`);
    if (query.coffeeId) conditions.push(Prisma.sql`p."coffeeId" = ${query.coffeeId}::uuid`);
    if (query.kind === 'coffee') conditions.push(Prisma.sql`p."coffeeId" IS NOT NULL`);
    if (query.kind === 'other') conditions.push(Prisma.sql`p."coffeeId" IS NULL`);
    const term = query.search?.trim();
    if (term) {
      const pattern = `%${escapeLike(term)}%`;
      conditions.push(
        Prisma.sql`(c.name ILIKE ${pattern} OR p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})`,
      );
    }
    return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  }

  private async loadInOrder(ids: string[]): Promise<ProductWithRelations[]> {
    if (ids.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: WITH_RELATIONS,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)!);
  }

  private async findCoffee(id: string) {
    const coffee = isUUID(id) ? await this.prisma.coffee.findUnique({ where: { id } }) : null;
    if (!coffee) throw apiError(404, 'COFFEE_NOT_FOUND', 'Coffee not found');
    return coffee;
  }

  private async findGrind(id: string) {
    const grind = isUUID(id) ? await this.prisma.grind.findUnique({ where: { id } }) : null;
    if (!grind) throw apiError(404, 'GRIND_NOT_FOUND', 'Grind not found');
    return grind;
  }

  private async findProduct(id: string): Promise<ProductWithRelations> {
    const product = isUUID(id)
      ? await this.prisma.product.findUnique({ where: { id }, include: WITH_RELATIONS })
      : null;
    if (!product) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    return product;
  }

  /** Null on a field that cannot be cleared is a 400, not a 500. */
  private rejectNulls(dto: object, messages: Record<string, string>): void {
    const record = dto as Record<string, unknown>;
    const fieldErrors = Object.keys(record)
      .filter((k) => record[k] === null)
      .map((field) => ({
        field,
        code: 'isNotEmpty',
        message: messages[field] ?? `${field} can't be empty`,
      }));
    const required = ['name', 'type', 'sku', 'listPriceExGst', 'taxCode'];
    const bad = fieldErrors.filter((e) => required.includes(e.field) || e.field in messages);
    if (bad.length > 0) {
      throw apiError(400, 'VALIDATION_FAILED', 'Some fields need attention', { fieldErrors: bad });
    }
  }

  private async assertCoffeeNameFree(name: string, exceptId?: string): Promise<void> {
    const found = await this.prisma.coffee.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (found) {
      const message = `A coffee called ${found.name} already exists`;
      throw apiError(409, 'COFFEE_NAME_TAKEN', message, {
        fieldErrors: [{ field: 'name', code: 'coffeeNameTaken', message }],
        meta: { id: found.id },
      });
    }
  }

  private async assertGrindNameFree(name: string, exceptId?: string): Promise<void> {
    const found = await this.prisma.grind.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (found) {
      const message = `A grind called ${found.name} already exists`;
      throw apiError(409, 'GRIND_NAME_TAKEN', message, {
        fieldErrors: [{ field: 'name', code: 'grindNameTaken', message }],
        meta: { id: found.id },
      });
    }
  }

  /** A unique violation on a name (two saves racing the pre-check) becomes the friendly 409. */
  private async mapNameConflict(err: unknown, recheck: () => Promise<void>): Promise<unknown> {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return err;
    try {
      await recheck();
    } catch (mapped) {
      return mapped;
    }
    return err;
  }

  private async assertSkuFree(sku: string): Promise<void> {
    const found = await this.prisma.product.findUnique({ where: { sku } });
    if (found) {
      const message = `SKU ${sku} is already used`;
      throw apiError(409, 'SKU_TAKEN', message, {
        fieldErrors: [{ field: 'sku', code: 'skuTaken', message }],
        meta: { id: found.id },
      });
    }
  }

  private async assertVariantFree(
    coffeeId: string,
    bagSizeGrams: number,
    grindId: string,
    exceptId?: string,
  ): Promise<void> {
    const found = await this.prisma.product.findFirst({
      where: {
        coffeeId,
        bagSizeGrams,
        grindId,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      include: WITH_RELATIONS,
    });
    if (found) {
      const displayName = productDisplayName(found);
      throw apiError(409, 'PRODUCT_VARIANT_EXISTS', `${displayName} already exists`, {
        meta: { productId: found.id, displayName },
      });
    }
  }

  /** Maps unique violations (races between two saves) to the friendly 409s; anything else is rethrown. */
  private async mapProductConflict(err: unknown, dto: Partial<CreateProductDto>): Promise<unknown> {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return err;
    try {
      if (dto.sku) await this.assertSkuFree(dto.sku);
      if (dto.coffeeId && dto.bagSizeGrams && dto.grindId) {
        await this.assertVariantFree(dto.coffeeId, dto.bagSizeGrams, dto.grindId);
      }
    } catch (mapped) {
      return mapped;
    }
    return err;
  }
}
