CREATE TABLE "announcement_targets" (
	"announcement_id" uuid,
	"target_type" text,
	"target_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_targets_pkey" PRIMARY KEY("announcement_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
CREATE TABLE "attachment_references" (
	"attachment_id" uuid,
	"source_type" text,
	"source_id" uuid,
	"source_field" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_references_pkey" PRIMARY KEY("source_type","source_id","source_field","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"size" integer NOT NULL,
	"usage" text NOT NULL,
	"read_policy" text DEFAULT 'signed' NOT NULL,
	"cleanup_policy" text DEFAULT 'manual' NOT NULL,
	"checksum" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_login_attempt_buckets" (
	"username" text PRIMARY KEY,
	"failed_count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"last_failed_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_password_credentials" (
	"user_id" uuid PRIMARY KEY,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_icon_set_icons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"set_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"palette" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_icon_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_configs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"role_id" uuid,
	"resource_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_role_resources_pkey" PRIMARY KEY("role_id","resource_id")
);
--> statement-breakpoint
CREATE TABLE "system_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
	"user_id" uuid,
	"department_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_user_departments_pkey" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "system_user_roles" (
	"user_id" uuid,
	"role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_user_roles_pkey" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
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
CREATE INDEX "announcement_targets_announcement_id_idx" ON "announcement_targets" ("announcement_id");--> statement-breakpoint
CREATE INDEX "announcement_targets_target_idx" ON "announcement_targets" ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "announcements_type_idx" ON "announcements" ("type");--> statement-breakpoint
CREATE INDEX "announcements_visibility_idx" ON "announcements" ("visibility");--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" ("status");--> statement-breakpoint
CREATE INDEX "announcements_pinned_idx" ON "announcements" ("pinned");--> statement-breakpoint
CREATE INDEX "announcements_published_at_idx" ON "announcements" ("published_at");--> statement-breakpoint
CREATE INDEX "attachment_references_attachment_id_idx" ON "attachment_references" ("attachment_id");--> statement-breakpoint
CREATE INDEX "attachment_references_source_idx" ON "attachment_references" ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_unique" ON "attachments" ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "attachments_created_by_created_at_idx" ON "attachments" ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "attachments_usage_created_at_idx" ON "attachments" ("usage","created_at");--> statement-breakpoint
CREATE INDEX "attachments_cleanup_policy_created_at_idx" ON "attachments" ("cleanup_policy","created_at");--> statement-breakpoint
CREATE INDEX "attachments_deleted_at_idx" ON "attachments" ("deleted_at");--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_locked_until_idx" ON "auth_login_attempt_buckets" ("locked_until");--> statement-breakpoint
CREATE INDEX "auth_login_attempt_buckets_window_started_at_idx" ON "auth_login_attempt_buckets" ("window_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_refresh_tokens_token_hash_unique" ON "auth_refresh_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_user_id_idx" ON "auth_refresh_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_expires_at_idx" ON "auth_refresh_tokens" ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_revoked_at_idx" ON "auth_refresh_tokens" ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_icon_set_icons_set_name_active_unique" ON "custom_icon_set_icons" ("set_id","name") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "custom_icon_set_icons_set_id_idx" ON "custom_icon_set_icons" ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_icon_sets_prefix_active_unique" ON "custom_icon_sets" ("prefix") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_configs_key_active_unique" ON "system_configs" ("key") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_configs_group_code_idx" ON "system_configs" ("group_code");--> statement-breakpoint
CREATE INDEX "system_configs_value_type_idx" ON "system_configs" ("value_type");--> statement-breakpoint
CREATE INDEX "system_configs_status_idx" ON "system_configs" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_departments_code_unique" ON "system_departments" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_departments_parent_id_idx" ON "system_departments" ("parent_id");--> statement-breakpoint
CREATE INDEX "system_departments_status_idx" ON "system_departments" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_items_type_value_active_unique" ON "system_dictionary_items" ("type_id","value") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_items_type_id_idx" ON "system_dictionary_items" ("type_id");--> statement-breakpoint
CREATE INDEX "system_dictionary_items_status_idx" ON "system_dictionary_items" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_types_code_active_unique" ON "system_dictionary_types" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_types_status_idx" ON "system_dictionary_types" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_resources_code_unique" ON "system_resources" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_resources_parent_id_idx" ON "system_resources" ("parent_id");--> statement-breakpoint
CREATE INDEX "system_resources_type_idx" ON "system_resources" ("type");--> statement-breakpoint
CREATE INDEX "system_resources_status_idx" ON "system_resources" ("status");--> statement-breakpoint
CREATE INDEX "system_role_resources_resource_id_idx" ON "system_role_resources" ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_roles_code_unique" ON "system_roles" ("code") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_roles_status_idx" ON "system_roles" ("status");--> statement-breakpoint
CREATE INDEX "system_user_departments_department_id_idx" ON "system_user_departments" ("department_id");--> statement-breakpoint
CREATE INDEX "system_user_roles_role_id_idx" ON "system_user_roles" ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_username_unique" ON "system_users" ("username") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_email_unique" ON "system_users" ("email") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_phone_unique" ON "system_users" ("phone") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_users_avatar_id_idx" ON "system_users" ("avatar_id");--> statement-breakpoint
ALTER TABLE "announcement_targets" ADD CONSTRAINT "announcement_targets_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_system_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "system_users"("id");--> statement-breakpoint
ALTER TABLE "auth_password_credentials" ADD CONSTRAINT "auth_password_credentials_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "system_users"("id");--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "system_users"("id");--> statement-breakpoint
ALTER TABLE "custom_icon_set_icons" ADD CONSTRAINT "custom_icon_set_icons_set_id_custom_icon_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "custom_icon_sets"("id");--> statement-breakpoint
ALTER TABLE "system_departments" ADD CONSTRAINT "system_departments_parent_id_system_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "system_departments"("id");--> statement-breakpoint
ALTER TABLE "system_dictionary_items" ADD CONSTRAINT "system_dictionary_items_type_id_system_dictionary_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "system_dictionary_types"("id");--> statement-breakpoint
ALTER TABLE "system_resources" ADD CONSTRAINT "system_resources_parent_id_system_resources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "system_resources"("id");--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "system_roles"("id");--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_resource_id_system_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "system_resources"("id");--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "system_users"("id");--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_department_id_system_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "system_departments"("id");--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "system_users"("id");--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "system_roles"("id");--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_avatar_id_attachments_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "attachments"("id");