import { supabase, isSupabaseConfigured, supabaseWithClientHash } from '@/lib/supabase';
import type {
  DbColorCombination,
  DbColorCategory,
  DbColorFamily,
  DbPaintColor,
  DbPopMaterial,
  DbPopWorkflow,
  DbTileSize,
  DbTileMaterial,
  DbLearnArticleVersion,
  DbUserProject,
  DbUserCollection,
  DbLegalPage,
  DbSiteSettings,
  DbPaintType,
  DbPaintProduct,
  DbMaterialPrice,
  DbLaborRate,
  DbScreedingMaterial,
  DbFinishType,
  DbColorRelationshipOverride,
  DbShareableLink,
  DbMediaFolder,
  DbMediaItem,
  DbScreedingMixConfig,
  DbScreedingSystemConfig,
  DbRewardedToolConfig,
  DbRewardedUnlockLog,
  DbRewardedAdEvent,
  DbAdvancedEstimate,
  DbStudioTemplate,
  TemplateType,
  ColorRelationshipType,
  ShareableResourceType,
} from '@/types/database';
import type { ColorFilter } from '@/types';
import { trackProjectSaveWithRewards } from '@/lib/rewards-integration';

// Centralized data access for the public (anon-key) frontend.
// Each function returns { data, error } so callers can render loading/error/empty states.

export async function fetchColorCategories() {
  const { data, error } = await supabase
    .from('color_categories')
    .select('id, name, slug, is_active, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbColorCategory[], error };
}

export async function fetchColorCombinations() {
  const { data, error } = await supabase
    .from('color_combinations')
    .select('*')
    .eq('is_published', true)
    .order('sort_order');
  return { data: (data ?? []) as DbColorCombination[], error };
}

export async function fetchColorBySlug(slug: string) {
  const { data, error } = await supabase
    .from('color_combinations')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  return { data: data as DbColorCombination | null, error };
}

export async function fetchRelatedColors(categoryIds: string[], excludeId: string) {
  if (!categoryIds || categoryIds.length === 0) return { data: [] as DbColorCombination[], error: null };
  const { data, error } = await supabase
    .from('color_combinations')
    .select('*')
    .eq('is_published', true)
    .neq('id', excludeId)
    .overlaps('category_ids', categoryIds)
    .order('sort_order')
    .limit(3);
  return { data: (data ?? []) as DbColorCombination[], error };
}

export async function fetchLegalPage(slug: string) {
  const { data, error } = await supabase
    .from('legal_pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  return { data: data as DbLegalPage | null, error };
}

export async function fetchSiteSettings() {
  if (!isSupabaseConfigured) return { data: null, error: null };
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  return { data: data as DbSiteSettings | null, error };
}

export async function fetchPaintTypes() {
  const { data, error } = await supabase
    .from('paint_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbPaintType[], error };
}

export async function fetchPaintProducts() {
  const { data, error } = await supabase
    .from('paint_products')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbPaintProduct[], error };
}

export async function fetchMaterialPrices() {
  const { data, error } = await supabase
    .from('material_prices')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbMaterialPrice[], error };
}

export async function fetchLaborRates() {
  const { data, error } = await supabase
    .from('labor_rates')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbLaborRate[], error };
}

export async function fetchScreedingMaterials() {
  const { data, error } = await supabase
    .from('screeding_materials')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbScreedingMaterial[], error };
}

// =========================================================
// Finish Types (Painting, Tyrolene, Grafitex)
// =========================================================

export async function fetchFinishTypes(): Promise<{ data: DbFinishType[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('finish_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return { data: (data ?? []) as DbFinishType[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed to load finish types' };
  }
}

export async function fetchAllFinishTypes(): Promise<{ data: DbFinishType[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('finish_types')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return { data: (data ?? []) as DbFinishType[], error: null };
  } catch (e) {
    return { data: [], error: e instanceof Error ? e.message : 'Failed to load finish types' };
  }
}

// =========================================================
// POP Ceiling Materials & Workflows
// =========================================================

export async function fetchPopMaterials(workflow?: string) {
  let query = supabase.from('pop_materials').select('*').eq('is_active', true);
  if (workflow) query = query.eq('workflow', workflow);
  query = query.order('sort_order');
  const { data, error } = await query;
  return { data: (data ?? []) as DbPopMaterial[], error };
}

