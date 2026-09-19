/*
# Add unique constraint on recently_viewed_colors (user_id, color_id)

1. Security/Schema change:
   - Creates a unique index on (user_id, color_id) where user_id is not null.
   - This makes the upsert in trackColorView work correctly — when a logged-in
     user revisits a color, the existing row is updated instead of a duplicate
     being inserted.
   - For anonymous users (user_id is null), duplicates are acceptable since
     the query orders by viewed_at and limits results.
*/

CREATE UNIQUE INDEX IF NOT EXISTS recently_viewed_colors_user_color_unique
  ON public.recently_viewed_colors (user_id, color_id)
  WHERE user_id IS NOT NULL;
