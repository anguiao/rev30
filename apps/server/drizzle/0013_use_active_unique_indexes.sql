DROP INDEX "system_departments_code_unique";--> statement-breakpoint
DROP INDEX "system_resources_code_unique";--> statement-breakpoint
DROP INDEX "system_roles_code_unique";--> statement-breakpoint
DROP INDEX "system_users_username_unique";--> statement-breakpoint
DROP INDEX "system_users_email_unique";--> statement-breakpoint
DROP INDEX "system_users_phone_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "system_departments_code_unique" ON "system_departments" USING btree ("code") WHERE "system_departments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_resources_code_unique" ON "system_resources" USING btree ("code") WHERE "system_resources"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_roles_code_unique" ON "system_roles" USING btree ("code") WHERE "system_roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_username_unique" ON "system_users" USING btree ("username") WHERE "system_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_email_unique" ON "system_users" USING btree ("email") WHERE "system_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "system_users_phone_unique" ON "system_users" USING btree ("phone") WHERE "system_users"."deleted_at" IS NULL;