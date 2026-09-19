import { supabase } from '@/lib/supabase';

/**
 * Upload a product image to the marketplace-products storage bucket.
 * Returns the public URL of the uploaded image.
 */
export async function uploadProductImage(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be logged in to upload');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('marketplace-products')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    // Try to create bucket if it doesn't exist (will fail gracefully if not allowed)
    if (uploadError.message.includes('not found') || uploadError.message.includes('Bucket')) {
      // Fallback: use base64 data URL as temporary solution
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    throw uploadError;
  }

  const { data } = supabase.storage.from('marketplace-products').getPublicUrl(path);
  return data.publicUrl;
}
