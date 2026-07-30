INSERT INTO "ProductProvider" ("productId", "providerId")
SELECT p."id", p."providerId"
FROM "Product" p
LEFT JOIN "ProductProvider" pp
  ON pp."productId" = p."id"
 AND pp."providerId" = p."providerId"
WHERE pp."productId" IS NULL
ON CONFLICT ("productId", "providerId") DO NOTHING;
