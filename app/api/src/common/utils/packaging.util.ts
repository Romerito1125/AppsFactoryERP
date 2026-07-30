export interface PackagingProfileLike {
  unitsPerPackage?: number | null;
  packagesPerBox?: number | null;
}

export interface PackagingBreakdown {
  boxes: number;
  packages: number;
  units: number;
  unitsPerPackage: number | null;
  packagesPerBox: number | null;
  unitsPerBox: number | null;
}

export function normalizePositiveInteger(value?: number | null) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return null;
  }

  return Number(value);
}

export function buildPackagingBreakdown(
  quantity: number,
  profile?: PackagingProfileLike | null,
): PackagingBreakdown | null {
  const normalizedQuantity = Number(quantity);

  if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 0) {
    return null;
  }

  const unitsPerPackage = normalizePositiveInteger(profile?.unitsPerPackage);
  const packagesPerBox = normalizePositiveInteger(profile?.packagesPerBox);

  if (!unitsPerPackage && !packagesPerBox) {
    return null;
  }

  const unitsPerBox =
    unitsPerPackage && packagesPerBox ? unitsPerPackage * packagesPerBox : null;

  let remainder = normalizedQuantity;
  let boxes = 0;
  let packages = 0;

  if (unitsPerBox) {
    boxes = Math.floor(remainder / unitsPerBox);
    remainder -= boxes * unitsPerBox;
  }

  if (unitsPerPackage) {
    packages = Math.floor(remainder / unitsPerPackage);
    remainder -= packages * unitsPerPackage;
  }

  return {
    boxes,
    packages,
    units: remainder,
    unitsPerPackage,
    packagesPerBox,
    unitsPerBox,
  };
}
