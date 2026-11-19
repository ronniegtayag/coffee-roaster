import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsPlainDate, IsPrice } from '../../../common/validators';
import {
  AustralianState,
  OrderEventType,
  OrderStatus,
  TaxCode,
} from '../../../generated/prisma/client';
import { trim, trimOrNull } from '../../../common/transforms';

const QUANTITY_MESSAGE = 'Quantity must be a whole number from 1 to 999';
const DATE_MESSAGE = 'Enter a date as YYYY-MM-DD';
const VERSION_MESSAGE = 'Version must be a whole number';

export const OPEN_STATUSES: OrderStatus[] = ['DRAFT', 'CONFIRMED', 'PACKED', 'DISPATCHED'];

export class OrderLineInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'Choose a product' })
  productId: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: 999 })
  @IsInt({ message: QUANTITY_MESSAGE })
  @Min(1, { message: QUANTITY_MESSAGE })
  @Max(999, { message: QUANTITY_MESSAGE })
  quantity: number;

  @ApiPropertyOptional({
    type: String,
    example: '34.00',
    description: 'Required when the product is not already on the order: the price the form showed',
  })
  @IsOptional()
  @IsPrice()
  expectedUnitPriceExGst?: string;

  @ApiPropertyOptional({
    enum: TaxCode,
    enumName: 'TaxCode',
    description: 'Required for a new line',
  })
  @IsOptional()
  @IsEnum(TaxCode, { message: 'Choose GST or GST-free' })
  expectedTaxCode?: TaxCode;
}

export class CreateOrderDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Generated once per new-order form; makes the request idempotent',
  })
  @IsUUID(undefined, { message: 'requestId must be a UUID' })
  requestId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'Choose a branch' })
  branchId: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Omitted: suggested' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  deliveryDate?: string;

  @ApiPropertyOptional({ type: String, format: 'date', description: 'Omitted: suggested' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  roastDate?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Notes must be 2000 characters or fewer' })
  notes?: string | null;

  @ApiPropertyOptional({ type: () => [OrderLineInput], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'An order can have at most 200 lines' })
  @ValidateNested({ each: true })
  @Type(() => OrderLineInput)
  lines?: OrderLineInput[];
}

export class UpdateOrderDto {
  @ApiProperty({ type: Number, description: 'The version the client last read' })
  @IsInt({ message: VERSION_MESSAGE })
  @Min(1, { message: VERSION_MESSAGE })
  version: number;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  deliveryDate?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description: 'Not changed automatically when only deliveryDate is sent',
  })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  roastDate?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Notes must be 2000 characters or fewer' })
  notes?: string | null;

  @ApiPropertyOptional({
    type: () => [OrderLineInput],
    maxItems: 200,
    description: 'The full desired set of lines',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'An order can have at most 200 lines' })
  @ValidateNested({ each: true })
  @Type(() => OrderLineInput)
  lines?: OrderLineInput[];

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required when reducing or removing lines on a packed or dispatched order',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Give a reason' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer' })
  reason?: string;
}

export class VersionDto {
  @ApiProperty({ type: Number })
  @IsInt({ message: VERSION_MESSAGE })
  @Min(1, { message: VERSION_MESSAGE })
  version: number;
}

export class VersionReasonDto extends VersionDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @Transform(trim)
  @IsString({ message: 'Give a reason' })
  @IsNotEmpty({ message: 'Give a reason' })
  @MaxLength(500, { message: 'Reason must be 500 characters or fewer' })
  reason: string;
}

export class CopyOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, { message: 'requestId must be a UUID' })
  requestId: string;
}

export class DeleteOrderQuery {
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsInt({ message: VERSION_MESSAGE })
  @Min(1, { message: VERSION_MESSAGE })
  version: number;
}

export class ScheduleQuery {
  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  deliveryDate?: string;
}

export class RoastSummaryQuery {
  @ApiProperty({ type: String, format: 'date' })
  @IsPlainDate(DATE_MESSAGE)
  roastDate: string;
}

