CREATE TABLE "auth_login_attempt_buckets" (
	"username" text PRIMARY KEY NOT NULL,
	"failed_count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"last_failed_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_locked_until_idx" ON "auth_login_attempt_buckets" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_window_started_at_idx" ON "auth_login_attempt_buckets" USING btree ("window_started_at");