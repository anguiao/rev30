CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"size" integer NOT NULL,
	"usage" text NOT NULL,
	"read_policy" text DEFAULT 'signed' NOT NULL,
	"checksum" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
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
CREATE TABLE "auth_password_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_announcement_targets" (
	"announcement_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_announcement_targets_announcement_id_target_type_target_id_pk" PRIMARY KEY("announcement_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "content_announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content_json" jsonb NOT NULL,
	"content_text" text NOT NULL,
	"content_html" text NOT NULL,
	"visibility" text DEFAULT 'targeted' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"group_code" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"value_type" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_departments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_dictionary_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_dictionary_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"path" text,
	"external_url" text,
	"open_target" text DEFAULT 'self' NOT NULL,
	"icon" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_role_resources" (
	"role_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_role_resources_role_id_resource_id_pk" PRIMARY KEY("role_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_user_departments" (
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_user_departments_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "system_user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"nickname" text NOT NULL,
	"avatar_id" uuid,
	"email" text,
	"phone" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_system_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_password_credentials" ADD CONSTRAINT "auth_password_credentials_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_announcement_targets" ADD CONSTRAINT "content_announcement_targets_announcement_id_content_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."content_announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_departments" ADD CONSTRAINT "system_departments_parent_id_system_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."system_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_dictionary_items" ADD CONSTRAINT "system_dictionary_items_type_id_system_dictionary_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."system_dictionary_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_resources" ADD CONSTRAINT "system_resources_parent_id_system_resources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."system_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."system_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_resource_id_system_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."system_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_department_id_system_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."system_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."system_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_avatar_id_attachments_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_unique" ON "attachments" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "attachments_created_by_created_at_idx" ON "attachments" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "attachments_usage_created_at_idx" ON "attachments" USING btree ("usage","created_at");--> statement-breakpoint
CREATE INDEX "attachments_deleted_at_idx" ON "attachments" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_locked_until_idx" ON "auth_login_attempt_buckets" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_window_started_at_idx" ON "auth_login_attempt_buckets" USING btree ("window_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_unique" ON "auth_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_user_id_idx" ON "auth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_expires_at_idx" ON "auth_refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_revoked_at_idx" ON "auth_refresh_tokens" USING btree ("revoked_at");--> statement-breakpoint
CREATE INDEX "content_announcement_targets_announcement_id_idx" ON "content_announcement_targets" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "content_announcement_targets_target_idx" ON "content_announcement_targets" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "content_announcements_type_idx" ON "content_announcements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "content_announcements_visibility_idx" ON "content_announcements" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "content_announcements_status_idx" ON "content_announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_announcements_pinned_idx" ON "content_announcements" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "content_announcements_published_at_idx" ON "content_announcements" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "system_configs_key_active_unique" ON "system_configs" USING btree ("key") WHERE "system_configs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_configs_group_code_idx" ON "system_configs" USING btree ("group_code");--> statement-breakpoint
CREATE INDEX "system_configs_value_type_idx" ON "system_configs" USING btree ("value_type");--> statement-breakpoint
CREATE INDEX "system_configs_status_idx" ON "system_configs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_departments_code_unique" ON "system_departments" USING btree ("code") WHERE "system_departments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_departments_parent_id_idx" ON "system_departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "system_departments_status_idx" ON "system_departments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_items_type_value_active_unique" ON "system_dictionary_items" USING btree ("type_id","value") WHERE "system_dictionary_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_items_type_id_idx" ON "system_dictionary_items" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "system_dictionary_items_status_idx" ON "system_dictionary_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_types_code_active_unique" ON "system_dictionary_types" USING btree ("code") WHERE "system_dictionary_types"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_types_status_idx" ON "system_dictionary_types" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_resources_code_unique" ON "system_resources" USING btree ("code") WHERE "system_resources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_resources_parent_id_idx" ON "system_resources" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "system_resources_type_idx" ON "system_resources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "system_resources_status_idx" ON "system_resources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_role_resources_resource_id_idx" ON "system_role_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_roles_code_unique" ON "system_roles" USING btree ("code") WHERE "system_roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_roles_status_idx" ON "system_roles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_user_departments_department_id_idx" ON "system_user_departments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "system_user_roles_role_id_idx" ON "system_user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_username_unique" ON "system_users" USING btree ("username") WHERE "system_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_email_unique" ON "system_users" USING btree ("email") WHERE "system_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_phone_unique" ON "system_users" USING btree ("phone") WHERE "system_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_users_avatar_id_idx" ON "system_users" USING btree ("avatar_id");
