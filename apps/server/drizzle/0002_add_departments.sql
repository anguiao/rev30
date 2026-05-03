CREATE TABLE "departments" (
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
CREATE TABLE "user_departments" (
	"user_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_departments_user_id_department_id_pk" PRIMARY KEY("user_id","department_id")
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_departments" ADD CONSTRAINT "user_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_code_unique" ON "departments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "departments_parent_id_idx" ON "departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "departments_status_idx" ON "departments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_departments_department_id_idx" ON "user_departments" USING btree ("department_id");