/*
# Phase 8: Seed 20 expanded color combinations with full palette fields

Each palette includes primary, secondary, accent, trim, ceiling, door colors,
recommended rooms, style, property type, and featured/trending flags.
*/

do $$
declare
  cat_living uuid; cat_bedroom uuid; cat_kitchen uuid; cat_exterior uuid;
  cat_modern uuid; cat_luxury uuid; cat_neutral uuid; cat_warm uuid; cat_bold uuid;
  cat_contemporary uuid; cat_traditional uuid; cat_cool uuid; cat_office uuid;
  cat_dining uuid; cat_bathroom uuid; cat_accent uuid; cat_earth uuid; cat_nature uuid;
  cat_white uuid; cat_gray uuid; cat_blue uuid; cat_green uuid;
begin
  select id into cat_living from public.color_categories where slug='living-room-colors';
  select id into cat_bedroom from public.color_categories where slug='bedroom-colors';
  select id into cat_kitchen from public.color_categories where slug='kitchen-colors';
  select id into cat_exterior from public.color_categories where slug='exterior-wall-colors';
  select id into cat_modern from public.color_categories where slug='modern-colors';
  select id into cat_luxury from public.color_categories where slug='luxury-colors';
  select id into cat_neutral from public.color_categories where slug='neutral-colors';
  select id into cat_warm from public.color_categories where slug='warm-colors';
  select id into cat_bold from public.color_categories where slug='accent-colors';
  select id into cat_contemporary from public.color_categories where slug='contemporary-colors';
  select id into cat_traditional from public.color_categories where slug='traditional-colors';
  select id into cat_cool from public.color_categories where slug='cool-colors';
  select id into cat_office from public.color_categories where slug='office-colors';
  select id into cat_dining from public.color_categories where slug='dining-room-colors';
  select id into cat_bathroom from public.color_categories where slug='bathroom-colors';
  select id into cat_accent from public.color_categories where slug='accent-colors';
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
    ('Serene Living','serene-living','A calming blend of soft neutrals with a muted blue accent for airy living spaces.','Warm White','#F5F1E8','Soft Greige','#D9D2C5','Muted Blue','#7B9EA8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','White Trim','#FFFFFF','{Living Room,Hallway}','Modern Minimalist','https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_neutral,cat_modern],true,1,true,true,true,90,'Residential'),
    ('Coastal Calm','coastal-calm','Crisp whites paired with sandy beige and a gentle seafoam green for a breezy coastal mood.','Crisp White','#FAFAFA','Sandy Beige','#E4D9C8','Seafoam Green','#A8C9B6','White Trim','#FFFFFF','Ceiling White','#FCFCFA','White Door','#F5F5F0','{Living Room,Bedroom}','Coastal','https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bedroom,cat_neutral],true,2,true,true,true,85,'Residential'),
    ('Soft Sand','soft-sand','Warm sandy tones layered with cream and a subtle terracotta highlight.','Sand','#E3D5B5','Cream','#F8F0DE','Terracotta','#C97B5A','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Cream Door','#F2EBDC','{Bedroom,Living Room}','Warm Family Home','https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_warm,cat_neutral],true,3,true,false,false,75,'Residential'),
    ('Terracotta Dream','terracotta-dream','Earthy terracotta with deep cream and a forest green accent for a grounded, organic look.','Terracotta','#C97B5A','Deep Cream','#EDE0C8','Forest Green','#2C4A3E','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Forest Door','#2C4A3E','{Kitchen,Dining,Living Room}','Earth Inspired','https://images.pexels.com/photos/276583/pexels-photo-276583.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_kitchen,cat_warm,cat_bold,cat_earth],true,4,true,false,true,80,'Residential'),
    ('Forest Retreat','forest-retreat','Deep forest green balanced with warm off-white and a brass accent for a sophisticated mood.','Forest Green','#2C4A3E','Off-White','#EFEAE0','Brass','#C9A86A','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Forest Door','#2C4A3E','{Bedroom,Study}','Modern Luxury','https://images.pexels.com/photos/6969833/pexels-photo-6969833.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_bedroom,cat_luxury,cat_bold,cat_green],true,5,true,true,true,82,'Residential'),
    ('Midnight Luxe','midnight-luxe','Deep navy paired with charcoal and a soft gold accent for a refined, contemporary feel.','Midnight Navy','#1B2A41','Charcoal','#3A3A3A','Soft Gold','#C9A86A','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Door','#1B2A41','{Living Room,Dining}','Luxury Black','https://images.pexels.com/photos/1571463/pexels-photo-1571463.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_luxury,cat_bold,cat_blue],true,6,true,true,true,88,'Premium Residential'),
    ('Modern Cream Kitchen','modern-cream-kitchen','Clean cream cabinetry with matte black accents and a soft sage wall for a modern kitchen.','Cream','#F2EBDC','Soft Sage','#B8C5A6','Matte Black','#0A0A0A','Black Trim','#0A0A0A','Ceiling White','#FCFCFA','Black Door','#0A0A0A','{Kitchen}','Modern Minimalist','https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_kitchen,cat_modern,cat_neutral],true,7,true,true,false,78,'Residential'),
    ('Warm Exterior Stone','warm-exterior-stone','Natural stone tones with crisp white trims and a deep olive accent for welcoming facades.','Stone','#C9B79C','Crisp White','#F4F1EA','Deep Olive','#5B5A3F','White Trim','#FFFFFF','—','—','Forest Door','#2C4A3E','{Exterior,Entry}','Mediterranean','https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_exterior,cat_warm,cat_neutral,cat_earth],true,8,false,false,true,72,'Residential'),
    ('Modern Exterior Charcoal','modern-exterior-charcoal','Bold charcoal cladding with warm wood tones and crisp white for a striking modern facade.','Charcoal','#3A3A3A','Warm Wood','#A07855','Crisp White','#F0F0F0','White Trim','#FFFFFF','—','—','Black Door','#0A0A0A','{Exterior}','Urban Contemporary','https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_exterior,cat_modern,cat_bold,cat_gray],true,9,false,true,true,80,'Modern Residential'),
    ('Scandinavian White','scandinavian-white','Pure whites with light oak warmth and a soft gray accent for a clean Nordic aesthetic.','Pure White','#FFFFFF','Light Oak','#D4B896','Light Gray','#D3D3D3','White Trim','#FFFFFF','Ceiling White','#FCFCFA','White Door','#F5F5F0','{Living Room,Bedroom,Office}','Scandinavian','https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bedroom,cat_modern,cat_white],true,10,true,true,false,75,'Residential'),
    ('Farmhouse Warmth','farmhouse-warmth','Warm white walls with rich barn red accents and deep brown trim for a cozy farmhouse feel.','Warm White','#F5F1E8','Barn Red','#7C1C1C','Saddle Brown','#8B4513','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Colonial Red','#7B1E1E','{Living Room,Kitchen,Hallway}','Farmhouse','https://images.pexels.com/photos/2089698/pexels-photo-2089698.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_kitchen,cat_traditional,cat_warm],true,11,true,false,false,70,'Residential'),
    ('Mediterranean Blue','mediterranean-blue','Whitewashed walls with deep ocean blue accents and terracotta trim for a Mediterranean villa feel.','Whitewash','#F5F5F0','Ocean Blue','#1B3A5C','Terracotta','#C97B5A','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Door','#1B2A41','{Living Room,Dining,Exterior}','Mediterranean','https://images.pexels.com/photos/1285625/pexels-photo-1285625.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_exterior,cat_cool,cat_blue],true,12,true,false,true,72,'Mediterranean'),
    ('Industrial Edge','industrial-edge','Charcoal walls with warm wood and matte black accents for a modern industrial loft.','Charcoal','#3A3A3A','Warm Wood','#A07855','Matte Black','#0A0A0A','Black Trim','#0A0A0A','Ceiling White','#FCFCFA','Black Door','#0A0A0A','{Living Room,Office,Loft}','Industrial','https://images.pexels.com/photos/808465/pexels-photo-808465.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_office,cat_modern,cat_gray],true,13,true,false,false,68,'Urban Loft'),
    ('Classic Traditional','classic-traditional','Timeless cream walls with burgundy accents and rich walnut trim for a classic home.','Traditional Cream','#F5F1E8','Burgundy','#4A0E0E','Walnut','#5C4A32','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Mahogany','#4E2A14','{Living Room,Dining,Study}','Classic Traditional','https://images.pexels.com/photos/19980253/pexels-photo-19980253.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_dining,cat_traditional,cat_warm],true,14,true,false,false,65,'Traditional'),
    ('Elegant White','elegant-white','Layered whites with soft pearl and a subtle champagne accent for a timeless, airy elegance.','Pure White','#FFFFFF','Pearl White','#F8F8F0','Champagne','#E3D5B5','White Trim','#FFFFFF','Ceiling White','#FCFCFA','White Door','#F5F5F0','{Living Room,Dining,Bedroom}','Elegant White','https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_white,cat_luxury,cat_neutral],true,15,true,true,false,78,'Premium Residential'),
    ('Executive Gray','executive-gray','Sophisticated cool gray with deep navy and crisp white trim for a professional office.','Cool Gray','#909090','Navy Blue','#1B2A41','Crisp White','#FFFFFF','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Door','#1B2A41','{Office,Study,Living Room}','Executive Gray','https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_office,cat_gray,cat_cool,cat_blue],true,16,true,false,true,72,'Commercial'),
    ('Tropical Paradise','tropical-paradise','Lush palm green with warm bamboo and a coral accent for a vibrant tropical mood.','Palm Green','#4A7C3F','Bamboo','#C19A6B','Coral','#FF7F50','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Forest Door','#2C4A3E','{Living Room,Bathroom,Exterior}','Tropical','https://images.pexels.com/photos/240673/pexels-photo-240673.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bathroom,cat_exterior,cat_green],true,17,true,false,false,65,'Tropical'),
    ('Premium Commercial','premium-commercial','Professional navy with silver gray and crisp white for a polished corporate environment.','Navy Blue','#1B2A41','Silver Gray','#C0C0C0','Crisp White','#FFFFFF','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Navy Door','#1B2A41','{Office,Reception,Commercial}','Premium Commercial','https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_office,cat_blue,cat_gray,cat_contemporary],true,18,true,false,false,68,'Commercial'),
    ('Warm Family Home','warm-family-home','Soft warm greige with sandy beige and a muted terracotta accent for a welcoming family space.','Warm Greige','#D9D2C5','Sandy Beige','#E4D9C8','Terracotta','#C97B5A','White Trim','#FFFFFF','Ceiling Cream','#F8F8F0','Cream Door','#F2EBDC','{Living Room,Bedroom,Kitchen}','Warm Family Home','https://images.pexels.com/photos/1648776/pexels-photo-1648776.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_bedroom,cat_kitchen,cat_warm,cat_neutral],true,19,true,false,false,72,'Family Residential'),
    ('Urban Contemporary','urban-contemporary','Bold charcoal with crisp white and a muted blue accent for a sleek urban apartment.','Charcoal','#3A3A3A','Crisp White','#FAFAFA','Muted Blue','#7B9EA8','White Trim','#FFFFFF','Ceiling White','#FCFCFA','Black Door','#0A0A0A','{Living Room,Bedroom,Office}','Urban Contemporary','https://images.pexels.com/photos/808465/pexels-photo-808465.jpeg?auto=compress&cs=tinysrgb&w=1200',array[cat_living,cat_modern,cat_gray,cat_blue],true,20,true,true,false,75,'Urban Apartment')
  on conflict (slug) do nothing;
end $$;