type CatalogImageKind = 'product' | 'category';

type ImageTheme = {
  bgStart: string;
  bgEnd: string;
  accent: string;
  badge: string;
};

const DEFAULT_PRODUCT_THEME: ImageTheme = {
  bgStart: '#17324d',
  bgEnd: '#285f8f',
  accent: '#f59e0b',
  badge: '#f3f4f6',
};

const DEFAULT_CATEGORY_THEME: ImageTheme = {
  bgStart: '#0f3d2e',
  bgEnd: '#1f7a59',
  accent: '#facc15',
  badge: '#ecfeff',
};

const THEME_BY_KEYWORD: Array<{ keywords: string[]; theme: ImageTheme }> = [
  {
    keywords: ['cafe', 'coffee', 'bebida', 'bebidas', 'lacteo', 'lacteos', 'te'],
    theme: { bgStart: '#4a2c1d', bgEnd: '#8a5a35', accent: '#f6ad55', badge: '#fff7ed' },
  },
  {
    keywords: ['condimento', 'condimentos', 'especia', 'especias', 'sazon'],
    theme: { bgStart: '#5b2c06', bgEnd: '#b45309', accent: '#fcd34d', badge: '#fffbeb' },
  },
  {
    keywords: ['snack', 'desayuno', 'galleta', 'granola'],
    theme: { bgStart: '#43315c', bgEnd: '#7c3aed', accent: '#f9a8d4', badge: '#faf5ff' },
  },
  {
    keywords: ['limpieza', 'aseo', 'hogar', 'detergente'],
    theme: { bgStart: '#0f3d5e', bgEnd: '#0284c7', accent: '#a5f3fc', badge: '#ecfeff' },
  },
  {
    keywords: ['cuidado', 'personal', 'higiene', 'belleza'],
    theme: { bgStart: '#5b2157', bgEnd: '#c026d3', accent: '#f5d0fe', badge: '#fdf4ff' },
  },
  {
    keywords: ['abarrote', 'despensa', 'arroz', 'aceite', 'atun', 'pasta'],
    theme: { bgStart: '#24411f', bgEnd: '#4d7c0f', accent: '#fde68a', badge: '#fefce8' },
  },
];

function normalizeText(value?: string | null) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function pickTheme(label: string, kind: CatalogImageKind) {
  const normalized = normalizeText(label);

  for (const entry of THEME_BY_KEYWORD) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return entry.theme;
    }
  }

  return kind === 'category' ? DEFAULT_CATEGORY_THEME : DEFAULT_PRODUCT_THEME;
}

function toInitials(label: string, kind: CatalogImageKind) {
  const safe = String(label ?? '').trim();

  if (!safe) {
    return kind === 'category' ? 'CAT' : 'PRO';
  }

  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildCatalogImageDataUri(
  label: string,
  kind: CatalogImageKind = 'product',
) {
  const theme = pickTheme(label, kind);
  const initials = toInitials(label, kind);
  const badge = kind === 'category' ? 'Categoria' : 'Producto';
  const subtitle = String(label ?? '').trim().slice(0, 28) || badge;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="${escapeSvgText(
    label || badge,
  )}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${theme.bgStart}" />
        <stop offset="100%" stop-color="${theme.bgEnd}" />
      </linearGradient>
    </defs>
    <rect width="600" height="600" rx="52" fill="url(#g)" />
    <circle cx="480" cy="110" r="70" fill="${theme.accent}" opacity="0.9" />
    <circle cx="120" cy="500" r="120" fill="#ffffff" opacity="0.08" />
    <rect x="58" y="60" width="180" height="48" rx="24" fill="${theme.badge}" opacity="0.95" />
    <text x="148" y="90" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="${theme.bgStart}">${badge}</text>
    <text x="300" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="132" font-weight="700" fill="#ffffff">${initials}</text>
    <text x="300" y="402" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#f8fafc">${escapeSvgText(
      subtitle,
    )}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveCatalogImage(
  currentUrl: string | null | undefined,
  label: string,
  kind: CatalogImageKind = 'product',
) {
  return currentUrl?.trim() || buildCatalogImageDataUri(label, kind);
}