export async function fetchPopWorkflows() {
  const { data, error } = await supabase
    .from('pop_workflows')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbPopWorkflow[], error };
}

// =========================================================
// Tile Sizes & Materials
// =========================================================

export async function fetchTileSizes() {
  const { data, error } = await supabase
    .from('tile_sizes')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbTileSize[], error };
}

export async function fetchTileMaterials(category?: string) {
  let query = supabase.from('tile_materials').select('*').eq('is_active', true);
  if (category) query = query.eq('category', category);
  query = query.order('sort_order');
  const { data, error } = await query;
  return { data: (data ?? []) as DbTileMaterial[], error };
}

// =========================================================
// Learn Article Versions
// =========================================================

export async function fetchArticleVersions(articleId: string) {
  const { data, error } = await supabase
    .from('learn_article_versions')
    .select('*')
    .eq('article_id', articleId)
    .order('version_number', { ascending: false });
  return { data: (data ?? []) as DbLearnArticleVersion[], error };
}

export async function saveArticleVersion(articleId: string, versionNumber: number, title: string, content: string, excerpt: string | null, changeSummary: string | null) {
  const { error } = await supabase.from('learn_article_versions').insert({
    article_id: articleId,
    version_number: versionNumber,
    title,
    content,
    excerpt,
    change_summary: changeSummary,
  });
  return { error: error ? error.message : null };
}

// Insert an analytics event (fire-and-forget; failures are silent to the user).
export async function logAnalyticsEvent(event: string, params?: Record<string, unknown>, pagePath?: string) {
  if (!isSupabaseConfigured) return;
  await supabase.from('analytics_events').insert({
    event,
    params: params ?? null,
    page_path: pagePath ?? null,
  });
}

// =========================================================
// Paint Colors (Phase 8)
// =========================================================

export async function fetchPaintColors(filter: ColorFilter = {}): Promise<{ data: DbPaintColor[]; total: number; error: string | null }> {
  const { page = 1, pageSize = 24 } = filter;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from('paint_colors').select('*', { count: 'exact' }).eq('is_active', true);

  if (filter.query) {
    query = query.ilike('name', `%${filter.query}%`);
  }
  if (filter.familyId) {
    query = query.eq('color_family_id', filter.familyId);
  }
  if (filter.categoryId) {
    query = query.eq('category_id', filter.categoryId);
  }
  if (filter.isInterior !== null && filter.isInterior !== undefined) {
    query = query.eq('is_interior', filter.isInterior);
  }
  if (filter.isExterior !== null && filter.isExterior !== undefined) {
    query = query.eq('is_exterior', filter.isExterior);
  }
  if (filter.isFeatured) {
    query = query.eq('is_featured', true);
  }
  if (filter.isTrending) {
    query = query.eq('is_trending', true);
  }

  const sort = filter.sort ?? 'display_order';
  if (sort === 'popularity') {
    query = query.order('popularity_score', { ascending: false }).order('display_order');
  } else if (sort === 'name') {
    query = query.order('name', { ascending: true });
  } else if (sort === 'newest') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('display_order').order('popularity_score', { ascending: false });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) return { data: [], total: 0, error: error.message };
  return { data: (data ?? []) as DbPaintColor[], total: count ?? 0, error: null };
}

export async function fetchPaintColorBySlug(slug: string) {
  const { data, error } = await supabase
    .from('paint_colors')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return { data: data as DbPaintColor | null, error: error ? error.message : null };
}

export async function fetchRelatedPaintColors(color: DbPaintColor, limit = 6) {
  let query = supabase
    .from('paint_colors')
    .select('*')
    .eq('is_active', true)
    .neq('id', color.id)
    .limit(limit);

  if (color.color_family_id) {
    query = query.eq('color_family_id', color.color_family_id);
  } else {
    query = query.order('popularity_score', { ascending: false });
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbPaintColor[], error: null };
}

export async function fetchColorFamilies() {
  const { data, error } = await supabase
    .from('color_families')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  return { data: (data ?? []) as DbColorFamily[], error: error ? error.message : null };
}

