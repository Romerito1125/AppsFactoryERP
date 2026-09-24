import { UnitType } from '@prisma/client';
import { convertQuantity } from './unit-conversion.util';

export type ProductPackaging = {
  unitsPerPackage?: number | null;
  packagesPerBox?: number | null;
} | null;

/**
 * Converts a commercial quantity (unit, package or box) to the product's
 * stock unit. Inventory quantities are always persisted in that base unit.
 */
export function convertProductQuantityToBase(
  quantity: number,
  fromUnit: UnitType,
  productUnit: UnitType,
  packaging?: ProductPackaging,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  if (fromUnit === productUnit) return quantity;

  if (fromUnit === UnitType.PAQUETE) {
    if (productUnit === UnitType.UND) {
      const unitsPerPackage = Number(packaging?.unitsPerPackage ?? 0);
      return unitsPerPackage > 0 ? quantity * unitsPerPackage : null;
    }
    return null;
  }

  if (fromUnit === UnitType.CAJA) {
    const packagesPerBox = Number(packaging?.packagesPerBox ?? 0);

    if (productUnit === UnitType.PAQUETE) {
      return packagesPerBox > 0 ? quantity * packagesPerBox : null;
    }

    if (productUnit === UnitType.UND) {
      const unitsPerPackage = Number(packaging?.unitsPerPackage ?? 0);
      return unitsPerPackage > 0 && packagesPerBox > 0
        ? quantity * unitsPerPackage * packagesPerBox
        : null;
    }

    return null;
  }

  return convertQuantity(quantity, fromUnit, productUnit);
}

/**
 * Normalizes a purchase cost to one stock unit. This lets historical costs
 * remain comparable even when a supplier invoice is expressed in boxes or
 * packages.
 */
export function convertProductUnitCost(
  cost: number,
  fromUnit: UnitType,
  productUnit: UnitType,
  packaging?: ProductPackaging,
): number | null {
  const baseUnits = convertProductQuantityToBase(
    1,
    fromUnit,
    productUnit,
    packaging,
  );

  if (baseUnits === null || baseUnits <= 0) return null;
  return cost / baseUnits;
}

export function getProductStockStatus(
  quantity: number,
  minimumStock?: number | null,
  maximumStock?: number | null,
): 'VERDE' | 'AMARILLO' | 'ROJO' {
  const stock = Number(quantity ?? 0);
  const minimum = Number(minimumStock ?? 0);
  const maximum =
    maximumStock === null || maximumStock === undefined
      ? null
      : Number(maximumStock);

  if (stock <= minimum) return 'ROJO';
  if (maximum !== null && stock >= maximum) return 'AMARILLO';
  return 'VERDE';
}
