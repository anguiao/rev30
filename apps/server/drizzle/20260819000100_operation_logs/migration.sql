CREATE TABLE "ops_operation_logs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "actor_username" text NOT NULL,
  "actor_nickname" text NOT NULL,
  "actor_is_admin" boolean NOT NULL,
  "actor_session_id" uuid NOT NULL,
  "module" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_key" text,
  "target_label" text,
  "result" text NOT NULL,
  "http_status" smallint NOT NULL,
  "duration_ms" integer NOT NULL,
  "request_id" uuid NOT NULL,
  "client_ip" text,
  "client_ip_source" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ops_operation_logs_module_check"
    CHECK ("module" IN ('system', 'content', 'ops')),
  CONSTRAINT "ops_operation_logs_client_ip_source_check"
    CHECK ("client_ip_source" IN ('socket', 'x-forwarded-for', 'unavailable')),
  CONSTRAINT "ops_operation_logs_action_shape_check"
    CHECK (
      btrim("action") <> ''
      AND btrim("target_type") <> ''
      AND char_length("target_type") <= 512
      AND split_part("action", ':', 1) = "module"
      AND split_part("action", ':', 2) = "target_type"
      AND btrim(split_part("action", ':', 3)) <> ''
      AND "action" = "module" || ':' || "target_type" || ':' || split_part("action", ':', 3)
    ),
  CONSTRAINT "ops_operation_logs_http_status_check"
    CHECK ("http_status" BETWEEN 100 AND 599),
  CONSTRAINT "ops_operation_logs_duration_check"
    CHECK ("duration_ms" >= 0),
  CONSTRAINT "ops_operation_logs_result_status_check"
    CHECK (
      ("result" = 'success' AND "http_status" BETWEEN 200 AND 299)
      OR ("result" = 'failure' AND "http_status" NOT BETWEEN 200 AND 299)
    ),
  CONSTRAINT "ops_operation_logs_actor_snapshot_check"
    CHECK (
      btrim("actor_username") <> ''
      AND char_length("actor_username") <= 512
      AND btrim("actor_nickname") <> ''
      AND char_length("actor_nickname") <= 512
    ),
  CONSTRAINT "ops_operation_logs_target_check"
    CHECK (
      ("target_key" IS NULL OR (btrim("target_key") <> '' AND char_length("target_key") <= 512))
      AND ("target_label" IS NULL OR (btrim("target_label") <> '' AND char_length("target_label") <= 512))
      AND ("target_key" IS NOT NULL OR "target_label" IS NOT NULL)
    ),
  CONSTRAINT "ops_operation_logs_user_agent_length_check"
    CHECK ("user_agent" IS NULL OR char_length("user_agent") <= 512)
);
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_created_at_id_idx"
  ON "ops_operation_logs" ("created_at", "id");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_actor_user_id_idx"
  ON "ops_operation_logs" ("actor_user_id");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_actor_session_id_idx"
  ON "ops_operation_logs" ("actor_session_id");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_module_action_idx"
  ON "ops_operation_logs" ("module", "action");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_result_idx"
  ON "ops_operation_logs" ("result");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_http_status_idx"
  ON "ops_operation_logs" ("http_status");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_target_type_target_key_idx"
  ON "ops_operation_logs" ("target_type", "target_key");
--> statement-breakpoint
CREATE INDEX "ops_operation_logs_client_ip_idx"
  ON "ops_operation_logs" ("client_ip");
--> statement-breakpoint
CREATE UNIQUE INDEX "ops_operation_logs_request_id_unique"
  ON "ops_operation_logs" ("request_id");
--> statement-breakpoint

INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000320', '10000000-0000-4000-8000-000000000300', 'menu', '操作日志', 'ops:operation-log', '/ops/operation-logs', NULL, 'self', 'lucide:scroll-text', false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000321', '10000000-0000-4000-8000-000000000320', 'action', '查看操作日志', 'ops:operation-log:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now());
