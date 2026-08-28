import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Egendefinert MapLibre-stil bygget direkte pa MapTiler sine OpenMapTiles-vektorfliser.
 * Gratonebasis med hvite smaveier og gule riks-, fylkes- og europaveier, slik at
 * vegnettet leses tydelig bade utzoomet og innzoomet.
 */

const SOURCE_ID = 'maptiler_planet';
const TILE_URL = 'https://api.maptiler.com/tiles/v3/tiles.json';
const SPRITE_URL = 'https://api.maptiler.com/maps/streets-v2/sprite';
const GLYPHS_URL = 'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf';
const ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap contributors</a>';

/** Zoomniva der gress og skog gar fra gratone til lys gronn. */
const GREEN_FADE_START = 12.5;
const GREEN_FADE_END = 14;

/** Bygninger finnes forst fra dette zoomnivaet i kildedataene. */
const BUILDING_MIN_ZOOM = 13;

export const MAP_COLORS = {
  background: '#EFEFEF',
  land: '#E6E6E6',
  landAlt: '#EAEAEA',
  residential: '#E4E4E4',
  meadowGray: '#E6E6E6',
  meadowGreen: '#DCEFD0',
  woodGray: '#E1E1E1',
  woodGreen: '#D2E6C4',
  water: '#CBD5DB',
  waterway: '#BAC7CF',
  buildingFill: '#E2E2E2',
  buildingOutline: '#AAAAAA',
  minorRoad: '#FFFFFF',
  minorRoadCasing: '#BEBEBE',
  majorRoad: '#FBFAC2',
  majorRoadCasing: '#BFB44A',
  /** Tertiaerveier bruker samme gulfarge; rangeringen kommer av bredde og lysere kantlinje. */
  tertiaryRoadCasing: '#D2C97F',
  rail: '#BDBDBD',
  path: '#C4C4C4',
  boundary: '#A2A2A2',
  label: '#2F2F2F',
  labelMuted: '#5C5C5C',
  labelHalo: '#FFFFFF'
} as const;

/**
 * Veiklassifisering. `transportation`-laget har ingen ref-verdi, sa norske
 * europa-, riks- og fylkesveier ma utledes fra OSM-klassen. Juster listene her
 * for a flytte grensen mellom gule hovedveier og hvite smaveier.
 */
const MOTORWAY_CLASSES = ['motorway', 'trunk'];
const MAJOR_ROAD_CLASSES = ['primary', 'secondary'];
const TERTIARY_ROAD_CLASSES = ['tertiary'];
const MINOR_ROAD_CLASSES = ['minor', 'service', 'track', 'busway', 'bus_guideway', 'raceway'];

const ALL_ROAD_CLASSES = [
  ...MOTORWAY_CLASSES,
  ...MAJOR_ROAD_CLASSES,
  ...TERTIARY_ROAD_CLASSES,
  ...MINOR_ROAD_CLASSES
];

/**
 * Linjebredder per zoomniva og veiklasse. Klasser som mangler pa et zoomniva
 * faller tilbake til siste verdi i raden, slik at smaveier forst dukker opp
 * nar man har zoomet nok inn.
 */
const ROAD_WIDTH_STOPS: Array<[zoom: number, byClass: Record<string, number>, fallback: number]> = [
  [5, { motorway: 0.9, trunk: 0.9, primary: 0.5 }, 0],
  [8, { motorway: 1.8, trunk: 1.7, primary: 1.3, secondary: 0.8 }, 0],
  [10, { motorway: 2.8, trunk: 2.6, primary: 2.2, secondary: 1.7, tertiary: 1 }, 0],
  [12, { motorway: 4.5, trunk: 4.2, primary: 3.6, secondary: 3, tertiary: 2.2, minor: 1.2 }, 0.9],
  [14, { motorway: 7, trunk: 6.5, primary: 5.8, secondary: 4.8, tertiary: 3.8, minor: 2.6 }, 1.8],
  [16, { motorway: 13, trunk: 12, primary: 10.5, secondary: 9, tertiary: 7.5, minor: 5.5 }, 4],
  [20, { motorway: 38, trunk: 36, primary: 32, secondary: 28, tertiary: 24, minor: 18 }, 13]
];

/** ID-er for veinummer og veinavn. Styres av egen bryter i grensesnittet. */
export const ROAD_LABEL_LAYER_IDS = ['road-name', 'road-shield', 'road-junction'];

