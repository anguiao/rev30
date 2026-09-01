CREATE TABLE "ops_scheduled_jobs" (
  "task_key" text PRIMARY KEY NOT NULL,
  "cron_expression" text NOT NULL,
  "timezone" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "next_run_at" timestamptz,
  "active_run_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ops_scheduled_jobs_text_shape_check"
    CHECK (
      btrim("task_key") <> ''
      AND char_length("task_key") <= 128
      AND btrim("cron_expression") <> ''
      AND char_length("cron_expression") <= 128
      AND btrim("timezone") <> ''
      AND char_length("timezone") <= 128
    ),
  CONSTRAINT "ops_scheduled_jobs_enabled_next_run_at_check"
    CHECK (
      ("enabled" AND "next_run_at" IS NOT NULL)
      OR (NOT "enabled" AND "next_run_at" IS NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ops_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "task_key" text NOT NULL,
  "trigger_source" text NOT NULL,
  "status" text NOT NULL,
  "scheduled_for" timestamptz,
  "deleted_count" integer,
  "failed_count" integer,
  "error_category" text,
  "error_summary" text,
  "triggered_by_user_id" uuid,
  "triggered_by_username" text,
  "triggered_by_nickname" text,
  "cancel_requested_at" timestamptz,
  "cancel_requested_by_user_id" uuid,
  "cancel_requested_by_username" text,
  "cancel_requested_by_nickname" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "duration_ms" bigint,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ops_job_runs_trigger_source_check"
    CHECK ("trigger_source" IN ('scheduled', 'manual', 'recovery')),
  CONSTRAINT "ops_job_runs_status_check"
    CHECK ("status" IN ('running', 'success', 'failure', 'skipped', 'cancelled', 'interrupted')),
  CONSTRAINT "ops_job_runs_schedule_shape_check"
    CHECK (
      (
        "trigger_source" = 'scheduled'
        AND "scheduled_for" IS NOT NULL
      ) OR (
        "trigger_source" = 'manual'
        AND "scheduled_for" IS NULL
      ) OR (
        "trigger_source" = 'recovery'
      )
    ),
  CONSTRAINT "ops_job_runs_lifecycle_check"
    CHECK (
      (
        "status" = 'running'
        AND "started_at" IS NOT NULL
        AND "finished_at" IS NULL
        AND "duration_ms" IS NULL
      ) OR (
        "status" = 'skipped'
        AND "started_at" IS NULL
        AND "finished_at" IS NOT NULL
        AND "duration_ms" IS NULL
      ) OR (
        "status" = 'interrupted'
        AND "started_at" IS NOT NULL
        AND "finished_at" IS NOT NULL
        AND "duration_ms" IS NULL
      ) OR (
        "status" IN ('success', 'failure', 'cancelled')
        AND "started_at" IS NOT NULL
        AND "finished_at" IS NOT NULL
        AND "duration_ms" IS NOT NULL
        AND "duration_ms" BETWEEN 0 AND 9007199254740991
      )
    ),
  CONSTRAINT "ops_job_runs_result_check"
    CHECK (
      (
        "status" = 'success'
        AND "deleted_count" IS NOT NULL
        AND "deleted_count" >= 0
        AND "failed_count" IS NOT NULL
        AND "failed_count" = 0
        AND "error_category" IS NULL
        AND "error_summary" IS NULL
      ) OR (
        "status" = 'failure'
        AND ("deleted_count" IS NULL OR "deleted_count" >= 0)
        AND ("failed_count" IS NULL OR "failed_count" >= 0)
        AND "error_category" IS NOT NULL
        AND "error_category" IN ('partial_failure', 'database', 'storage', 'internal')
        AND "error_summary" IS NOT NULL
        AND btrim("error_summary") <> ''
        AND char_length("error_summary") <= 512
      ) OR (
        "status" = 'cancelled'
        AND ("deleted_count" IS NULL OR "deleted_count" >= 0)
        AND ("failed_count" IS NULL OR "failed_count" >= 0)
        AND "error_category" IS NULL
        AND "error_summary" IS NULL
      ) OR (
        "status" IN ('running', 'skipped', 'interrupted')
        AND "deleted_count" IS NULL
        AND "failed_count" IS NULL
        AND "error_category" IS NULL
        AND "error_summary" IS NULL
      )
    ),
  CONSTRAINT "ops_job_runs_trigger_actor_snapshot_check"
    CHECK (
      (
        "trigger_source" = 'manual'
        AND "triggered_by_user_id" IS NOT NULL
        AND "triggered_by_username" IS NOT NULL
        AND btrim("triggered_by_username") <> ''
        AND char_length("triggered_by_username") <= 512
        AND "triggered_by_nickname" IS NOT NULL
        AND btrim("triggered_by_nickname") <> ''
        AND char_length("triggered_by_nickname") <= 512
      ) OR (
        "trigger_source" <> 'manual'
        AND "triggered_by_user_id" IS NULL
        AND "triggered_by_username" IS NULL
        AND "triggered_by_nickname" IS NULL
      )
    ),
  CONSTRAINT "ops_job_runs_cancellation_check"
    CHECK (
      (
        "cancel_requested_at" IS NULL
        AND "cancel_requested_by_user_id" IS NULL
        AND "cancel_requested_by_username" IS NULL
        AND "cancel_requested_by_nickname" IS NULL
        AND "status" <> 'cancelled'
      ) OR (
        "cancel_requested_at" IS NOT NULL
        AND "status" IN ('running', 'cancelled', 'interrupted')
        AND "cancel_requested_by_user_id" IS NOT NULL
        AND "cancel_requested_by_username" IS NOT NULL
        AND btrim("cancel_requested_by_username") <> ''
        AND char_length("cancel_requested_by_username") <= 512
        AND "cancel_requested_by_nickname" IS NOT NULL
        AND btrim("cancel_requested_by_nickname") <> ''
        AND char_length("cancel_requested_by_nickname") <= 512
      )
    )
);
--> statement-breakpoint
ALTER TABLE "ops_job_runs"
  ADD CONSTRAINT "ops_job_runs_task_key_ops_scheduled_jobs_task_key_fk"
  FOREIGN KEY ("task_key") REFERENCES "ops_scheduled_jobs" ("task_key") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "ops_scheduled_jobs"
  ADD CONSTRAINT "ops_scheduled_jobs_active_run_id_ops_job_runs_id_fk"
  FOREIGN KEY ("active_run_id") REFERENCES "ops_job_runs" ("id") ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "ops_scheduled_jobs_enabled_next_run_at_task_key_idx"
  ON "ops_scheduled_jobs" ("enabled", "next_run_at", "task_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "ops_scheduled_jobs_active_run_id_unique"
  ON "ops_scheduled_jobs" ("active_run_id")
  WHERE "active_run_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "ops_job_runs_task_key_created_at_id_idx"
  ON "ops_job_runs" ("task_key", "created_at", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "ops_job_runs_task_key_running_unique"
  ON "ops_job_runs" ("task_key")
  WHERE "status" = 'running';
--> statement-breakpoint
CREATE INDEX "ops_job_runs_finished_at_idx"
  ON "ops_job_runs" ("finished_at");
--> statement-breakpoint
INSERT INTO "ops_scheduled_jobs"
  ("task_key", "cron_expression", "timezone", "enabled", "next_run_at", "active_run_id", "created_at", "updated_at")
VALUES
  ('auth-session-cleanup', '2 */6 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('auth-login-attempt-cleanup', '38 */6 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('ops-login-log-cleanup', '12 1,7,13,19 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('ops-operation-log-cleanup', '48 1,7,13,19 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('attachment-expired-upload-session-cleanup', '22 2,8,14,20 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('attachment-unreferenced-cleanup', '8 3,9,15,21 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('attachment-orphaned-storage-cleanup', '52 3,9,15,21 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now()),
  ('ops-job-run-cleanup', '28 4,10,16,22 * * *', 'Asia/Shanghai', true, now(), NULL, now(), now());
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000322', '10000000-0000-4000-8000-000000000300', 'menu', '定时任务', 'ops:scheduled-job', '/ops/scheduled-jobs', NULL, 'self', 'lucide:calendar-clock', false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000323', '10000000-0000-4000-8000-000000000322', 'action', '查看定时任务', 'ops:scheduled-job:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000324', '10000000-0000-4000-8000-000000000322', 'action', '修改定时任务', 'ops:scheduled-job:update', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000325', '10000000-0000-4000-8000-000000000322', 'action', '执行定时任务', 'ops:scheduled-job:execute', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000326', '10000000-0000-4000-8000-000000000322', 'action', '取消定时任务', 'ops:scheduled-job:cancel', NULL, NULL, 'self', NULL, false, 1, 40, now(), now());
