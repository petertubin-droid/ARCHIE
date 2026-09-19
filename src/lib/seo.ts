import { useEffect } from 'react';

export interface SeoMeta {
  title: string;
  description: string;
  canonicalPath?: string;
  ogType?: string;
  ogImage?: string;
  noIndex?: boolean;
  keywords?: string;
  structuredData?: object;
  structuredDataArray?: object[];
}

const SITE_URL = import.meta.env.VITE_SITE_URL ?? 'https://freluxtools.netlify.app';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setStructuredData(id: string, data: object) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function removeStructuredData(id: string) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

export function useSeo(meta: SeoMeta | null) {
  useEffect(() => {
    if (!meta) return;
    const fullTitle = meta.title.includes('FRELUX') ? meta.title : `${meta.title}: FRELUX PROJECT CALC`;
    // Netlify pretty URLs force-redirect /path to /path/ (301), so the
    // canonical URL must use the trailing-slash form to match what is
    // actually served and indexed.
    const rawCanonicalPath = meta.canonicalPath ?? '';
    const canonicalPath = !rawCanonicalPath || rawCanonicalPath === '/' ? rawCanonicalPath : `${rawCanonicalPath}/`;
    const canonicalUrl = `${SITE_URL}${canonicalPath}`;
    const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE;

    // Primary meta
    document.title = fullTitle;
    setMeta('name', 'description', meta.description);
    setMeta('name', 'author', 'FRELUX PROJECT CALC');

    // Keywords (if provided)
    if (meta.keywords) {
      setMeta('name', 'keywords', meta.keywords);
    }

    // Open Graph
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', meta.description);
    setMeta('property', 'og:type', meta.ogType ?? 'website');
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:site_name', 'FRELUX PROJECT CALC');
    setMeta('property', 'og:image', ogImage);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:alt', `${fullTitle}: FRELUX PROJECT CALC`);
    setMeta('property', 'og:locale', 'en_US');

    // Twitter Cards
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', meta.description);
    setMeta('name', 'twitter:image', ogImage);
    setMeta('name', 'twitter:image:alt', `${fullTitle}: FRELUX PROJECT CALC`);

    // Canonical URL, always set
    setLink('canonical', canonicalUrl);

    // Robots
    if (meta.noIndex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      setMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
    }

    // Structured data, single or array
    const sdIds: string[] = [];

    if (meta.structuredData) {
      setStructuredData('page-structured-data', meta.structuredData);
      sdIds.push('page-structured-data');
    } else {
      removeStructuredData('page-structured-data');
    }

    if (meta.structuredDataArray && meta.structuredDataArray.length > 0) {
      meta.structuredDataArray.forEach((data, index) => {
        const id = `page-structured-data-${index}`;
        setStructuredData(id, data);
        sdIds.push(id);
      });
    }

    // Clean up old array-based structured data
    const maxArrayId = (meta.structuredDataArray?.length ?? 0) + 5;
    for (let i = meta.structuredDataArray?.length ?? 0; i < maxArrayId + 5; i++) {
      removeStructuredData(`page-structured-data-${i}`);
    }

    return () => {
      removeStructuredData('page-structured-data');
      sdIds.forEach((id) => removeStructuredData(id));
    };
  }, [meta]);
}

export { SITE_URL };
