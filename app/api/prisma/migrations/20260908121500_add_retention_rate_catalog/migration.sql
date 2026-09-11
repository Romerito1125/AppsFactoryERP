INSERT INTO "Retention" ("code", "description", "minimumBase", "operationCode", "operationDescription", "applyPurchases", "applySales")
VALUES
  ('RC15', 'RETENCIÓN EN COMPRAS DEL 1,5%', 0, 'RC15', 'RETENCIÓN COMPRAS 1,5%', true, false),
  ('RC10', 'RETENCIÓN EN COMPRAS DEL 10%', 0, 'RC10', 'RETENCIÓN COMPRAS 10%', true, false)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 0, 999999999.99, 1.5, 0
FROM "Retention"
WHERE "code" = 'RC15'
  AND NOT EXISTS (
    SELECT 1 FROM "RetentionRange" r WHERE r."retentionId" = "Retention"."id"
  );

INSERT INTO "RetentionRange" ("retentionId", "minimum", "maximum", "percentage", "sortOrder")
SELECT "id", 0, 999999999.99, 10, 0
FROM "Retention"
WHERE "code" = 'RC10'
  AND NOT EXISTS (
    SELECT 1 FROM "RetentionRange" r WHERE r."retentionId" = "Retention"."id"
  );
