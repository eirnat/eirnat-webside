export const ANNOTATION_EURO_GREEN = '#00965e';

export const NVDB_EXPORT_HIDE_LAYER_IDS = ['nvdb-layer', 'nvdb-hitbox', 'nvdb-hover-layer'] as const;

/** Skjules under SVG-bakgrunnsfangst slik at brukerlag tegnes som vektorer. */
export const USER_OVERLAY_LAYER_IDS = [
  'closed-road-outline',
  'reduced-road-outline',
  'pedestrian-road-outline',
  'detour-road-casing-layer',
  'manual-line-outline',
  'closed-road-fill',
  'reduced-road-fill',
  'pedestrian-road-fill',
  'detour-road-layer',
  'manual-line-fill',
  'line-arrows-layer',
  'annotations-layer',
  'annotations-bg-green',
  'annotations-bg-white',
  'closed-sign-layer',
  'stretch-preview-layer',
  'stretch-anchor-layer'
] as const;

export const SIGN_BASE_HEIGHT = 128;

export const getSignIconScale = (zoom: number): number => {
  if (zoom <= 13) return 0.2;
  if (zoom >= 19) return 0.55;
  if (zoom <= 16) return 0.2 + ((zoom - 13) / 3) * (0.35 - 0.2);
  return 0.35 + ((zoom - 16) / 3) * (0.55 - 0.35);
};

export const getArrowIconScale = (zoom: number): number => {
  if (zoom <= 13) return 0.1;
  if (zoom >= 19) return 0.22;
  if (zoom <= 16) return 0.1 + ((zoom - 13) / 3) * (0.16 - 0.1);
  return 0.16 + ((zoom - 16) / 3) * (0.22 - 0.16);
};
