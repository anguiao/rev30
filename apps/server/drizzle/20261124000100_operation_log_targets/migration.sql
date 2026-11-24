ALTER TABLE "ops_operation_logs"
  DROP CONSTRAINT "ops_operation_logs_target_check",
  ADD CONSTRAINT "ops_operation_logs_target_check"
    CHECK (
      CASE
        WHEN "action" IN (
          'system:user:list',
          'system:role:list',
          'system:resource:list',
          'ops:login-log:list',
          'ops:online-session:list'
        ) THEN "target_key" IS NULL AND "target_label" IS NULL
        ELSE ("target_key" IS NOT NULL OR "target_label" IS NOT NULL)
          AND ("target_key" IS NULL OR (btrim("target_key") <> '' AND char_length("target_key") <= 512))
          AND ("target_label" IS NULL OR (btrim("target_label") <> '' AND char_length("target_label") <= 512))
      END
    );