export async function fetchTrendingColors(limit = 8) {
  const { data, error } = await supabase
    .from('paint_colors')
    .select('*')
    .eq('is_active', true)
    .eq('is_trending', true)
    .order('popularity_score', { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as DbPaintColor[], error: error ? error.message : null };
}

export async function fetchFeaturedColors(limit = 8) {
  const { data, error } = await supabase
    .from('paint_colors')
    .select('*')
    .eq('is_active', true)
    .eq('is_featured', true)
    .order('display_order')
    .limit(limit);
  return { data: (data ?? []) as DbPaintColor[], error: error ? error.message : null };
}

export async function fetchRecentlyAddedColors(limit = 8) {
  const { data, error } = await supabase
    .from('paint_colors')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as DbPaintColor[], error: error ? error.message : null };
}

export async function fetchFeaturedCombinations(limit = 6) {
  const { data, error } = await supabase
    .from('color_combinations')
    .select('*')
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('sort_order')
    .limit(limit);
  return { data: (data ?? []) as DbColorCombination[], error: error ? error.message : null };
}

export async function fetchTrendingCombinations(limit = 6) {
  const { data, error } = await supabase
    .from('color_combinations')
    .select('*')
    .eq('is_published', true)
    .eq('is_trending', true)
    .order('popularity_score', { ascending: false })
    .limit(limit);
  return { data: (data ?? []) as DbColorCombination[], error: error ? error.message : null };
}

// =========================================================
// User Favorites
// =========================================================

export async function toggleFavoriteColor(colorId: string): Promise<{ favorited: boolean; error: string | null }> {
  const { data: existing } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('item_type', 'color')
    .eq('color_id', colorId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('user_favorites').delete().eq('id', existing.id);
    return { favorited: false, error: error ? error.message : null };
  }

  const { error } = await supabase.from('user_favorites').insert({ item_type: 'color', color_id: colorId });
  return { favorited: !error, error: error ? error.message : null };
}

export async function toggleFavoritePalette(paletteId: string): Promise<{ favorited: boolean; error: string | null }> {
  const { data: existing } = await supabase
    .from('user_favorites')
    .select('id')
    .eq('item_type', 'palette')
    .eq('palette_id', paletteId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('user_favorites').delete().eq('id', existing.id);
    return { favorited: false, error: error ? error.message : null };
  }

  const { error } = await supabase.from('user_favorites').insert({ item_type: 'palette', palette_id: paletteId });
  return { favorited: !error, error: error ? error.message : null };
}

export async function fetchFavoriteColorIds(): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('color_id')
    .eq('item_type', 'color');
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r) => r.color_id).filter(Boolean) as string[], error: null };
}

export async function fetchFavoritePaletteIds(): Promise<{ ids: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('palette_id')
    .eq('item_type', 'palette');
  if (error) return { ids: [], error: error.message };
  return { ids: (data ?? []).map((r) => r.palette_id).filter(Boolean) as string[], error: null };
}

export async function fetchFavoriteColors(): Promise<{ data: DbPaintColor[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('paint_colors(*)')
    .eq('item_type', 'color')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r: Record<string, unknown>) => r.paint_colors).filter(Boolean) as DbPaintColor[], error: null };
}

export async function fetchFavoritePalettes(): Promise<{ data: DbColorCombination[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_favorites')
    .select('color_combinations(*)')
    .eq('item_type', 'palette')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r: Record<string, unknown>) => r.color_combinations).filter(Boolean) as DbColorCombination[], error: null };
}

// =========================================================
// User Projects
// =========================================================

export async function fetchUserProjects(): Promise<{ data: DbUserProject[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbUserProject[], error: null };
}

export async function saveUserProject(name: string, projectType: DbUserProject['project_type'], projectData: Record<string, unknown>, description?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_projects').insert({ name, project_type: projectType, project_data: projectData, description });
  if (!error) {
    trackProjectSaveWithRewards();
  }
  return { error: error ? error.message : null };
}

export async function updateUserProject(id: string, name: string, projectData: Record<string, unknown>, description?: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_projects').update({ name, project_data: projectData, description }).eq('id', id);
  return { error: error ? error.message : null };
}

export async function deleteUserProject(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_projects').delete().eq('id', id);
  return { error: error ? error.message : null };
}

