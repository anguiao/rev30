DROP TABLE "auth_refresh_tokens";
--> statement-breakpoint

CREATE TABLE "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "system_users"("id"),
  "refresh_token_hash" text NOT NULL,
  "created_ip" text,
  "created_ip_source" text DEFAULT 'unavailable' NOT NULL,
  "user_agent" text,
  "last_active_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "revocation_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "auth_sessions_created_ip_source_check" CHECK ("created_ip_source" IN ('socket', 'x-forwarded-for', 'unavailable')),
  CONSTRAINT "auth_sessions_revocation_check" CHECK (("revoked_at" IS NULL AND "revocation_reason" IS NULL) OR ("revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL AND "revocation_reason" IN ('logout', 'password_changed', 'password_reset', 'admin_forced', 'user_disabled', 'user_deleted')))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_unique" ON "auth_sessions" ("refresh_token_hash");
--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" ("expires_at");
--> statement-breakpoint
CREATE INDEX "auth_sessions_revoked_at_idx" ON "auth_sessions" ("revoked_at");
--> statement-breakpoint
CREATE INDEX "auth_sessions_last_active_at_idx" ON "auth_sessions" ("last_active_at");
--> statement-breakpoint

CREATE TABLE "ops_login_logs" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
  "user_id" uuid REFERENCES "system_users"("id"),
  "username" text NOT NULL,
  "result" text NOT NULL,
  "failure_reason" text,
  "session_id" uuid,
  "request_id" uuid NOT NULL,
  "client_ip" text,
  "client_ip_source" text NOT NULL,
  "user_agent" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ops_login_logs_client_ip_source_check" CHECK ("client_ip_source" IN ('socket', 'x-forwarded-for', 'unavailable')),
  CONSTRAINT "ops_login_logs_result_check" CHECK (("result" = 'success' AND "user_id" IS NOT NULL AND "session_id" IS NOT NULL AND "failure_reason" IS NULL) OR ("result" = 'failure' AND "session_id" IS NULL AND "failure_reason" IS NOT NULL AND "failure_reason" IN ('invalid_credentials', 'account_disabled', 'rate_limited')))
);
--> statement-breakpoint
CREATE INDEX "ops_login_logs_created_at_id_idx" ON "ops_login_logs" ("created_at", "id");
--> statement-breakpoint
CREATE INDEX "ops_login_logs_user_id_idx" ON "ops_login_logs" ("user_id");
--> statement-breakpoint
CREATE INDEX "ops_login_logs_username_idx" ON "ops_login_logs" ("username");
--> statement-breakpoint
CREATE INDEX "ops_login_logs_result_idx" ON "ops_login_logs" ("result");
--> statement-breakpoint
CREATE INDEX "ops_login_logs_client_ip_idx" ON "ops_login_logs" ("client_ip");
--> statement-breakpoint

UPDATE "system_resources" SET "status" = 1, "updated_at" = now()
WHERE "id" = '10000000-0000-4000-8000-000000000300';
--> statement-breakpoint

INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000300', 'menu', '登录日志', 'ops:login-log', '/ops/login-logs', NULL, 'self', 'lucide:log-in', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000301', 'action', '查看登录日志', 'ops:login-log:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000310', '10000000-0000-4000-8000-000000000300', 'menu', '在线会话', 'ops:online-session', '/ops/online-sessions', NULL, 'self', 'lucide:monitor', false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000311', '10000000-0000-4000-8000-000000000310', 'action', '查看在线会话', 'ops:online-session:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000312', '10000000-0000-4000-8000-000000000310', 'action', '强制下线', 'ops:online-session:revoke', NULL, NULL, 'self', NULL, false, 1, 20, now(), now());
--> statement-breakpoint
