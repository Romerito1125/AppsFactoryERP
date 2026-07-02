import { UnitType } from '@prisma/client';

type UnitGroup = 'mass' | 'volume' | 'simple';

const MASS_FACTORS_TO_KG: Record<string, number> = {
  KG: 1,
  G: 0.001,
  LB: 0.453592,
};

const VOLUME_FACTORS_TO_L: Record<string, number> = {
  L: 1,
  ML: 0.001,
};

export function getUnitGroup(unit: UnitType): UnitGroup {
  if (unit in MASS_FACTORS_TO_KG) return 'mass';
  if (unit in VOLUME_FACTORS_TO_L) return 'volume';
  return 'simple';
}

export function areUnitsCompatible(from: UnitType, to: UnitType): boolean {
  const fromGroup = getUnitGroup(from);
  const toGroup = getUnitGroup(to);

  if (fromGroup !== toGroup) return false;
  if (fromGroup === 'simple') return from === to;
  return true;
}

export function convertQuantity(
  quantity: number,
  from: UnitType,
  to: UnitType,
): number | null {
  if (!areUnitsCompatible(from, to)) return null;
  if (from === to) return quantity;

  const group = getUnitGroup(from);

  if (group === 'mass') {
    const quantityInKg = quantity * MASS_FACTORS_TO_KG[from];
    return quantityInKg / MASS_FACTORS_TO_KG[to];
  }

  if (group === 'volume') {
    const quantityInL = quantity * VOLUME_FACTORS_TO_L[from];
    return quantityInL / VOLUME_FACTORS_TO_L[to];
  }

  return null;
}
