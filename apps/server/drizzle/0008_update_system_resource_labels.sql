UPDATE "system_resources"
SET
  "name" = CASE
    WHEN "code" = 'system:user' THEN '系统用户'
    WHEN "code" = 'system:department' THEN '组织部门'
    WHEN "code" = 'system:role' THEN '系统角色'
    WHEN "code" = 'system:resource' THEN '权限资源'
    WHEN "code" = 'system:user:list' THEN '查看系统用户'
    WHEN "code" = 'system:user:create' THEN '创建系统用户'
    WHEN "code" = 'system:user:update' THEN '更新系统用户'
    WHEN "code" = 'system:user:delete' THEN '删除系统用户'
    WHEN "code" = 'system:department:list' THEN '查看组织部门'
    WHEN "code" = 'system:department:create' THEN '创建组织部门'
    WHEN "code" = 'system:department:update' THEN '更新组织部门'
    WHEN "code" = 'system:department:delete' THEN '删除组织部门'
    WHEN "code" = 'system:role:list' THEN '查看系统角色'
    WHEN "code" = 'system:role:create' THEN '创建系统角色'
    WHEN "code" = 'system:role:update' THEN '更新系统角色'
    WHEN "code" = 'system:role:delete' THEN '删除系统角色'
    WHEN "code" = 'system:resource:list' THEN '查看权限资源'
    WHEN "code" = 'system:resource:create' THEN '创建权限资源'
    WHEN "code" = 'system:resource:update' THEN '更新权限资源'
    WHEN "code" = 'system:resource:delete' THEN '删除权限资源'
    ELSE "name"
  END,
  "updated_at" = now()
WHERE
  ("code" = 'system:user' AND "name" = '用户管理')
  OR ("code" = 'system:department' AND "name" = '部门管理')
  OR ("code" = 'system:role' AND "name" = '角色管理')
  OR ("code" = 'system:resource' AND "name" = '资源管理')
  OR ("code" = 'system:user:list' AND "name" = '查看用户')
  OR ("code" = 'system:user:create' AND "name" = '创建用户')
  OR ("code" = 'system:user:update' AND "name" = '更新用户')
  OR ("code" = 'system:user:delete' AND "name" = '删除用户')
  OR ("code" = 'system:department:list' AND "name" = '查看部门')
  OR ("code" = 'system:department:create' AND "name" = '创建部门')
  OR ("code" = 'system:department:update' AND "name" = '更新部门')
  OR ("code" = 'system:department:delete' AND "name" = '删除部门')
  OR ("code" = 'system:role:list' AND "name" = '查看角色')
  OR ("code" = 'system:role:create' AND "name" = '创建角色')
  OR ("code" = 'system:role:update' AND "name" = '更新角色')
  OR ("code" = 'system:role:delete' AND "name" = '删除角色')
  OR ("code" = 'system:resource:list' AND "name" = '查看资源')
  OR ("code" = 'system:resource:create' AND "name" = '创建资源')
  OR ("code" = 'system:resource:update' AND "name" = '更新资源')
  OR ("code" = 'system:resource:delete' AND "name" = '删除资源');
