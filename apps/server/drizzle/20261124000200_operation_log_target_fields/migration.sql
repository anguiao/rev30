ALTER TABLE "ops_operation_logs"
  DROP CONSTRAINT "ops_operation_logs_target_check",
  ADD CONSTRAINT "ops_operation_logs_target_check"
    CHECK (
      ("target_key" IS NULL OR (btrim("target_key") <> '' AND char_length("target_key") <= 512))
      AND ("target_label" IS NULL OR (btrim("target_label") <> '' AND char_length("target_label") <= 512))
    );
