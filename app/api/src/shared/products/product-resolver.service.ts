import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

type PrismaTransaction = {
  product: {
    findUnique: (args: any) => Promise<any>;
  };
  productBarcode: {
    findUnique: (args: any) => Promise<any>;
  };
};

@Injectable()
export class ProductResolverService {
  async resolve(
    input: { productId?: number; barcode?: string },
    prisma: PrismaTransaction,
    include?: any,
  ) {
    const barcode = input.barcode?.trim();

    if (!input.productId && !barcode) {
      throw new BadRequestException('Debe enviar productId o barcode');
    }

    const barcodeRecord = barcode
      ? await prisma.productBarcode.findUnique({
          where: { code: barcode },
          include: { product: include ? { include } : true },
        })
      : null;

    if (barcode && !barcodeRecord) {
      throw new NotFoundException('Código de barras no encontrado');
    }

    if (barcodeRecord && !barcodeRecord.isActive) {
      throw new BadRequestException('El código de barras está inactivo');
    }

    if (
      input.productId &&
      barcodeRecord &&
      barcodeRecord.productId !== input.productId
    ) {
      throw new BadRequestException(
        'El código de barras no pertenece al producto enviado',
      );
    }

    const product = barcodeRecord?.product
      ? barcodeRecord.product
      : await prisma.product.findUnique({
          where: { id: input.productId },
          ...(include ? { include } : {}),
        });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (!product.isActive) {
      throw new BadRequestException('El producto está inactivo');
    }

    return product;
  }
}