export async function duplicateUserProject(id: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.from('user_projects').select('*').eq('id', id).maybeSingle();
  if (error || !data) return { error: error ? error.message : 'Project not found' };
  const { name, project_type, project_data, description } = data as DbUserProject;
  const { error: insertError } = await supabase.from('user_projects').insert({
    name: `${name} (Copy)`,
    project_type,
    project_data,
    description,
  });
  return { error: insertError ? insertError.message : null };
}

// =========================================================
// User Collections
// =========================================================

export async function fetchUserCollections(): Promise<{ data: DbUserCollection[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_collections')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbUserCollection[], error: null };
}

export async function createUserCollection(name: string, description?: string): Promise<{ data: DbUserCollection | null; error: string | null }> {
  const { data, error } = await supabase.from('user_collections').insert({ name, description }).select('*').maybeSingle();
  return { data: data as DbUserCollection | null, error: error ? error.message : null };
}

export async function deleteUserCollection(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_collections').delete().eq('id', id);
  return { error: error ? error.message : null };
}

export async function addColorToCollection(collectionId: string, colorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_collection_items').insert({ collection_id: collectionId, color_id: colorId });
  return { error: error ? error.message : null };
}

export async function removeColorFromCollection(collectionId: string, colorId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_collection_items').delete().eq('collection_id', collectionId).eq('color_id', colorId);
  return { error: error ? error.message : null };
}

export async function fetchCollectionColors(collectionId: string): Promise<{ data: DbPaintColor[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_collection_items')
    .select('paint_colors(*)')
    .eq('collection_id', collectionId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r: Record<string, unknown>) => r.paint_colors).filter(Boolean) as DbPaintColor[], error: null };
}

// =========================================================
// Recently Viewed Colors
// =========================================================

export async function trackColorView(colorId: string): Promise<void> {
  await supabase
    .from('recently_viewed_colors')
    .upsert({ color_id: colorId, viewed_at: new Date().toISOString() }, { onConflict: 'user_id,color_id' });
}

export async function fetchRecentlyViewedColors(limit = 8): Promise<{ data: DbPaintColor[]; error: string | null }> {
  const { data, error } = await supabase
    .from('recently_viewed_colors')
    .select('paint_colors!inner(*)')
    .order('viewed_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((r: Record<string, unknown>) => r.paint_colors).filter(Boolean) as DbPaintColor[], error: null };
}

export async function clearRecentlyViewed(): Promise<{ error: string | null }> {
  const { error } = await supabase.from('recently_viewed_colors').delete().neq('is_pinned', true);
  return { error: error ? error.message : null };
}

export async function togglePinRecentlyViewed(colorId: string): Promise<{ error: string | null }> {
  const { data } = await supabase
    .from('recently_viewed_colors')
    .select('is_pinned')
    .eq('color_id', colorId)
    .maybeSingle();
  const newPinned = !(data?.is_pinned ?? false);
  const { error } = await supabase.from('recently_viewed_colors').update({ is_pinned: newPinned }).eq('color_id', colorId);
  return { error: error ? error.message : null };
}

// =========================================================
// Color Relationships
// =========================================================

export async function fetchRelationshipOverrides(colorId: string): Promise<{ data: DbColorRelationshipOverride[]; error: string | null }> {
  const { data, error } = await supabase
    .from('color_relationship_overrides')
    .select('*')
    .eq('color_id', colorId);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbColorRelationshipOverride[], error: null };
}

export async function saveRelationshipOverride(colorId: string, type: ColorRelationshipType, overrideColorIds: string[]): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('color_relationship_overrides')
    .upsert({ color_id: colorId, relationship_type: type, override_color_ids: overrideColorIds }, { onConflict: 'color_id,relationship_type' });
  return { error: error ? error.message : null };
}

export async function deleteRelationshipOverride(colorId: string, type: ColorRelationshipType): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('color_relationship_overrides')
    .delete()
    .eq('color_id', colorId)
    .eq('relationship_type', type);
  return { error: error ? error.message : null };
}

// =========================================================
// Shareable Links
// =========================================================

export async function createShareableLink(resourceType: ShareableResourceType, resourceId: string): Promise<{ data: DbShareableLink | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shareable_links')
    .insert({ resource_type: resourceType, resource_id: resourceId })
    .select('*')
    .maybeSingle();
  return { data: data as DbShareableLink | null, error: error ? error.message : null };
}

