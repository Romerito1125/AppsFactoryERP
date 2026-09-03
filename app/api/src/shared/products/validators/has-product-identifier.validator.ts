import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'hasProductIdentifier', async: false })
export class HasProductIdentifierConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const item = args.object as { productId?: number; barcode?: string };
    return Boolean(item.productId || item.barcode?.trim());
  }

  defaultMessage() {
    return 'Debe enviar productId o barcode';
  }
}
