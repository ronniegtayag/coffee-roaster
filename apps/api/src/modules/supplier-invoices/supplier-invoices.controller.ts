import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SupplierInvoicesService } from './supplier-invoices.service';

@ApiTags('supplier-invoices')
@ApiBearerAuth()
@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly supplierInvoicesService: SupplierInvoicesService) {}
}
