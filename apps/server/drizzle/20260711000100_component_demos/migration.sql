INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000200', NULL, 'directory', '组件演示', 'demo', NULL, NULL, 'self', 'lucide:layout-template', false, 1, 200, now(), now()),
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000200', 'menu', '富文本', 'demo:rich-text', '/demos/rich-text', NULL, 'self', 'lucide:file-pen-line', false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000201', 'action', '预览富文本', 'demo:rich-text:preview', NULL, NULL, 'self', NULL, false, 1, 10, now(), now());
