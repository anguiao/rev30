UPDATE "system_resources"
SET
  "icon" = 'lucide:book-open-text',
  "updated_at" = now()
WHERE
  "code" = 'system:dictionary'
  AND "deleted_at" IS NULL;
