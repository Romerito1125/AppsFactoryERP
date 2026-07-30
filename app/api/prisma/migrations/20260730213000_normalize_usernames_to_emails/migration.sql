UPDATE "User"
SET "username" = CONCAT("username", '@appsfactory.local')
WHERE "username" NOT LIKE '%@%';
