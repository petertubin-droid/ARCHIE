-- Remove em-dashes from learn article content (user request 2026-09-07).
-- The 55 rewritten templated articles used ' — ' as a stylistic separator
-- (2,117 occurrences total). Headings get ': ', prose gets ', '.
-- Idempotent: second run finds no em-dashes and is a no-op.
UPDATE learn_articles
SET content = replace(
      regexp_replace(content, '(#{2,6}[^—\n]{0,255}?) — ', '\1: ', 'g'),
      ' — ', ', '),
    updated_at = now()
WHERE content LIKE '%—%';
