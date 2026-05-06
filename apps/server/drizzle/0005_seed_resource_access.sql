INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000000', NULL, 'directory', '系统管理', 'system', NULL, NULL, 'self', 'lucide:settings', false, 1, 0, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000010', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '用户管理', 'system:user', '/system/users', NULL, 'self', 'lucide:users', false, 1, 10, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000011', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '查看用户', 'system:user:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000012', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '创建用户', 'system:user:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000013', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '更新用户', 'system:user:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000014', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '删除用户', 'system:user:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000020', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '部门管理', 'system:department', '/system/departments', NULL, 'self', 'lucide:building-2', false, 1, 20, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000021', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'), 'action', '查看部门', 'system:department:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000022', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'), 'action', '创建部门', 'system:department:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000023', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'), 'action', '更新部门', 'system:department:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000024', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'), 'action', '删除部门', 'system:department:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:department'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000030', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '角色管理', 'system:role', '/system/roles', NULL, 'self', 'lucide:shield-check', false, 1, 30, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000031', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'), 'action', '查看角色', 'system:role:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000032', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'), 'action', '创建角色', 'system:role:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000033', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'), 'action', '更新角色', 'system:role:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000034', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'), 'action', '删除角色', 'system:role:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:role'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000040', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '资源管理', 'system:resource', '/system/resources', NULL, 'self', 'lucide:blocks', false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000041', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'), 'action', '查看资源', 'system:resource:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000042', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'), 'action', '创建资源', 'system:resource:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000043', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'), 'action', '更新资源', 'system:resource:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000044', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'), 'action', '删除资源', 'system:resource:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:resource'),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "roles"
  ("id", "name", "code", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('20000000-0000-4000-8000-000000000000', 'Administrator', 'admin', 1, 0, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
