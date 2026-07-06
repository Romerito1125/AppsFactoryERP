import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { BarcodeFormatService } from '../../shared/products/barcode-format.service';
import { CreateProductBarcodeDto } from './dto/create-product-barcode.dto';
import { UpdateProductBarcodeDto } from './dto/update-product-barcode.dto';

@Injectable()
export class ProductBarcodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly barcodeFormat: BarcodeFormatService,
  ) {}

  findAll() {
    return this.prisma.productBarcode.findMany({
      include: { product: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    this.ensurePositiveId(id);
    const barcode = await this.prisma.productBarcode.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!barcode) {
      throw new NotFoundException('Código de barras no encontrado');
    }

    return barcode;
  }

  findByProduct(productId: number) {
    this.ensurePositiveId(productId);
    return this.prisma.productBarcode.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    });
  }

  async create(productId: number, dto: CreateProductBarcodeDto) {
    this.ensurePositiveId(productId);
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (!product.isActive) {
      throw new BadRequestException('El producto está inactivo');
    }

    const code = this.barcodeFormat.validate(dto.code, dto.type);
    await this.ensureCodeIsAvailable(code, productId);

    if (dto.isPrimary) {
      return this.prisma.$transaction(async (tx) => {
        await tx.productBarcode.updateMany({
          where: { productId },
          data: { isPrimary: false },
        });

        return tx.productBarcode.create({
          data: { productId, code, type: dto.type, isPrimary: true },
        });
      });
    }

    return this.prisma.productBarcode.create({
      data: {
        productId,
        code,
        type: dto.type,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async update(id: number, dto: UpdateProductBarcodeDto) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);
    const code = dto.code
      ? this.barcodeFormat.validate(dto.code, dto.type ?? current.type)
      : current.code;
    const type = dto.type ?? current.type;

    if (dto.type && !dto.code) {
      this.barcodeFormat.validate(current.code, dto.type);
    }

    if (code !== current.code) {
      await this.ensureCodeIsAvailable(code, current.productId);
    }

    if (dto.isPrimary && !current.isActive) {
      throw new BadRequestException(
        'No se puede marcar como principal un código inactivo',
      );
    }

    if (dto.isPrimary) {
      return this.prisma.$transaction(async (tx) => {
        await tx.productBarcode.updateMany({
          where: { productId: current.productId, id: { not: id } },
          data: { isPrimary: false },
        });

        return tx.productBarcode.update({
          where: { id },
          data: { code, type, isPrimary: true },
        });
      });
    }

    return this.prisma.productBarcode.update({
      where: { id },
      data: { code, type, isPrimary: dto.isPrimary },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.productBarcode.update({
      where: { id },
      data: { isActive: false, isPrimary: false },
    });
  }

  async markPrimary(id: number) {
    this.ensurePositiveId(id);
    const current = await this.findOne(id);

    if (!current.isActive) {
      throw new BadRequestException(
        'No se puede marcar como principal un código inactivo',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.productBarcode.updateMany({
        where: { productId: current.productId, id: { not: id } },
        data: { isPrimary: false },
      });

      return tx.productBarcode.update({
        where: { id },
        data: { isPrimary: true },
      });
    });
  }

  private async ensureCodeIsAvailable(code: string, productId: number) {
    const existing = await this.prisma.productBarcode.findUnique({
      where: { code },
    });

    if (existing && existing.productId !== productId) {
      throw new ConflictException(
        'El código de barras ya existe en otro producto',
      );
    }

    if (existing) {
      throw new ConflictException('El código de barras ya existe');
    }
  }

  private ensurePositiveId(id: number) {
    if (id <= 0) {
      throw new BadRequestException('El id debe ser un número positivo');
    }
  }
}
