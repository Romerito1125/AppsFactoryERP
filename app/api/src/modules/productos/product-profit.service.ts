import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnitType } from '@prisma/client';
import { convertQuantity } from '../../common/utils/unit-conversion.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProfitProductsQueryDto } from './dto/profit-products-query.dto';

@Injectable()
export class ProductProfitService {
  constructor(private readonly prisma: PrismaService) {}

  async findProductProfit(productId: number) {
    this.ensurePositiveId(productId);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        costs: {
          where: { isActive: true },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        prices: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.formatProductProfit(product);
  }

  async findAllProductProfits(query: ProfitProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = { isActive: true, deletedAt: null };
    const total = await this.prisma.product.count({ where });
    const products = await this.prisma.product.findMany({
      where,
      include: {
        costs: {
          where: { isActive: true },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        prices: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: products.map((product) => this.formatProductProfit(product)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  private formatProductProfit(product) {
    const currentCost = product.costs[0];

    if (!currentCost) {
      return {
        productId: product.id,
        productName: product.name,
        currentCost: null,
        warning:
          'El producto no tiene costo activo; no se puede calcular utilidad',
        prices: product.prices.map((price) => ({
          priceId: price.id,
          name: price.name,
          price: this.formatAmount(Number(price.price)),
          unit: price.unit,
          quantity: this.formatAmount(Number(price.quantity)),
          profitAmount: null,
          profitPercentage: null,
          warning: 'No hay costo activo para comparar',
        })),
      };
    }

    return {
      productId: product.id,
      productName: product.name,
      currentCost: {
        cost: this.formatAmount(Number(currentCost.cost)),
        unit: currentCost.unit,
        quantity: this.formatAmount(Number(currentCost.quantity)),
      },
      prices: product.prices.map((price) =>
        this.formatPriceProfit(price, currentCost),
      ),
    };
  }

  private formatPriceProfit(price, currentCost) {
    const comparableQuantity = convertQuantity(
      Number(price.quantity),
      price.unit as UnitType,
      currentCost.unit as UnitType,
    );

    if (comparableQuantity === null) {
      return {
        priceId: price.id,
        name: price.name,
        price: this.formatAmount(Number(price.price)),
        unit: price.unit,
        quantity: this.formatAmount(Number(price.quantity)),
        profitAmount: null,
        profitPercentage: null,
        warning:
          `No se puede calcular utilidad: ${price.unit} y ` +
          `${currentCost.unit} no son unidades compatibles`,
      };
    }

    const costPerCostUnit =
      Number(currentCost.cost) / Number(currentCost.quantity);
    const comparableCost = costPerCostUnit * comparableQuantity;
    const profitAmount = Number(price.price) - comparableCost;
    const profitPercentage = (profitAmount / comparableCost) * 100;

    return {
      priceId: price.id,
      name: price.name,
      price: this.formatAmount(Number(price.price)),
      unit: price.unit,
      quantity: this.formatAmount(Number(price.quantity)),
      profitAmount: this.formatAmount(profitAmount),
      profitPercentage: profitPercentage.toFixed(2),
    };
  }

  private formatAmount(value: number) {
    return value
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
