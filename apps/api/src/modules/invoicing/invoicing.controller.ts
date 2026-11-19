import { Controller } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InvoicingService } from './invoicing.service';

@ApiTags('invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}
}
