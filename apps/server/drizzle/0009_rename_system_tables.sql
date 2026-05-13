ALTER TABLE "departments" RENAME TO "system_departments";--> statement-breakpoint
ALTER TABLE "role_resources" RENAME TO "system_role_resources";--> statement-breakpoint
ALTER TABLE "roles" RENAME TO "system_roles";--> statement-breakpoint
ALTER TABLE "user_departments" RENAME TO "system_user_departments";--> statement-breakpoint
ALTER TABLE "user_roles" RENAME TO "system_user_roles";--> statement-breakpoint
ALTER TABLE "users" RENAME TO "system_users";--> statement-breakpoint
ALTER TABLE "auth_password_credentials" DROP CONSTRAINT "auth_password_credentials_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" DROP CONSTRAINT "auth_refresh_tokens_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "system_departments" DROP CONSTRAINT "departments_parent_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "system_role_resources" DROP CONSTRAINT "role_resources_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "system_role_resources" DROP CONSTRAINT "role_resources_resource_id_system_resources_id_fk";
--> statement-breakpoint
ALTER TABLE "system_user_departments" DROP CONSTRAINT "user_departments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "system_user_departments" DROP CONSTRAINT "user_departments_department_id_departments_id_fk";
--> statement-breakpoint
ALTER TABLE "system_user_roles" DROP CONSTRAINT "user_roles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "system_user_roles" DROP CONSTRAINT "user_roles_role_id_roles_id_fk";
--> statement-breakpoint
DROP INDEX "departments_code_unique";--> statement-breakpoint
DROP INDEX "departments_parent_id_idx";--> statement-breakpoint
DROP INDEX "departments_status_idx";--> statement-breakpoint
DROP INDEX "role_resources_resource_id_idx";--> statement-breakpoint
DROP INDEX "roles_code_unique";--> statement-breakpoint
DROP INDEX "roles_status_idx";--> statement-breakpoint
DROP INDEX "user_departments_department_id_idx";--> statement-breakpoint
DROP INDEX "user_roles_role_id_idx";--> statement-breakpoint
DROP INDEX "users_username_unique";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "users_phone_unique";--> statement-breakpoint
ALTER TABLE "system_role_resources" DROP CONSTRAINT "role_resources_role_id_resource_id_pk";--> statement-breakpoint
ALTER TABLE "system_user_departments" DROP CONSTRAINT "user_departments_user_id_department_id_pk";--> statement-breakpoint
ALTER TABLE "system_user_roles" DROP CONSTRAINT "user_roles_user_id_role_id_pk";--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_role_id_resource_id_pk" PRIMARY KEY("role_id","resource_id");--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_user_id_department_id_pk" PRIMARY KEY("user_id","department_id");--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id");--> statement-breakpoint
ALTER TABLE "auth_password_credentials" ADD CONSTRAINT "auth_password_credentials_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_departments" ADD CONSTRAINT "system_departments_parent_id_system_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."system_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."system_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_role_resources" ADD CONSTRAINT "system_role_resources_resource_id_system_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."system_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_departments" ADD CONSTRAINT "system_user_departments_department_id_system_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."system_departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_user_roles" ADD CONSTRAINT "system_user_roles_role_id_system_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."system_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_departments_code_unique" ON "system_departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "system_departments_parent_id_idx" ON "system_departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "system_departments_status_idx" ON "system_departments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_role_resources_resource_id_idx" ON "system_role_resources" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_roles_code_unique" ON "system_roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "system_roles_status_idx" ON "system_roles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_user_departments_department_id_idx" ON "system_user_departments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "system_user_roles_role_id_idx" ON "system_user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_username_unique" ON "system_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_email_unique" ON "system_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_phone_unique" ON "system_users" USING btree ("phone");