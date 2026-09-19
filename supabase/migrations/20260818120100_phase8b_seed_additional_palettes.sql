/*
# Phase 8b: Seed 30 additional curated color palettes
# Extends the existing 20 palettes to 50 total
*/

do $$
declare
  cat_living uuid;
  cat_bedroom uuid;
  cat_kitchen uuid;
  cat_bathroom uuid;
  cat_dining uuid;
  cat_office uuid;
  cat_exterior uuid;
  cat_accent uuid;
  cat_modern uuid;
  cat_luxury uuid;
  cat_neutral uuid;
  cat_warm uuid;
  cat_cool uuid;
  cat_traditional uuid;
  cat_contemporary uuid;
  cat_earth uuid;
  cat_nature uuid;
  cat_white uuid;
  cat_gray uuid;
  cat_blue uuid;
  cat_green uuid;
begin
  select id into cat_living from public.color_categories where slug='living-room-colors';
  select id into cat_bedroom from public.color_categories where slug='bedroom-colors';
  select id into cat_kitchen from public.color_categories where slug='kitchen-colors';
  select id into cat_bathroom from public.color_categories where slug='bathroom-colors';
  select id into cat_dining from public.color_categories where slug='dining-room-colors';
  select id into cat_office from public.color_categories where slug='office-colors';
  select id into cat_exterior from public.color_categories where slug='exterior-wall-colors';
  select id into cat_accent from public.color_categories where slug='accent-colors';
  select id into cat_modern from public.color_categories where slug='modern-colors';
  select id into cat_luxury from public.color_categories where slug='luxury-colors';
  select id into cat_neutral from public.color_categories where slug='neutral-colors';
  select id into cat_warm from public.color_categories where slug='warm-colors';
  select id into cat_cool from public.color_categories where slug='cool-colors';
  select id into cat_traditional from public.color_categories where slug='traditional-colors';
  select id into cat_contemporary from public.color_categories where slug='contemporary-colors';
  select id into cat_earth from public.color_categories where slug='earth-tone-collection';
  select id into cat_nature from public.color_categories where slug='nature-collection';
  select id into cat_white from public.color_categories where slug='white-collection';
  select id into cat_gray from public.color_categories where slug='gray-collection';
  select id into cat_blue from public.color_categories where slug='blue-collection';
  select id into cat_green from public.color_categories where slug='green-collection';

  insert into public.color_combinations
    (title, slug, description, main_color_name, main_color_code,
     secondary_color_name, secondary_color_code, accent_color_name, accent_color_code,
     trim_color_name, trim_color_code, ceiling_color_name, ceiling_color_code,
     door_color_name, door_color_code,
     recommended_rooms, style, image_url, category_ids, is_published, sort_order,
     is_interior, is_featured, is_trending, popularity_score, property_type)
  values
    ('Midnight Luxe','midnight-luxe','Deep navy walls with crisp white trim and a gold accent for a dramatic, luxurious bedroom.','Navy Blue','#1B2A41','Starlight White','#FCFCFA','Antique Gold','#C5A55A','Pure White','#FFFFFF','Starlight','#FCFCFA','Matte Black','#0A0A0A','{{Bedroom,Master Suite}}','Luxury Glam','https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_luxury,cat_modern],true,21,true,true,false,73,'Residential'),
    ('Desert Modern','desert-modern','Warm terracotta and sand tones balanced with deep olive green for a modern desert aesthetic.','Terracotta','#C97B5A','Desert Sand','#E3D5B5','Olive','#808000','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Walnut','#5C4A32','{{Living Room,Dining}}','Modern Desert','https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_warm,cat_modern],true,22,true,false,false,68,'Residential'),
    ('Nordic Calm','nordic-calm','Soft gray-blues with warm white and pale birch for a serene Scandinavian interior.','Muted Blue','#7B9EA8','Swan White','#FCFCFA','Birch Gray','#D3D3D3','White Trim','#FFFFFF','Snowfall','#FCFCFA','Light Oak','#D9D2C5','{{Living Room,Bedroom,Office}}','Scandinavian Minimal','https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_cool,cat_modern],true,23,true,true,true,67,'Residential'),
    ('Bold Statement','bold-statement','Deep charcoal walls with a vibrant coral accent and crisp white trim for a confident, modern look.','Charcoal','#3A3A3A','Warm White','#F5F1E8','Coral Red','#C75D4A','Pure White','#FFFFFF','Cloud White','#FCFCFA','Charcoal','#3A3A3A','{{Living Room,Dining,Accent}}','Modern Bold','https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_accent,cat_contemporary],true,24,true,false,false,67,'Residential'),
    ('Garden Retreat','garden-retreat','Fresh sage and forest green with warm cream for a calming, nature-inspired space.','Sage Green','#B8C5A6','Warm White','#F5F1E8','Forest Green','#2C4A3E','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Forest Green','#2C4A3E','{{Kitchen,Bedroom,Living Room}}','Nature Inspired','https://images.pexels.com/photos/1571463/pexels-photo-1571463.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_nature,cat_green],true,25,true,false,false,65,'Residential'),
    ('Rustic Charm','rustic-charm','Warm browns and tans with a cream base and burnt orange accent for a cozy, rustic feel.','Coffee','#6F4E37','Cream','#F8F0DE','Burnt Orange','#CC5500','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Espresso','#3E2723','{{Living Room,Dining,Library}}','Rustic Traditional','https://images.pexels.com/photos/6585758/pexels-photo-6585758.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_traditional,cat_earth],true,26,true,false,true,87,'Residential'),
    ('Urban Loft','urban-loft','Industrial grays with black accents and warm white for a sleek, modern urban space.','Gunmetal','#2A3439','Cloud White','#FCFCFA','Slate','#708090','White Trim','#FFFFFF','White','#FFFFFF','Matte Black','#0A0A0A','{{Living Room,Office,Loft}}','Industrial Modern','https://images.pexels.com/photos/271639/pexels-photo-271639.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_modern,cat_gray],true,27,true,false,false,83,'Residential'),
    ('Wine Cellar','wine-cellar','Deep burgundy with warm cream and dark walnut for a rich, intimate dining experience.','Burgundy','#5E2D3E','Deep Cream','#EDE0C8','Walnut','#5C4A32','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Walnut','#5C4A32','{{Dining Room,Library,Wine Room}}','Luxury Traditional','https://images.pexels.com/photos/3637740/pexels-photo-3637740.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_dining,cat_luxury,cat_traditional],true,28,true,false,true,89,'Residential'),
    ('Coastal Breeze','coastal-breeze','Light aqua and sand with crisp white for a fresh, airy coastal living room.','Aquamarine','#7FFFD4','Sandy Beige','#E4D9C8','Sky Blue','#87CEEB','Pure White','#FFFFFF','Ceiling White','#FCFCFA','White','#FFFFFF','{{Living Room,Bathroom}}','Coastal Breezy','https://images.pexels.com/photos/3637739/pexels-photo-3637739.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bathroom,cat_cool],true,29,true,true,false,75,'Residential'),
    ('Sunset Glow','sunset-glow','Warm peach and golden yellow with soft lavender for a romantic, sunset-inspired bedroom.','Peach','#FFCBA4','Golden Yellow','#FFD700','Lavender Mist','#E6E6FA','White Trim','#FFFFFF','Cloud White','#FCFCFA','Soft Pink','#FFB6C1','{{Bedroom,Master Suite}}','Romantic Warm','https://images.pexels.com/photos/20036266/pexels-photo-20036266.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_warm],true,30,true,false,false,89,'Residential'),
    ('Emerald City','emerald-city','Rich emerald green with gold accents and deep charcoal for a luxe, art-deco vibe.','Emerald','#2E8B57','Charcoal','#3A3A3A','Antique Gold','#C5A55A','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Charcoal','#3A3A3A','{{Living Room,Dining,Office}}','Art Deco Luxe','https://images.pexels.com/photos/1099817/pexels-photo-1099817.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_luxury,cat_contemporary],true,31,true,false,false,68,'Residential'),
    ('English Country','english-country','Soft sage and rose with warm cream for a charming, traditional English country home.','Sage Green','#B8C5A6','Cream','#F8F0DE','Dusty Rose','#DCAE96','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Sage Green','#B8C5A6','{{Living Room,Bedroom,Kitchen}}','English Country','https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_traditional,cat_green],true,32,true,false,false,73,'Residential'),
    ('Monochrome Elegance','monochrome-elegance','Layered grays from light to deep charcoal with white accents for a sophisticated, timeless look.','Stone Gray','#8C8C8C','Light Gray','#D3D3D3','Gunmetal','#2A3439','Pure White','#FFFFFF','Cloud White','#FCFCFA','Charcoal','#3A3A3A','{{Living Room,Office,Bedroom}}','Monochrome Modern','https://images.pexels.com/photos/32870/pexels-photo-32870.jpg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_gray,cat_modern],true,33,true,true,true,82,'Residential'),
    ('Mediterranean Blue','mediterranean-blue','Deep azure with warm terracotta and white for a sun-drenched Mediterranean villa feel.','Cobalt','#0047AB','Terracotta','#C97B5A','Pure White','#FFFFFF','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Cobalt','#0047AB','{{Exterior,Kitchen,Living Room}}','Mediterranean','https://images.pexels.com/photos/15586308/pexels-photo-15586308.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_blue,cat_exterior],true,34,true,false,true,67,'Residential'),
    ('Blush Botanics','blush-botanics','Soft blush pink with sage green and cream for a fresh, feminine, botanical-inspired space.','Blush','#F8E0E0','Sage Green','#B8C5A6','Cream','#F8F0DE','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Blush','#F8E0E0','{{Bedroom,Bathroom,Nursery}}','Botanical Soft','https://images.pexels.com/photos/3585750/pexels-photo-3585750.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_bathroom],true,35,true,false,true,84,'Residential'),
    ('Steel and Amber','steel-and-amber','Cool steel blue with warm amber and dark charcoal for a sophisticated, balanced modern space.','Steel Blue','#4682B4','Amber Glow','#FFBF00','Carbon','#161616','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Carbon','#161616','{{Living Room,Office,Dining}}','Modern Industrial','https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_office,cat_contemporary],true,36,true,true,false,71,'Residential'),
    ('Tuscan Sun','tuscan-sun','Warm ochre and terracotta with olive green and cream for a golden Tuscan landscape feel.','Ochre','#CC7722','Terracotta','#C97B5A','Olive','#808000','Cream','#F8F0DE','Ceiling Cream','#F8F8F0','Walnut','#5C4A32','{{Kitchen,Dining,Living Room}}','Tuscan Warm','https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_dining,cat_earth],true,37,true,true,false,72,'Residential'),
    ('Ocean Depths','ocean-depths','Layered teals and deep blue with sand and white for a moody, ocean-inspired retreat.','Teal','#008080','Ocean Blue','#1B3A5C','Sandy Beige','#E4D9C8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Blue','#1B2A41','{{Bathroom,Bedroom,Living Room}}','Ocean Moody','https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bathroom,cat_bedroom,cat_blue],true,38,true,true,true,92,'Residential'),
    ('Lavender Fields','lavender-fields','Soft lavender and sage with warm white for a calm, aromatic, Provençal-inspired space.','Lavender Mist','#E6E6FA','Sage Green','#B8C5A6','Warm White','#F5F1E8','White Trim','#FFFFFF','Cloud White','#FCFCFA','Lavender','#E6E6FA','{{Bedroom,Bathroom,Living Room}}','French Provincial','https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_living,cat_cool],true,39,true,false,false,73,'Residential'),
    ('Mocha Morning','mocha-morning','Rich mocha browns with warm cream and a touch of copper for a cozy, inviting kitchen.','Mocha','#6F4E37','Cream','#F8F0DE','Copper Brown','#B87333','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Mocha','#6F4E37','{{Kitchen,Breakfast,Living Room}}','Warm Cozy','https://images.pexels.com/photos/1571463/pexels-photo-1571463.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_warm],true,40,true,false,true,70,'Residential'),
    ('Purple Haze','purple-haze','Deep plum with soft lavender and warm gray for a moody, creative studio space.','Plum','#5C2E5A','Lavender Bliss','#E6E6FA','Smoke','#7D7D7D','White Trim','#FFFFFF','Cloud White','#FCFCFA','Plum','#5C2E5A','{{Bedroom,Studio,Office}}','Creative Moody','https://images.pexels.com/photos/6585758/pexels-photo-6585758.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_accent],true,41,true,false,false,73,'Residential'),
    ('Forest Cabin','forest-cabin','Deep forest green with warm cedar and cream for a cozy, woodsy cabin retreat.','Forest Green','#2C4A3E','Cedar Brown','#9B6E3E','Warm White','#F5F1E8','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Forest Green','#2C4A3E','{{Living Room,Cabin,Den}}','Cabin Cozy','https://images.pexels.com/photos/271639/pexels-photo-271639.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_nature,cat_green],true,42,true,true,false,67,'Residential'),
    ('Coral Reef','coral-reef','Vibrant coral with aqua and sand for a tropical, energetic, beach-inspired space.','Coral Red','#C75D4A','Aquamarine','#7FFFD4','Sandy Beige','#E4D9C8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Coral','#C75D4A','{{Bathroom,Kitchen,Children}}','Tropical Vibrant','https://images.pexels.com/photos/3637740/pexels-photo-3637740.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bathroom,cat_kitchen,cat_warm],true,43,true,true,false,88,'Residential'),
    ('Charcoal and Gold','charcoal-and-gold','Deep charcoal with antique gold and warm white for a sophisticated, modern luxe look.','Charcoal','#3A3A3A','Antique Gold','#C5A55A','Warm White','#F5F1E8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Charcoal','#3A3A3A','{{Dining,Living Room,Office}}','Modern Luxe','https://images.pexels.com/photos/3637739/pexels-photo-3637739.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_dining,cat_luxury,cat_modern],true,44,true,false,false,73,'Residential'),
    ('Soft Neutrals','soft-neutrals','Layered warm neutrals from cream to taupe for a timeless, versatile, calming space.','Warm Greige','#D9D2C5','Off White','#F5F5F0','Taupe','#8B8580','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Warm Greige','#D9D2C5','{{Living Room,Bedroom,Hallway}}','Neutral Calm','https://images.pexels.com/photos/20036266/pexels-photo-20036266.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_neutral,cat_bedroom],true,45,true,true,false,82,'Residential'),
    ('Berry Wine','berry-wine','Rich mulberry with soft pink and cream for a warm, berry-inspired dining space.','Mulberry','#5C2E5A','Soft Pink','#FFB6C1','Cream','#F8F0DE','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Mulberry','#5C2E5A','{{Dining Room,Bedroom}}','Berry Warm','https://images.pexels.com/photos/1099817/pexels-photo-1099817.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_dining,cat_bedroom,cat_warm],true,46,true,false,false,89,'Residential'),
    ('Modern Farmhouse','modern-farmhouse','Crisp white with warm gray and deep navy for a clean, modern farmhouse aesthetic.','Pure White','#FFFFFF','Warm Greige','#D9D2C5','Navy Blue','#1B2A41','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Blue','#1B2A41','{{Living Room,Kitchen,Hallway}}','Modern Farmhouse','https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_kitchen,cat_neutral],true,47,true,true,false,66,'Residential'),
    ('Desert Bloom','desert-bloom','Sandy beige with coral and sage for a warm, desert-inspired, blooming aesthetic.','Desert Sand','#E3D5B5','Coral Red','#C75D4A','Sage Green','#B8C5A6','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Terracotta','#C97B5A','{{Living Room,Bedroom,Patio}}','Desert Blooming','https://images.pexels.com/photos/32870/pexels-photo-32870.jpg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bedroom,cat_earth],true,48,true,true,false,67,'Residential'),
    ('Stone and Moss','stone-and-moss','Natural stone grays with fresh moss green for an earthy, grounding, natural space.','Stone Gray','#8C8C8C','Moss','#8A9A5B','Warm White','#F5F1E8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Stone Gray','#8C8C8C','{{Kitchen,Living Room,Garden}}','Natural Earthy','https://images.pexels.com/photos/15586308/pexels-photo-15586308.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_living,cat_nature],true,49,true,false,true,93,'Residential'),
    ('Cranberry and Sage','cranberry-and-sage','Deep cranberry with sage green and cream for a festive, warm, traditional holiday feel.','Cranberry','#9E1B32','Sage Green','#B8C5A6','Warm White','#F5F1E8','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Cranberry','#9E1B32','{{Dining Room,Living Room,Entry}}','Traditional Holiday','https://images.pexels.com/photos/3585750/pexels-photo-3585750.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_dining,cat_living,cat_traditional],true,50,true,true,false,80,'Residential')
  on conflict (slug) do nothing;
end $$;