/** ID-er for stedsnavn og symboler. Styres av egen bryter i grensesnittet. */
export const PLACE_LABEL_LAYER_IDS = [
  'place-country',
  'place-state',
  'place-city',
  'place-town',
  'place-other',
  'water-name-ocean',
  'water-name-lake',
  'poi-icons',
  'poi-station',
  'airport',
  'housenumber'
];

/**
 * MapLibre eksporterer ikke ekspresjonstypene sine, sa genererte uttrykk
 * castes til den kontekstuelle typen der de brukes.
 */
const expr = <T>(value: unknown[]): T => value as T;

const inClasses = (classes: string[]) => ['in', ['get', 'class'], ['literal', classes]];

const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];

const roadFilter = (classes: string[]) => [
  'all',
  ['==', ['geometry-type'], 'LineString'],
  notTunnel,
  inClasses(classes)
];

const buildRoadWidth = (transform: (width: number) => number): unknown[] => {
  const value: unknown[] = ['interpolate', ['exponential', 1.5], ['zoom']];
  for (const [zoom, byClass, fallback] of ROAD_WIDTH_STOPS) {
    const match: unknown[] = ['match', ['get', 'class']];
    for (const [roadClass, width] of Object.entries(byClass)) {
      match.push([roadClass], transform(width));
    }
    match.push(transform(fallback));
    value.push(zoom, match);
  }
  return value;
};

const ROAD_WIDTH = buildRoadWidth((width) => width);
const ROAD_CASING_WIDTH = buildRoadWidth((width) =>
  width === 0 ? 0 : Number((width * 1.16 + 1.6).toFixed(2))
);

const ROAD_CASING_COLOR = [
  'match',
  ['get', 'class'],
  MOTORWAY_CLASSES,
  MAP_COLORS.majorRoadCasing,
  MAJOR_ROAD_CLASSES,
  MAP_COLORS.majorRoadCasing,
  TERTIARY_ROAD_CLASSES,
  MAP_COLORS.tertiaryRoadCasing,
  MAP_COLORS.minorRoadCasing
];

const ROAD_COLOR = [
  'match',
  ['get', 'class'],
  [...MOTORWAY_CLASSES, ...MAJOR_ROAD_CLASSES, ...TERTIARY_ROAD_CLASSES],
  MAP_COLORS.majorRoad,
  MAP_COLORS.minorRoad
];

/** Gratone nar man er zoomet ut, gronn nar man er zoomet inn. */
const greenAtZoom = (gray: string, green: string) => [
  'interpolate',
  ['linear'],
  ['zoom'],
  GREEN_FADE_START,
  gray,
  GREEN_FADE_END,
  green
];

const localizedName = ['coalesce', ['get', 'name:no'], ['get', 'name']];

const REGULAR_FONT = ['Roboto Regular', 'Noto Sans Regular'];
const MEDIUM_FONT = ['Roboto Medium', 'Noto Sans Regular'];
const ITALIC_FONT = ['Roboto Italic', 'Noto Sans Italic'];

