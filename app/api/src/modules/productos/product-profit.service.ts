import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UnitType } from '@prisma/client';
import {
  convertProductQuantityToBase,
  convertProductUnitCost,
} from '../../common/utils/product-quantity.util';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ProfitProductsQueryDto } from './dto/profit-products-query.dto';

@Injectable()
export class ProductProfitService {
  private readonly minimumRecommendedMargin = 20;

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
        packagingProfile: true,
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
        packagingProfile: true,
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
        this.formatPriceProfit(
          price,
          currentCost,
          product.unit,
          product.packagingProfile,
          Number(product.taxRate ?? 0),
        ),
      ),
    };
  }

  private formatPriceProfit(
    price,
    currentCost,
    productUnit,
    packagingProfile,
    taxRate,
  ) {
    const comparableQuantity = convertProductQuantityToBase(
      Number(price.quantity),
      price.unit as UnitType,
      productUnit,
      packagingProfile,
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
          `No se puede calcular utilidad: ${price.unit} no se puede convertir ` +
          `a la unidad base del producto`,
      };
    }

    const costPerProductUnit = convertProductUnitCost(
      Number(currentCost.cost) / Number(currentCost.quantity),
      currentCost.unit as UnitType,
      productUnit,
      packagingProfile,
    );
    if (costPerProductUnit === null) {
      return {
        priceId: price.id,
        name: price.name,
        price: this.formatAmount(Number(price.price)),
        unit: price.unit,
        quantity: this.formatAmount(Number(price.quantity)),
        profitAmount: null,
        profitPercentage: null,
        warning: 'No se puede convertir el costo a la unidad base del producto',
      };
    }

    const comparableCost = costPerProductUnit * comparableQuantity;
    const priceBeforeTax = Number(price.price);
    const profitAmount = priceBeforeTax - comparableCost;
    // El margen se calcula sobre el precio de venta; la ganancia sobre el costo
    // es el markup y no debe mostrarse como margen comercial.
    const profitPercentage = (profitAmount / priceBeforeTax) * 100;
    const priceAfterTax = priceBeforeTax * (1 + taxRate / 100);
    const profitAfterTax = priceAfterTax - comparableCost;
    const marginAfterTax = (profitAfterTax / priceAfterTax) * 100;
    const suggestedPriceBeforeTax =
      comparableCost / (1 - this.minimumRecommendedMargin / 100);
    const warning =
      profitPercentage < this.minimumRecommendedMargin
        ? `Margen bajo (${profitPercentage.toFixed(2)}%). Precio sugerido antes de IVA para conservar ${this.minimumRecommendedMargin}%: ${this.formatAmount(suggestedPriceBeforeTax)}`
        : undefined;

    return {
      priceId: price.id,
      name: price.name,
      price: this.formatAmount(Number(price.price)),
      unit: price.unit,
      quantity: this.formatAmount(Number(price.quantity)),
      profitAmount: this.formatAmount(profitAmount),
      profitPercentage: profitPercentage.toFixed(2),
      priceBeforeTax: this.formatAmount(priceBeforeTax),
      priceAfterTax: this.formatAmount(priceAfterTax),
      profitAfterTax: this.formatAmount(profitAfterTax),
      marginAfterTax: marginAfterTax.toFixed(2),
      suggestedPriceBeforeTax: this.formatAmount(suggestedPriceBeforeTax),
      warning,
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