export const ORDER_STATUS_VALUES = Object.values(OrderStatus);

export class ListOrdersQuery {
  @ApiPropertyOptional({ type: Number, minimum: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Order number, customer name or branch name',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'DRAFT,CONFIRMED',
    description: 'Comma-separated OrderStatus values. Default DRAFT,CONFIRMED,PACKED,DISPATCHED',
  })
  @IsOptional()
  @IsString()
  @Transform(trim)
  status?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  deliveryFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  deliveryTo?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsPlainDate(DATE_MESSAGE)
  roastDate?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() branchId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() productId?: string;
}

// ── Responses ───────────────────────────────────────────────────────────────

export class CutoffDto {
  @ApiProperty({ type: String, format: 'date', description: 'Sydney local date' }) date: string;
  @ApiProperty({ example: '12:00', description: 'Sydney local time' }) time: string;
}

export class OrderCustomerDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() displayName: string;
  @ApiProperty() isActive: boolean;
}

export class OrderListBranchDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() suburb: string;
  @ApiProperty() isActive: boolean;
}

export class OrderListItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'ORD-1001' }) orderNumber: string;
  @ApiProperty({ enum: OrderStatus, enumName: 'OrderStatus' }) status: OrderStatus;
  @ApiProperty({ type: String, format: 'date' }) deliveryDate: string;
  @ApiProperty({ type: String, format: 'date' }) roastDate: string;
  @ApiProperty({ type: () => OrderCustomerDto }) customer: OrderCustomerDto;
  @ApiProperty({ type: () => OrderListBranchDto }) branch: OrderListBranchDto;
  @ApiProperty({ type: Number }) lineCount: number;
  @ApiProperty({ type: Number, description: 'Grams' }) totalWeightGrams: number;
  @ApiProperty({ type: String, example: '408.00' }) subtotalExGst: string;
  @ApiProperty({ type: String, example: '0.00' }) gstAmount: string;
  @ApiProperty({ type: String, example: '408.00' }) totalIncGst: string;
  @ApiProperty({ description: 'Stored: last saved off-schedule' }) afterCutoff: boolean;
  @ApiProperty({ description: 'Derived now from the roast date and calendar' }) pastCutoff: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt: string;
}

export class OrderPageDto {
  @ApiProperty({ type: () => [OrderListItemDto] }) items: OrderListItemDto[];
  @ApiProperty({ type: Number }) page: number;
  @ApiProperty({ type: Number }) pageSize: number;
  @ApiProperty({ type: Number }) totalItems: number;
  @ApiProperty({ type: Number }) totalPages: number;
}

export class OrderBranchDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty() addressLine1: string;
  @ApiProperty({ type: String, nullable: true }) addressLine2: string | null;
  @ApiProperty() suburb: string;
  @ApiProperty({ enum: AustralianState, enumName: 'AustralianState' }) state: AustralianState;
  @ApiProperty() postcode: string;
  @ApiProperty({ type: String, nullable: true }) contactName: string | null;
  @ApiProperty({ type: String, nullable: true }) contactPhone: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Read-only on the order' })
  deliveryNotes: string | null;
}

export class OrderLineDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() sku: string;
  @ApiProperty({ description: 'Snapshot of the product display name' }) description: string;
  @ApiProperty({ enum: TaxCode, enumName: 'TaxCode', description: 'Snapshot' }) taxCode: TaxCode;
  @ApiProperty({ type: Number }) quantity: number;
  @ApiProperty({ type: String, example: '34.00', description: 'Snapshot' }) unitPriceExGst: string;
  @ApiProperty({ type: String }) lineTotalExGst: string;
  @ApiProperty({ type: String }) gstAmount: string;
  @ApiProperty({ type: String }) lineTotalIncGst: string;
  @ApiProperty({ description: 'False: show an "Inactive product" badge' })
  productOrderable: boolean;
}