const buildLayers = (): LayerSpecification[] => [
  {
    id: 'background',
    type: 'background',
    paint: { 'background-color': MAP_COLORS.background }
  },
  {
    id: 'landcover-other',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'landcover',
    filter: expr(inClasses(['farmland', 'sand', 'rock', 'wetland', 'ice'])),
    paint: { 'fill-color': MAP_COLORS.landAlt, 'fill-antialias': false }
  },
  {
    id: 'landcover-wood',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'landcover',
    filter: expr(inClasses(['wood'])),
    paint: {
      'fill-color': expr(greenAtZoom(MAP_COLORS.woodGray, MAP_COLORS.woodGreen)),
      'fill-antialias': false
    }
  },
  {
    id: 'landcover-grass',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'landcover',
    filter: expr(inClasses(['grass'])),
    paint: {
      'fill-color': expr(greenAtZoom(MAP_COLORS.meadowGray, MAP_COLORS.meadowGreen)),
      'fill-antialias': false
    }
  },
  {
    id: 'park',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'park',
    paint: {
      'fill-color': expr(greenAtZoom(MAP_COLORS.meadowGray, MAP_COLORS.meadowGreen)),
      'fill-antialias': false
    }
  },
  {
    id: 'landuse-residential',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'landuse',
    filter: expr(inClasses(['residential', 'suburb', 'suburbs', 'neighbourhood', 'quarter'])),
    paint: { 'fill-color': MAP_COLORS.residential, 'fill-antialias': false }
  },
  {
    id: 'water',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'water',
    filter: expr(['!=', ['get', 'intermittent'], 1]),
    paint: { 'fill-color': MAP_COLORS.water, 'fill-antialias': true }
  },
  {
    id: 'waterway',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'waterway',
    filter: expr(notTunnel),
    layout: { 'line-cap': 'round' },
    paint: {
      'line-color': MAP_COLORS.waterway,
      'line-width': expr(['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.4, 14, 1.6, 20, 6])
    }
  },
  {
    id: 'building',
    type: 'fill',
    source: SOURCE_ID,
    'source-layer': 'building',
    minzoom: BUILDING_MIN_ZOOM,
    paint: {
      'fill-color': MAP_COLORS.buildingFill,
      'fill-opacity': expr(['interpolate', ['linear'], ['zoom'], BUILDING_MIN_ZOOM, 0, 14, 0.9])
    }
  },
  {
    id: 'building-outline',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'building',
    minzoom: BUILDING_MIN_ZOOM,
    paint: {
      'line-color': MAP_COLORS.buildingOutline,
      'line-opacity': expr(['interpolate', ['linear'], ['zoom'], BUILDING_MIN_ZOOM, 0, 14, 1]),
      'line-width': expr(['interpolate', ['linear'], ['zoom'], 14, 0.5, 17, 1, 20, 1.6])
    }
  },
  {
    id: 'road-path',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 13,
    filter: expr([
      'all',
      ['==', ['geometry-type'], 'LineString'],
      notTunnel,
      inClasses(['path', 'pedestrian'])
    ]),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.path,
      'line-dasharray': [2, 1.5],
      'line-width': expr(['interpolate', ['linear'], ['zoom'], 13, 0.6, 16, 1.2, 20, 3])
    }
  },
  {
    id: 'road-tunnel',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr([
      'all',
      ['==', ['geometry-type'], 'LineString'],
      ['==', ['get', 'brunnel'], 'tunnel'],
      inClasses(ALL_ROAD_CLASSES)
    ]),
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': expr(ROAD_COLOR),
      'line-opacity': 0.55,
      'line-dasharray': [2.5, 1.5],
      'line-width': expr(ROAD_WIDTH)
    }
  },
  {
    id: 'road-casing',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr(roadFilter(ALL_ROAD_CLASSES)),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': expr(ROAD_CASING_COLOR),
      'line-width': expr(ROAD_CASING_WIDTH)
    }
  },
  {
    id: 'road-minor',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr(roadFilter(MINOR_ROAD_CLASSES)),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.minorRoad,
      'line-width': expr(ROAD_WIDTH)
    }
  },
  {
    id: 'road-tertiary',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr(roadFilter(TERTIARY_ROAD_CLASSES)),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.majorRoad,
      'line-width': expr(ROAD_WIDTH)
    }
  },
  {
    id: 'road-major',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr(roadFilter(MAJOR_ROAD_CLASSES)),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.majorRoad,
      'line-width': expr(ROAD_WIDTH)
    }
  },
  {
    id: 'road-motorway',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    filter: expr(roadFilter(MOTORWAY_CLASSES)),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.majorRoad,
      'line-width': expr(ROAD_WIDTH)
    }
  },
  {
    id: 'rail',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'transportation',
    minzoom: 9,
    filter: expr(['all', notTunnel, inClasses(['rail'])]),
    paint: {
      'line-color': MAP_COLORS.rail,
      'line-width': expr(['interpolate', ['linear'], ['zoom'], 9, 0.5, 14, 1.2, 20, 3])
    }
  },
  {
    id: 'boundary',
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'boundary',
    filter: expr(['all', ['<=', ['get', 'admin_level'], 6], ['==', ['get', 'maritime'], 0]]),
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': MAP_COLORS.boundary,
      'line-dasharray': [3, 2],
      'line-width': expr(['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1.2, 16, 2])
    }
  },
  {
    id: 'road-name',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'transportation_name',
    minzoom: 12,
    filter: expr([
      'all',
      ['==', ['geometry-type'], 'LineString'],
      ['!', ['in', ['get', 'class'], ['literal', ['ferry', 'service', 'path']]]]
    ]),
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 300,
      'text-field': expr(localizedName),
      'text-font': REGULAR_FONT,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13, 22, 15]),
      'text-max-angle': 30
    },
    paint: {
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.4
    }
  },
  {
    id: 'road-shield',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'transportation_name',
    minzoom: 8,
    filter: expr([
      'all',
      ['==', ['geometry-type'], 'LineString'],
      ['<=', ['get', 'ref_length'], 6],
      ['>', ['get', 'ref_length'], 0]
    ]),
    layout: {
      'symbol-placement': 'line',
      'symbol-avoid-edges': true,
      'symbol-spacing': expr(['interpolate', ['linear'], ['zoom'], 10, 200, 18, 400]),
      'icon-image': 'road_{ref_length}',
      'icon-rotation-alignment': 'viewport',
      'text-field': '{ref}',
      'text-font': MEDIUM_FONT,
      'text-rotation-alignment': 'viewport',
      'text-size': 10,
      'text-padding': 2,
      'text-transform': 'uppercase'
    },
    paint: {
      'icon-color': MAP_COLORS.labelHalo,
      'icon-halo-color': MAP_COLORS.labelMuted,
      'icon-halo-width': 1,
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1
    }
  },
  {
    id: 'road-junction',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'transportation_name',
    minzoom: 15,
    filter: expr([
      'all',
      ['==', ['geometry-type'], 'Point'],
      ['==', ['get', 'subclass'], 'junction'],
      ['>', ['get', 'ref_length'], 0]
    ]),
    layout: {
      'text-field': '{ref}',
      'text-font': MEDIUM_FONT,
      'text-rotation-alignment': 'viewport',
      'text-size': 10,
      'text-offset': [0, 0.1]
    },
    paint: {
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1
    }
  },
  {
    id: 'water-name-ocean',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'water_name',
    filter: expr(['all', ['==', ['geometry-type'], 'Point'], ['has', 'name']]),
    layout: {
      'symbol-placement': 'point',
      'text-field': expr(localizedName),
      'text-font': ITALIC_FONT,
      'text-max-width': 5,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 4, 11, 10, 14, 16, 18])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.2
    }
  },
  {
    id: 'water-name-lake',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'water_name',
    filter: expr(['all', ['==', ['geometry-type'], 'LineString'], ['has', 'name']]),
    layout: {
      'symbol-placement': 'line',
      'text-field': expr(localizedName),
      'text-font': ITALIC_FONT,
      'text-letter-spacing': 0.1,
      'text-max-width': 5,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 10, 11, 16, 14, 22, 16])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.2
    }
  },
  {
    id: 'poi-icons',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'poi',
    minzoom: 15,
    filter: expr(['all', ['==', ['geometry-type'], 'Point'], ['has', 'name']]),
    layout: {
      'icon-image': expr([
        'coalesce',
        ['image', ['to-string', ['get', 'subclass']]],
        ['image', ['to-string', ['get', 'class']]],
        ['image', 'dot']
      ]),
      'icon-size': 1,
      'symbol-sort-key': expr(['to-number', ['get', 'rank']]),
      'text-anchor': 'top',
      'text-field': expr(localizedName),
      'text-font': REGULAR_FONT,
      'text-max-width': 8,
      'text-offset': [0, 0.8],
      'text-optional': true,
      'text-padding': 2,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 15, 10, 18, 12, 22, 14])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.2
    }
  },
  {
    id: 'poi-station',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'poi',
    minzoom: 13,
    filter: expr([
      'all',
      ['has', 'name'],
      ['in', ['get', 'class'], ['literal', ['bus', 'railway']]]
    ]),
    layout: {
      'icon-image': expr([
        'coalesce',
        ['image', ['to-string', ['get', 'subclass']]],
        ['image', 'dot']
      ]),
      'icon-size': 1,
      'text-anchor': 'top',
      'text-field': expr(localizedName),
      'text-font': MEDIUM_FONT,
      'text-max-width': 9,
      'text-offset': [0, 0.9],
      'text-optional': true,
      'text-padding': 2,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 13, 10, 18, 12, 22, 15])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.2
    }
  },
  {
    id: 'airport',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'aerodrome_label',
    minzoom: 9,
    filter: expr(['has', 'iata']),
    layout: {
      'icon-image': expr([
        'match',
        ['get', 'class'],
        'international',
        'airport',
        'airfield'
      ]),
      'icon-size': 0.8,
      'text-anchor': 'top',
      'text-field': expr(localizedName),
      'text-font': MEDIUM_FONT,
      'text-max-width': 9,
      'text-offset': [0, 0.8],
      'text-optional': true,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 10, 10, 16, 13])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.2
    }
  },
  {
    id: 'housenumber',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'housenumber',
    minzoom: 18,
    layout: {
      'text-field': '{housenumber}',
      'text-font': REGULAR_FONT,
      'text-size': 10
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1
    }
  },
  {
    id: 'place-other',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'place',
    filter: expr([
      '!',
      [
        'in',
        ['get', 'class'],
        ['literal', ['continent', 'country', 'state', 'province', 'city', 'town']]
      ]
    ]),
    layout: {
      'symbol-sort-key': expr(['to-number', ['get', 'rank']]),
      'text-field': expr(localizedName),
      'text-font': REGULAR_FONT,
      'text-max-width': 8,
      'text-padding': 2,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12, 16, 16])
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.4
    }
  },
  {
    id: 'place-town',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'place',
    filter: expr(['==', ['get', 'class'], 'town']),
    layout: {
      'icon-allow-overlap': true,
      'icon-image': expr(['step', ['zoom'], 'circle', 12, '']),
      'icon-size': 0.35,
      'symbol-sort-key': expr(['to-number', ['get', 'rank']]),
      'text-anchor': 'bottom',
      'text-field': expr(localizedName),
      'text-font': REGULAR_FONT,
      'text-max-width': 8,
      'text-offset': [0, -0.15],
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 6, 11, 10, 13, 16, 20])
    },
    paint: {
      'icon-color': MAP_COLORS.labelHalo,
      'icon-halo-color': MAP_COLORS.labelMuted,
      'icon-halo-width': 1,
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.4
    }
  },
  {
    id: 'place-city',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'place',
    filter: expr(['==', ['get', 'class'], 'city']),
    layout: {
      'icon-allow-overlap': true,
      'icon-image': expr(['step', ['zoom'], 'circle', 13, '']),
      'icon-size': 0.4,
      'symbol-sort-key': expr(['to-number', ['get', 'rank']]),
      'text-anchor': 'bottom',
      'text-field': expr(localizedName),
      'text-font': MEDIUM_FONT,
      'text-max-width': 8,
      'text-offset': [0, -0.15],
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 4, 12, 8, 15, 12, 20, 16, 26])
    },
    paint: {
      'icon-color': MAP_COLORS.labelHalo,
      'icon-halo-color': MAP_COLORS.labelMuted,
      'icon-halo-width': 1,
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.4
    }
  },
  {
    id: 'place-state',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'place',
    minzoom: 3,
    maxzoom: 9,
    filter: expr([
      'all',
      ['in', ['get', 'class'], ['literal', ['state', 'province']]],
      ['<=', ['get', 'rank'], 6]
    ]),
    layout: {
      'text-field': expr(localizedName),
      'text-font': MEDIUM_FONT,
      'text-letter-spacing': 0.1,
      'text-max-width': 8,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 3, 9, 6, 11]),
      'text-transform': 'uppercase'
    },
    paint: {
      'text-color': MAP_COLORS.labelMuted,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.4
    }
  },
  {
    id: 'place-country',
    type: 'symbol',
    source: SOURCE_ID,
    'source-layer': 'place',
    maxzoom: 10,
    filter: expr(['==', ['get', 'class'], 'country']),
    layout: {
      'text-field': expr(localizedName),
      'text-font': MEDIUM_FONT,
      'text-letter-spacing': 0.07,
      'text-max-width': 8,
      'text-size': expr(['interpolate', ['linear'], ['zoom'], 2, 11, 6, 16, 9, 20]),
      'text-transform': 'uppercase'
    },
    paint: {
      'text-color': MAP_COLORS.label,
      'text-halo-color': MAP_COLORS.labelHalo,
      'text-halo-width': 1.6
    }
  }
];

export const buildKartStyle = (apiKey: string): StyleSpecification => {
  const key = encodeURIComponent(apiKey.trim());

  return {
    version: 8,
    name: 'Veiarbeidskart',
    glyphs: `${GLYPHS_URL}?key=${key}`,
    sprite: SPRITE_URL,
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        url: `${TILE_URL}?key=${key}`,
        attribution: ATTRIBUTION
      }
    },
    layers: buildLayers()
  };
};
