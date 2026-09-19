/*
# Fix broken palette images (404s from Pexels)

Updates existing color_combinations rows in place by slug.
Applies regardless of which seed migration originally inserted the row.
*/

update public.color_combinations set image_url = 'https://images.pexels.com/photos/6969833/pexels-photo-6969833.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'forest-retreat';

update public.color_combinations set image_url = 'https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'mediterranean-blue';

update public.color_combinations set image_url = 'https://images.pexels.com/photos/19980253/pexels-photo-19980253.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'classic-traditional';

update public.color_combinations set image_url = 'https://images.pexels.com/photos/20036266/pexels-photo-20036266.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'sunset-glow';

update public.color_combinations set image_url = 'https://images.pexels.com/photos/6489117/pexels-photo-6489117.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'soft-neutrals';

update public.color_combinations set image_url = 'https://images.pexels.com/photos/15586308/pexels-photo-15586308.jpeg?auto=compress&cs=tinysrgb&w=1200'
  where slug = 'stone-and-moss';
