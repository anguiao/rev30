ALTER TABLE "content_announcements" ADD COLUMN "visibility" text DEFAULT 'all' NOT NULL;
--> statement-breakpoint
ALTER TABLE "content_announcements" ALTER COLUMN "visibility" SET DEFAULT 'targeted';
--> statement-breakpoint
ALTER TABLE "content_announcements" ADD COLUMN "content_html" text;
--> statement-breakpoint
CREATE FUNCTION "rev30_escape_html"("value" text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(coalesce("value", ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;
--> statement-breakpoint
CREATE FUNCTION "rev30_escape_html_attr"("value" text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace("rev30_escape_html"("value"), '"', '&quot;')
$$;
--> statement-breakpoint
CREATE FUNCTION "rev30_is_safe_href"("href" text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce("href" ~* '^(https?:|mailto:|tel:|/|#)', false)
$$;
--> statement-breakpoint
CREATE FUNCTION "rev30_tiptap_node_html"("node" jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  "node_type" text := "node"->>'type';
  "child" jsonb;
  "child_html" text := '';
  "mark" jsonb;
  "result" text;
  "heading_level" int;
  "href" text;
  "target" text;
BEGIN
  IF "node" IS NULL THEN
    RETURN '';
  END IF;

  IF "node_type" = 'text' THEN
    "result" := "rev30_escape_html"("node"->>'text');

    FOR "mark" IN SELECT "value" FROM jsonb_array_elements(coalesce("node"->'marks', '[]'::jsonb))
    LOOP
      IF "mark"->>'type' = 'bold' THEN
        "result" := '<strong>' || "result" || '</strong>';
      ELSIF "mark"->>'type' = 'italic' THEN
        "result" := '<em>' || "result" || '</em>';
      ELSIF "mark"->>'type' = 'strike' THEN
        "result" := '<s>' || "result" || '</s>';
      ELSIF "mark"->>'type' = 'underline' THEN
        "result" := '<u>' || "result" || '</u>';
      ELSIF "mark"->>'type' = 'code' THEN
        "result" := '<code>' || "result" || '</code>';
      ELSIF "mark"->>'type' = 'link' THEN
        "href" := "mark"->'attrs'->>'href';

        IF "rev30_is_safe_href"("href") THEN
          "target" := "mark"->'attrs'->>'target';

          IF "target" = '_blank' THEN
            "result" := '<a href="' || "rev30_escape_html_attr"("href") || '" target="_blank" rel="noopener noreferrer">' || "result" || '</a>';
          ELSE
            "result" := '<a href="' || "rev30_escape_html_attr"("href") || '">' || "result" || '</a>';
          END IF;
        END IF;
      END IF;
    END LOOP;

    RETURN "result";
  END IF;

  FOR "child" IN SELECT "value" FROM jsonb_array_elements(coalesce("node"->'content', '[]'::jsonb))
  LOOP
    "child_html" := "child_html" || "rev30_tiptap_node_html"("child");
  END LOOP;

  IF "node_type" = 'doc' THEN
    RETURN "child_html";
  ELSIF "node_type" = 'paragraph' THEN
    RETURN '<p>' || "child_html" || '</p>';
  ELSIF "node_type" = 'heading' THEN
    "heading_level" := least(greatest(coalesce(("node"->'attrs'->>'level')::int, 1), 1), 6);

    RETURN '<h' || "heading_level" || '>' || "child_html" || '</h' || "heading_level" || '>';
  ELSIF "node_type" = 'bulletList' THEN
    RETURN '<ul>' || "child_html" || '</ul>';
  ELSIF "node_type" = 'orderedList' THEN
    RETURN '<ol>' || "child_html" || '</ol>';
  ELSIF "node_type" = 'listItem' THEN
    RETURN '<li>' || "child_html" || '</li>';
  ELSIF "node_type" = 'blockquote' THEN
    RETURN '<blockquote>' || "child_html" || '</blockquote>';
  ELSIF "node_type" = 'codeBlock' THEN
    RETURN '<pre><code>' || "child_html" || '</code></pre>';
  ELSIF "node_type" = 'hardBreak' THEN
    RETURN '<br>';
  ELSIF "node_type" = 'horizontalRule' THEN
    RETURN '<hr>';
  END IF;

  RETURN "child_html";
END;
$$;
--> statement-breakpoint
UPDATE "content_announcements"
SET "content_html" = coalesce(nullif("rev30_tiptap_node_html"("content_json"), ''), '<p>' || "rev30_escape_html"("content_text") || '</p>')
WHERE "content_html" IS NULL;
--> statement-breakpoint
DROP FUNCTION "rev30_tiptap_node_html"(jsonb);
--> statement-breakpoint
DROP FUNCTION "rev30_is_safe_href"(text);
--> statement-breakpoint
DROP FUNCTION "rev30_escape_html_attr"(text);
--> statement-breakpoint
DROP FUNCTION "rev30_escape_html"(text);
--> statement-breakpoint
ALTER TABLE "content_announcements" ALTER COLUMN "content_html" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE "content_announcement_targets" (
	"announcement_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_announcement_targets_announcement_id_target_type_target_id_pk" PRIMARY KEY("announcement_id","target_type","target_id"),
	CONSTRAINT "content_announcement_targets_announcement_id_content_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."content_announcements"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "content_announcements_visibility_idx" ON "content_announcements" USING btree ("visibility");
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_announcement_id_idx" ON "content_announcement_targets" USING btree ("announcement_id");
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_target_idx" ON "content_announcement_targets" USING btree ("target_type","target_id");
