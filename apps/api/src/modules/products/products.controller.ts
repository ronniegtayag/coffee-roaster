import { IsIn, IsOptional } from 'class-validator';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Permission, RequirePermission } from '../auth';
import {
  CoffeeDetailDto,
  CoffeeDto,
  CoffeeListDto,
  CreateCoffeeDto,
  ListCoffeesQuery,
  STATUS_FILTERS,
  UpdateCoffeeDto,
} from './dto/coffee.dto';
import type { StatusFilter } from './dto/coffee.dto';
import { CreateGrindDto, GrindDto, GrindListDto, UpdateGrindDto } from './dto/grind.dto';
import {
  CreateProductDto,
  ListProductsQuery,
  ProductDto,
  ProductListDto,
  ProductPageDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

class ListGrindsQuery {
  @ApiPropertyOptional({ enum: STATUS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: StatusFilter;
}

@ApiTags('coffees')
@ApiBearerAuth()
@Controller('coffees')
export class CoffeesController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ApiOkResponse({ type: CoffeeListDto })
  list(@Query() query: ListCoffeesQuery): Promise<CoffeeListDto> {
    return this.products.listCoffees(query);
  }

  @Post()
  @RequirePermission(Permission.ProductsWrite)
  @ApiCreatedResponse({ type: CoffeeDto })
  create(@Body() dto: CreateCoffeeDto): Promise<CoffeeDto> {
    return this.products.createCoffee(dto);
  }

  @Get(':id')
  @RequirePermission(Permission.ProductsRead)
  @ApiOkResponse({ type: CoffeeDetailDto })
  get(@Param('id') id: string): Promise<CoffeeDetailDto> {
    return this.products.getCoffee(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: CoffeeDto })
  update(@Param('id') id: string, @Body() dto: UpdateCoffeeDto): Promise<CoffeeDto> {
    return this.products.updateCoffee(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOperation({
    summary: 'Deactivate a coffee; its products stop being orderable but keep their own status',
  })
  @ApiOkResponse({ type: CoffeeDto })
  deactivate(@Param('id') id: string): Promise<CoffeeDto> {
    return this.products.setCoffeeActive(id, false);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: CoffeeDto })
  reactivate(@Param('id') id: string): Promise<CoffeeDto> {
    return this.products.setCoffeeActive(id, true);
  }
}

@ApiTags('grinds')
@ApiBearerAuth()
@Controller('grinds')
export class GrindsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ApiOkResponse({ type: GrindListDto })
  list(@Query() query: ListGrindsQuery): Promise<GrindListDto> {
    return this.products.listGrinds(query.status);
  }

  @Post()
  @RequirePermission(Permission.ProductsWrite)
  @ApiCreatedResponse({ type: GrindDto })
  create(@Body() dto: CreateGrindDto): Promise<GrindDto> {
    return this.products.createGrind(dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: GrindDto })
  update(@Param('id') id: string, @Body() dto: UpdateGrindDto): Promise<GrindDto> {
    return this.products.updateGrind(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: GrindDto })
  deactivate(@Param('id') id: string): Promise<GrindDto> {
    return this.products.setGrindActive(id, false);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: GrindDto })
  reactivate(@Param('id') id: string): Promise<GrindDto> {
    return this.products.setGrindActive(id, true);
  }
}

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission(Permission.ProductsRead)
  @ApiOkResponse({ type: ProductPageDto })
  list(@Query() query: ListProductsQuery): Promise<ProductPageDto> {
    return this.products.listProducts(query);
  }

  @Get('orderable')
  @RequirePermission(Permission.ProductsRead)
  @ApiOperation({ summary: 'All products that can go on an order (not paginated)' })
  @ApiOkResponse({ type: ProductListDto })
  orderable(): Promise<ProductListDto> {
    return this.products.listOrderable();
  }

  @Post()
  @RequirePermission(Permission.ProductsWrite)
  @ApiCreatedResponse({ type: ProductDto })
  create(@Body() dto: CreateProductDto): Promise<ProductDto> {
    return this.products.createProduct(dto);
  }

  @Get(':id')
  @RequirePermission(Permission.ProductsRead)
  @ApiOkResponse({ type: ProductDto })
  get(@Param('id') id: string): Promise<ProductDto> {
    return this.products.getProduct(id);
  }

  @Patch(':id')
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: ProductDto })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductDto> {
    return this.products.updateProduct(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: ProductDto })
  deactivate(@Param('id') id: string): Promise<ProductDto> {
    return this.products.setProductActive(id, false);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermission(Permission.ProductsWrite)
  @ApiOkResponse({ type: ProductDto })
  reactivate(@Param('id') id: string): Promise<ProductDto> {
    return this.products.setProductActive(id, true);
  }
}