export async function fetchShareableLinks(resourceType: ShareableResourceType, resourceId: string): Promise<{ data: DbShareableLink[]; error: string | null }> {
  const { data, error } = await supabase
    .from('shareable_links')
    .select('*')
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbShareableLink[], error: null };
}

export async function toggleShareableLink(linkId: string, isActive: boolean): Promise<{ error: string | null }> {
  const { error } = await supabase.from('shareable_links').update({ is_active: isActive }).eq('id', linkId);
  return { error: error ? error.message : null };
}

export async function deleteShareableLink(linkId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('shareable_links').delete().eq('id', linkId);
  return { error: error ? error.message : null };
}

export async function fetchSharedResource(linkId: string): Promise<{ data: DbShareableLink | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('shareable_links')
    .select('*')
    .eq('id', linkId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .maybeSingle();
  return { data: data as DbShareableLink | null, error: error ? error.message : null };
}

// =========================================================
// Media Library
// =========================================================

export async function fetchMediaFolders(): Promise<{ data: DbMediaFolder[]; error: string | null }> {
  const { data, error } = await supabase.from('media_folders').select('*').order('sort_order');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbMediaFolder[], error: null };
}

export async function fetchMediaItems(folderId?: string | null, search?: string): Promise<{ data: DbMediaItem[]; error: string | null }> {
  let query = supabase.from('media_items').select('*').order('created_at', { ascending: false });
  if (folderId) query = query.eq('folder_id', folderId);
  if (search) query = query.ilike('file_name', `%${search}%`);
  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as DbMediaItem[], error: null };
}

export async function uploadMediaImage(file: File, folderSlug: string): Promise<{ data: DbMediaItem | null; error: string | null }> {
  const { data: folders } = await supabase.from('media_folders').select('id').eq('slug', folderSlug).maybeSingle();
  const folderId = (folders as { id: string } | null)?.id ?? null;
  const ext = file.name.split('.').pop() ?? 'png';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const folderPath = folderSlug === 'user-uploads' ? 'user-uploads' : folderSlug;
  const storagePath = `${folderPath}/${fileName}`;
  const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, file, { contentType: file.type });
  if (uploadError) return { data: null, error: uploadError.message };
  const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;
  const { data, error } = await supabase.from('media_items').insert({
    folder_id: folderId, file_name: file.name, storage_path: storagePath, public_url: publicUrl,
    mime_type: file.type, size_bytes: file.size,
  }).select('*').maybeSingle();
  return { data: data as DbMediaItem | null, error: error ? error.message : null };
}

export async function deleteMediaItem(item: DbMediaItem): Promise<{ error: string | null }> {
  const { error: storageError } = await supabase.storage.from('media').remove([item.storage_path]);
  if (storageError) return { error: storageError.message };
  const { error } = await supabase.from('media_items').delete().eq('id', item.id);
  return { error: error ? error.message : null };
}

export async function updateMediaItemAlt(id: string, altText: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('media_items').update({ alt_text: altText }).eq('id', id);
  return { error: error ? error.message : null };
}

// =========================================================
// Rename / Move Collection operations
// =========================================================

export async function renameUserCollection(id: string, name: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_collections').update({ name }).eq('id', id);
  return { error: error ? error.message : null };
}

export async function moveColorToCollection(fromCollectionId: string, toCollectionId: string, colorId: string): Promise<{ error: string | null }> {
  const { error: delError } = await supabase.from('user_collection_items').delete().eq('collection_id', fromCollectionId).eq('color_id', colorId);
  if (delError) return { error: delError.message };
  const { error: insError } = await supabase.from('user_collection_items').insert({ collection_id: toCollectionId, color_id: colorId });
  return { error: insError ? insError.message : null };
}

export async function fetchAllPaintColorsLight(): Promise<{ data: { id: string; name: string; hex_code: string; slug: string }[]; error: string | null }> {
  const { data, error } = await supabase.from('paint_colors').select('id, name, hex_code, slug').eq('is_active', true).order('name');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as { id: string; name: string; hex_code: string; slug: string }[], error: null };
}

// =========================================================
// Screeding Mix Configuration
// =========================================================

export async function fetchScreedingMixConfig() {
  const { data, error } = await supabase
    .from('screeding_mix_config')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: data as DbScreedingMixConfig | null, error: error ? error.message : null };
}

