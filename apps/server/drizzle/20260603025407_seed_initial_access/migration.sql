INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000000', NULL, 'directory', '系统管理', 'system', NULL, NULL, 'self', 'lucide:settings', false, 1, 0, now(), now()),
  ('10000000-0000-4000-8000-000000000100', NULL, 'directory', '内容管理', 'content', NULL, NULL, 'self', 'lucide:layout-list', false, 1, 100, now(), now());
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000000', 'menu', '系统用户', 'system:user', '/system/users', NULL, 'self', 'lucide:users', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000000', 'menu', '组织部门', 'system:department', '/system/departments', NULL, 'self', 'lucide:building-2', false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000000', 'menu', '系统角色', 'system:role', '/system/roles', NULL, 'self', 'lucide:shield-check', false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000000', 'menu', '权限资源', 'system:resource', '/system/resources', NULL, 'self', 'lucide:blocks', false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000050', '10000000-0000-4000-8000-000000000000', 'menu', '系统配置', 'system:config', '/system/configs', NULL, 'self', 'lucide:sliders-horizontal', false, 1, 50, now(), now()),
  ('10000000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000000', 'menu', '数据字典', 'system:dictionary', '/system/dictionaries', NULL, 'self', 'lucide:book-open-text', false, 1, 60, now(), now()),
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000100', 'menu', '通知公告', 'content:announcement', '/content/announcements', NULL, 'self', 'lucide:megaphone', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000106', '10000000-0000-4000-8000-000000000100', 'menu', '附件资源', 'content:attachment', '/content/attachments', NULL, 'self', 'lucide:files', false, 1, 20, now(), now());
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'action', '查看系统用户', 'system:user:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000010', 'action', '创建系统用户', 'system:user:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', 'action', '更新系统用户', 'system:user:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', 'action', '删除系统用户', 'system:user:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000010', 'action', '重置密码', 'system:user:reset-password', NULL, NULL, 'self', NULL, false, 1, 50, now(), now()),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000020', 'action', '查看组织部门', 'system:department:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000020', 'action', '创建组织部门', 'system:department:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000020', 'action', '更新组织部门', 'system:department:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000020', 'action', '删除组织部门', 'system:department:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000030', 'action', '查看系统角色', 'system:role:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000032', '10000000-0000-4000-8000-000000000030', 'action', '创建系统角色', 'system:role:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000033', '10000000-0000-4000-8000-000000000030', 'action', '更新系统角色', 'system:role:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000034', '10000000-0000-4000-8000-000000000030', 'action', '删除系统角色', 'system:role:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000041', '10000000-0000-4000-8000-000000000040', 'action', '查看权限资源', 'system:resource:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000040', 'action', '创建权限资源', 'system:resource:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000043', '10000000-0000-4000-8000-000000000040', 'action', '更新权限资源', 'system:resource:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000044', '10000000-0000-4000-8000-000000000040', 'action', '删除权限资源', 'system:resource:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000051', '10000000-0000-4000-8000-000000000050', 'action', '查看系统配置', 'system:config:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000053', '10000000-0000-4000-8000-000000000050', 'action', '更新系统配置', 'system:config:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000061', '10000000-0000-4000-8000-000000000060', 'action', '查看数据字典', 'system:dictionary:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000062', '10000000-0000-4000-8000-000000000060', 'action', '创建数据字典', 'system:dictionary:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000063', '10000000-0000-4000-8000-000000000060', 'action', '更新数据字典', 'system:dictionary:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000064', '10000000-0000-4000-8000-000000000060', 'action', '删除数据字典', 'system:dictionary:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000101', 'action', '查看通知公告', 'content:announcement:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000101', 'action', '创建通知公告', 'content:announcement:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000101', 'action', '更新通知公告', 'content:announcement:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000101', 'action', '删除通知公告', 'content:announcement:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000107', '10000000-0000-4000-8000-000000000106', 'action', '查看附件资源', 'content:attachment:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000108', '10000000-0000-4000-8000-000000000106', 'action', '删除附件资源', 'content:attachment:delete', NULL, NULL, 'self', NULL, false, 1, 20, now(), now());
--> statement-breakpoint
INSERT INTO "system_roles"
  ("id", "name", "code", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('20000000-0000-4000-8000-000000000000', 'Administrator', 'admin', 1, 0, now(), now());

--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000109', '10000000-0000-4000-8000-000000000100', 'menu', '图标库', 'content:icon-set', '/content/icon-sets', NULL, 'self', 'lucide:shapes', false, 1, 30, now(), now());
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000110', '10000000-0000-4000-8000-000000000109', 'action', '查看图标库', 'content:icon-set:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000111', '10000000-0000-4000-8000-000000000109', 'action', '创建图标集', 'content:icon-set:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000112', '10000000-0000-4000-8000-000000000109', 'action', '更新图标集', 'content:icon-set:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000113', '10000000-0000-4000-8000-000000000109', 'action', '删除图标集', 'content:icon-set:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000114', '10000000-0000-4000-8000-000000000109', 'action', '导出图标集', 'content:icon-set:export', NULL, NULL, 'self', NULL, false, 1, 50, now(), now());
