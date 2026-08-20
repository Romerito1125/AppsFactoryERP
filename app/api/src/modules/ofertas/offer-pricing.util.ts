import { DiscountType } from '@prisma/client';

export type OfferTarget = {
  clients?: Array<{ clientId: number }>;
  products?: Array<{ productId: number }>;
  productTypes?: Array<{ productTypeId: number }>;
  tags?: Array<{ tagId: number }>;
};

export type OfferPricingContext = {
  clientId?: number;
  productId: number;
  productTypeId?: number;
  tagIds?: number[];
  quantity: number;
};

export type OfferPricingResult<TOffer> = {
  applicableOffers: TOffer[];
  evaluatedOffers: Array<TOffer & { estimatedDiscount: number }>;
  selectedOffers: Array<TOffer & { estimatedDiscount: number }>;
  discountAmount: number;
  effectiveUnitPrice: number | null;
};

export function offerAppliesToItem(
  offer: OfferTarget & {
    minimumProductQuantity?: number | null;
    maximumProductQuantity?: number | null;
  },
  context: OfferPricingContext,
) {
  if (
    offer.minimumProductQuantity &&
    context.quantity < offer.minimumProductQuantity
  ) {
    return false;
  }

  if (
    offer.maximumProductQuantity &&
    context.quantity > offer.maximumProductQuantity
  ) {
    return false;
  }

  const clients = offer.clients ?? [];
  const products = offer.products ?? [];
  const productTypes = offer.productTypes ?? [];
  const tags = offer.tags ?? [];
  const hasTargets =
    clients.length > 0 ||
    products.length > 0 ||
    productTypes.length > 0 ||
    tags.length > 0;

  if (!hasTargets) return true;

  return (
    (context.clientId !== undefined &&
      clients.some((target) => target.clientId === context.clientId)) ||
    products.some((target) => target.productId === context.productId) ||
    (context.productTypeId !== undefined &&
      productTypes.some(
        (target) => target.productTypeId === context.productTypeId,
      )) ||
    tags.some((target) => (context.tagIds ?? []).includes(target.tagId))
  );
}

export function calculateOfferDiscount(
  offer: { discountType: DiscountType; discountValue: unknown },
  unitPrice: number,
  quantity: number,
) {
  const value = Number(offer.discountValue);

  if (!Number.isFinite(value) || value <= 0 || unitPrice <= 0 || quantity <= 0) {
    return 0;
  }

  if (offer.discountType === DiscountType.PORCENTAJE) {
    return Math.min(unitPrice * quantity, unitPrice * quantity * (value / 100));
  }

  if (offer.discountType === DiscountType.PRECIO_ESPECIAL) {
    return Math.max(0, Math.min(unitPrice, unitPrice - value) * quantity);
  }

  return Math.min(unitPrice, value) * quantity;
}

export function resolveOfferPricing<TOffer extends OfferTarget & {
  discountType: DiscountType;
  discountValue: unknown;
  isStackable?: boolean | null;
}>(
  unitPrice: number | undefined,
  offers: TOffer[],
  context: OfferPricingContext,
): OfferPricingResult<TOffer> {
  if (unitPrice === undefined || !Number.isFinite(unitPrice)) {
    return {
      applicableOffers: [],
      evaluatedOffers: [],
      selectedOffers: [],
      discountAmount: 0,
      effectiveUnitPrice: unitPrice ?? null,
    };
  }

  const applicableOffers = offers.filter((offer) =>
    offerAppliesToItem(offer, context),
  );
  const evaluatedOffers = applicableOffers.map((offer) => ({
    ...offer,
    estimatedDiscount: roundMoney(
      calculateOfferDiscount(offer, unitPrice, context.quantity),
    ),
  }));
  const stackableOffers = evaluatedOffers.filter(
    (offer) => offer.isStackable,
  );
  const bestSingleOffer = evaluatedOffers.reduce<
    (typeof evaluatedOffers)[number] | undefined
  >(
    (best, offer) =>
      !best || offer.estimatedDiscount > best.estimatedDiscount
        ? offer
        : best,
    undefined,
  );
  const stackableDiscount = stackableOffers.reduce(
    (sum, offer) => sum + offer.estimatedDiscount,
    0,
  );
  const selectedOffers =
    stackableDiscount > (bestSingleOffer?.estimatedDiscount ?? 0)
      ? stackableOffers
      : bestSingleOffer
        ? [bestSingleOffer]
        : [];
  const selectedDiscount = roundMoney(
    Math.min(unitPrice * context.quantity, selectedOffers.reduce(
      (sum, offer) => sum + offer.estimatedDiscount,
      0,
    )),
  );
  const effectiveUnitPrice = roundMoney(
    Math.max(0, unitPrice - selectedDiscount / context.quantity),
  );
  const discountAmount = roundMoney(
    unitPrice * context.quantity - effectiveUnitPrice * context.quantity,
  );

  return {
    applicableOffers,
    evaluatedOffers,
    selectedOffers,
    discountAmount,
    effectiveUnitPrice,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