// =========================================================
// Screeding Material System Configuration
// =========================================================

export async function fetchScreedingSystemConfig(systemType: 'putty' | 'white_cement_paint') {
  const { data, error } = await supabase
    .from('screeding_system_config')
    .select('*')
    .eq('system_type', systemType)
    .eq('is_active', true)
    .maybeSingle();
  return { data: data as DbScreedingSystemConfig | null, error: error ? error.message : null };
}

export async function fetchAllScreedingSystemConfigs() {
  const { data, error } = await supabase
    .from('screeding_system_config')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return { data: (data ?? []) as DbScreedingSystemConfig[], error: error ? error.message : null };
}

export async function updateScreedingSystemConfig(id: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('screeding_system_config')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? error.message : null };
}


// =========================================================
// Rewarded Access System
// =========================================================

export async function fetchRewardedToolConfig(toolKey: string) {
  const { data, error } = await supabase
    .from('rewarded_tool_config')
    .select('*')
    .eq('tool_key', toolKey)
    .maybeSingle();
  return { data: data as DbRewardedToolConfig | null, error: error ? error.message : null };
}

export async function fetchAllRewardedToolConfigs() {
  const { data, error } = await supabase
    .from('rewarded_tool_config')
    .select('*')
    .order('created_at');
  return { data: (data ?? []) as DbRewardedToolConfig[], error: error ? error.message : null };
}

/**
 * @deprecated Issue #7 fix: Use logAdEvent from '@/lib/ad-config' instead.
 * This function writes to the legacy rewarded_ad_events table. The new
 * unified ad_analytics_events table (via logAdEvent) is the source of truth.
 */
export async function logRewardedAdEvent(params: {
  toolKey: string;
  eventType: 'impression' | 'click' | 'reward' | 'close' | 'error';
  clientHash: string;
  adProvider?: string;
  revenueEstimated?: number;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from('rewarded_ad_events').insert({
    tool_key: params.toolKey,
    event_type: params.eventType,
    client_hash: params.clientHash,
    ad_provider: params.adProvider ?? 'adsense',
    revenue_estimated: params.revenueEstimated ?? 0,
    metadata: params.metadata ?? {},
  });
  return { error: error ? error.message : null };
}

/**
 * @deprecated Issue #2 fix: Unlocks are now granted server-side via the
 * grant-rewarded-unlock edge function. Direct client-side INSERT into
 * rewarded_unlock_log is no longer permitted by RLS policies.
 * This function will fail silently, use the edge function instead.
 */
export async function recordRewardedUnlock(params: {
  toolKey: string;
  clientHash: string;
  expiresAt: string;
  adProvider?: string;
}) {
  const { error } = await supabase.from('rewarded_unlock_log').insert({
    tool_key: params.toolKey,
    client_hash: params.clientHash,
    expires_at: params.expiresAt,
    ad_provider: params.adProvider ?? 'adsense',
  });
  return { error: error ? error.message : null };
}

export async function checkRewardedUnlock(toolKey: string, clientHash: string) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('rewarded_unlock_log')
    .select('id, expires_at')
    .eq('tool_key', toolKey)
    .eq('client_hash', clientHash)
    .gte('unlock_date', today)
    .order('unlocked_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { unlocked: false, expiresAt: null, error: error.message };
  if (!data) return { unlocked: false, expiresAt: null, error: null };
  const now = new Date();
  const expires = new Date(data.expires_at);
  if (now > expires) return { unlocked: false, expiresAt: null, error: null };
  return { unlocked: true, expiresAt: data.expires_at as string, error: null };
}

// =========================================================
// Advanced Estimates (Save / Load / Compare)
// =========================================================

export async function saveAdvancedEstimate(params: {
  clientHash: string;
  toolKey: string;
  title: string;
  projectType: string;
  estimateData: Record<string, unknown>;
  totalCost: number;
  currency: string;
}) {
  // RLS binds anonymous advanced_estimates rows to the x-client-hash
  // request header, so these calls go through the hash-bound client.
  const client = supabaseWithClientHash(params.clientHash);
  const { data, error } = await client.from('advanced_estimates').insert({
    client_hash: params.clientHash,
    tool_key: params.toolKey,
    title: params.title,
    project_type: params.projectType,
    estimate_data: params.estimateData,
    total_cost: params.totalCost,
    currency: params.currency,
    is_saved: true,
  }).select('id').maybeSingle();
  return { id: data?.id ?? null, error: error ? error.message : null };
}

export async function fetchAdvancedEstimates(clientHash: string) {
  const { data, error } = await supabaseWithClientHash(clientHash)
    .from('advanced_estimates')
    .select('*')
    .eq('client_hash', clientHash)
    .eq('is_saved', true)
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as DbAdvancedEstimate[], error: error ? error.message : null };
}