export class UserRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class AllowedActionsDto {
  @ApiProperty({ enum: ['full', 'reduceOnly', 'none'] }) editLines: 'full' | 'reduceOnly' | 'none';
  @ApiProperty() editRoastDate: boolean;
  @ApiProperty() editDeliveryDate: boolean;
  @ApiProperty() editNotes: boolean;
  @ApiProperty() confirm: boolean;
  @ApiProperty() pack: boolean;
  @ApiProperty() dispatch: boolean;
  @ApiProperty() deliver: boolean;
  @ApiProperty() cancel: boolean;
  @ApiProperty() revert: boolean;
  @ApiProperty() delete: boolean;
  @ApiProperty() copy: boolean;
}

export class OrderEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: OrderEventType, enumName: 'OrderEventType' }) type: OrderEventType;
  @ApiProperty({ type: () => UserRefDto }) user: UserRefDto;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  changes: Record<string, unknown> | null;
  @ApiProperty({ type: String, format: 'date-time' }) at: string;
}

export class OrderDto extends OrderListItemDto {
  @ApiProperty({ type: Number }) version: number;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: () => CutoffDto, description: 'Cut-off for the roast date, Sydney local' })
  cutoff: CutoffDto;
  @ApiProperty({ type: () => OrderBranchDto }) declare branch: OrderBranchDto;
  @ApiProperty({ type: () => [OrderLineDto], description: 'By description, case-insensitive' })
  lines: OrderLineDto[];
  @ApiProperty({ type: String, nullable: true }) cancelReason: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) confirmedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) packedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) dispatchedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deliveredAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) cancelledAt: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: () => UserRefDto }) createdBy: UserRefDto;
  @ApiProperty({ type: () => UserRefDto }) updatedBy: UserRefDto;
  @ApiProperty({ type: () => AllowedActionsDto, description: 'For the current user, now' })
  allowedActions: AllowedActionsDto;
  @ApiProperty({ type: () => [OrderEventDto], description: 'Newest first' })
  events: OrderEventDto[];
}

export class SkippedLineDto {
  @ApiProperty({ format: 'uuid' }) productId: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: ['PRODUCT_INACTIVE', 'COFFEE_INACTIVE'] })
  reason: 'PRODUCT_INACTIVE' | 'COFFEE_INACTIVE';
}

export class CopyOrderResultDto {
  @ApiProperty({ type: () => OrderDto }) order: OrderDto;
  @ApiProperty({ type: () => [SkippedLineDto] }) skippedLines: SkippedLineDto[];
}

export class ScheduleSuggestionDto {
  @ApiProperty({ type: String, format: 'date' }) roastDate: string;
  @ApiProperty({ type: String, format: 'date' }) deliveryDate: string;
  @ApiProperty({ type: () => CutoffDto }) cutoff: CutoffDto;
  @ApiProperty() onSchedule: boolean;
  @ApiProperty({
    enum: ['CUTOFF_PASSED', 'NOT_A_ROAST_DAY', 'NOT_A_DELIVERY_DAY', 'DELIVERY_TOO_SOON'],
    isArray: true,
  })
  reasons: ('CUTOFF_PASSED' | 'NOT_A_ROAST_DAY' | 'NOT_A_DELIVERY_DAY' | 'DELIVERY_TOO_SOON')[];
}

export class RoastSummaryCoffeeDto {
  @ApiProperty({ format: 'uuid' }) coffeeId: string;
  @ApiProperty() coffeeName: string;
  @ApiProperty({ type: Number, description: 'Grams' }) totalWeightGrams: number;
  @ApiProperty({ type: Number }) orderCount: number;
}

export class RoastSummaryDto {
  @ApiProperty({ type: String, format: 'date' }) roastDate: string;
  @ApiProperty({
    type: () => [RoastSummaryCoffeeDto],
    description: 'By coffee name; CONFIRMED orders only',
  })
  coffees: RoastSummaryCoffeeDto[];
  @ApiProperty({ type: Number }) totalWeightGrams: number;
}
