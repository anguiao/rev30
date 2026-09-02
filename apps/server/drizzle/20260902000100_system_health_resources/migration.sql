INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000327', '10000000-0000-4000-8000-000000000300', 'menu', '系统健康', 'ops:system-health', '/ops/system-health', NULL, 'self', 'lucide:heart-pulse', false, 1, 50, now(), now()),
  ('10000000-0000-4000-8000-000000000328', '10000000-0000-4000-8000-000000000327', 'action', '查看系统健康', 'ops:system-health:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now());