export async function deleteAdvancedEstimate(id: string, clientHash: string) {
  const { error } = await supabaseWithClientHash(clientHash)
    .from('advanced_estimates')
    .delete()
    .eq('id', id);
  return { error: error ? error.message : null };
}

// =========================================================
// Admin: Rewarded Access Statistics
// =========================================================

export async function fetchRewardedUnlockStats(days = 30) {
  const { data, error } = await supabase
    .from('rewarded_unlock_log')
    .select('tool_key, unlock_date, ad_provider, ad_revenue_estimated')
    .gte('unlock_date', new Date(Date.now() - days * 86400000).toISOString().split('T')[0])
    .order('unlock_date', { ascending: false });
  return { data: (data ?? []) as Pick<DbRewardedUnlockLog, 'tool_key' | 'unlock_date' | 'ad_provider' | 'ad_revenue_estimated'>[], error: error ? error.message : null };
}

export async function fetchRewardedAdEventStats(days = 30) {
  const { data, error } = await supabase
    .from('rewarded_ad_events')
    .select('tool_key, event_type, revenue_estimated, created_at')
    .gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
    .order('created_at', { ascending: false });
  return { data: (data ?? []) as Pick<DbRewardedAdEvent, 'tool_key' | 'event_type' | 'revenue_estimated' | 'created_at'>[], error: error ? error.message : null };
}

// =========================================================
// Calculator Templates
// =========================================================

export async function fetchBuiltinTemplates(type?: TemplateType) {
  let query = supabase.from('calculator_templates').select('*').eq('is_builtin', true).eq('is_active', true);
  if (type) query = query.eq('template_type', type);
  query = query.order('sort_order').order('name');
  const { data, error } = await query;
  return { data: (data ?? []) as DbStudioTemplate[], error: error ? error.message : null };
}

export async function fetchUserTemplates(type?: TemplateType) {
  let query = supabase.from('calculator_templates').select('*').eq('is_builtin', false);
  if (type) query = query.eq('template_type', type);
  query = query.order('updated_at', { ascending: false });
  const { data, error } = await query;
  return { data: (data ?? []) as DbStudioTemplate[], error: error ? error.message : null };
}

export async function saveUserTemplate(
  templateType: TemplateType,
  name: string,
  calculatorData: Record<string, unknown>,
  description?: string,
) {
  const { data, error } = await supabase
    .from('calculator_templates')
    .insert({
      template_type: templateType,
      name,
      description: description ?? null,
      calculator_data: calculatorData,
      is_builtin: false,
      is_active: true,
    })
    .select()
    .single();
  return { data: data as DbStudioTemplate | null, error: error ? error.message : null };
}

export async function updateUserTemplate(id: string, updates: { name?: string; description?: string | null; calculator_data?: Record<string, unknown> }) {
  const { error } = await supabase.from('calculator_templates').update(updates).eq('id', id);
  return { error: error ? error.message : null };
}

export async function deleteUserTemplate(id: string) {
  const { error } = await supabase.from('calculator_templates').delete().eq('id', id);
  return { error: error ? error.message : null };
}

export async function duplicateUserTemplate(id: string, newName?: string) {
  const { data: source, error: fetchError } = await supabase
    .from('calculator_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (fetchError || !source) return { data: null, error: fetchError ? fetchError.message : 'Template not found' };
  const { data, error } = await supabase
    .from('calculator_templates')
    .insert({
      template_type: source.template_type,
      name: newName ?? `${source.name} (Copy)`,
      description: source.description,
      calculator_data: source.calculator_data,
      is_builtin: false,
      is_active: true,
    })
    .select()
    .single();
  return { data: data as DbStudioTemplate | null, error: error ? error.message : null };
}
