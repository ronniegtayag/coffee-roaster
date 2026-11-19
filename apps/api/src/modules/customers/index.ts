// Public API of the customers module. Other modules must import from here, not from internals.
export { CustomersModule } from './customers.module';
export { CustomersService } from './customers.service';
export type { OrderingBranch } from './customers.types';
export { displayName as customerDisplayName } from './customers.mapper';
