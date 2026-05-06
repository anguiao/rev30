INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000000', NULL, 'directory', '系统管理', 'system', NULL, NULL, 'self', 'lucide:settings', false, 1, 0, now(), now()),
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000000', 'menu', '用户管理', 'system:user', '/system/users', NULL, 'self', 'lucide:users', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'action', '查看用户', 'system:user:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000010', 'action', '创建用户', 'system:user:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', 'action', '更新用户', 'system:user:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', 'action', '删除用户', 'system:user:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000000', 'menu', '部门管理', 'system:department', '/system/departments', NULL, 'self', 'lucide:building-2', false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000020', 'action', '查看部门', 'system:department:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000020', 'action', '创建部门', 'system:department:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000020', 'action', '更新部门', 'system:department:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000020', 'action', '删除部门', 'system:department:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000000', 'menu', '角色管理', 'system:role', '/system/roles', NULL, 'self', 'lucide:shield-check', false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000030', 'action', '查看角色', 'system:role:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000030', 'action', '创建角色', 'system:role:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000030', 'action', '更新角色', 'system:role:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000030', 'action', '删除角色', 'system:role:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000000', 'menu', '资源管理', 'system:resource', '/system/resources', NULL, 'self', 'lucide:blocks', false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000040', 'action', '查看资源', 'system:resource:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000040', 'action', '创建资源', 'system:resource:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000040', 'action', '更新资源', 'system:resource:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000040', 'action', '删除资源', 'system:resource:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles"
  ("id", "name", "code", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('20000000-0000-4000-8000-000000000000', 'Administrator', 'admin', 1, 0, now(), now())
ON CONFLICT ("code") DO NOTHING;
