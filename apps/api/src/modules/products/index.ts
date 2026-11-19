// Public API of the products module. Other modules must import from here, not from internals.
export { ProductsModule } from './products.module';
export { ProductsService } from './products.service';
export { productDisplayName } from './product-display-name';
export type { OrderableProduct } from './products.types';
