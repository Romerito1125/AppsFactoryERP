import { BadRequestException, Injectable } from '@nestjs/common';
import { BarcodeType } from '@prisma/client';

@Injectable()
export class BarcodeFormatService {
  validate(code: string, type?: BarcodeType | null) {
    const normalizedCode = code?.trim();

    if (!normalizedCode) {
      throw new BadRequestException('El código de barras no puede estar vacío');
    }

    const barcodeType = type ?? BarcodeType.OTHER;
    const validators: Record<BarcodeType, RegExp> = {
      [BarcodeType.EAN13]: /^\d{13}$/,
      [BarcodeType.EAN8]: /^\d{8}$/,
      [BarcodeType.UPC_A]: /^\d{12}$/,
      [BarcodeType.UPC_E]: /^\d{6}(\d{2})?$/,
      [BarcodeType.CODE128]: /^[A-Za-z0-9-]+$/,
      [BarcodeType.QR]: /^.+$/,
      [BarcodeType.OTHER]: /^.+$/,
    };

    if (!validators[barcodeType].test(normalizedCode)) {
      throw new BadRequestException(
        `El código no cumple el formato requerido para ${barcodeType}`,
      );
    }

    return normalizedCode;
  }
}
