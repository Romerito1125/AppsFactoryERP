-- Allows offers to define an explicit final unit price instead of a percentage.
ALTER TYPE "DiscountType" ADD VALUE IF NOT EXISTS 'PRECIO_ESPECIAL';
