/**
 * Dashboard: Leaflet-kart + Chart.js.
 * Data hentes fra Apps Script (JSON-array med land, trafikk, type, breddegrad, lengdegrad).
 */
import L from "leaflet";
import Chart from "chart.js/auto";
import "leaflet/dist/leaflet.css";

/** Samme palett som globals.css */
export const THEME = {
  background: "#f6f1e9",
  foreground: "#2b2d42",
  meadow: "#a7c957",
  terra: "#bc6c49",
};

const FONT =
  'var(--font-lexend), Lexend, "Helvetica Neue", Arial, sans-serif';

/** Grovt landssenter for markører når telling mangler GPS */
const COUNTRY_CENTROIDS = {
  NO: [59.91, 10.75],
  SE: [59.33, 18.07],
  DK: [55.68, 12.57],
  DE: [51.16, 10.45],
  PL: [51.92, 19.15],
  LT: [55.17, 23.88],
  FI: [61.92, 25.75],
  NL: [52.13, 5.29],
};

const CAR_LABEL_KEYS = [
  "personbil",
  "lastebil",
  "buss",
  "motorsykkel",
  "annet",
];

const CAR_LABELS = {
  personbil: "Personbil",
  lastebil: "Lastebil",
  buss: "Buss",
  motorsykkel: "Motorsykkel",
  annet: "Annet",
};

function parseCoord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeLandCode(row) {
  const raw = row.land ?? row.country;
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().toUpperCase().slice(0, 2);
}

function normalizeTraffic(row) {
  const t = String(row.trafikk ?? "")
    .trim()
    .toLowerCase();
  if (t === "privat") return "privat";
  if (t === "yrkes" || t === "yrkestrafikk") return "yrkes";
  return null;
}

function normalizeCarType(row) {
  const t = String(row.type ?? "")
    .trim()
    .toLowerCase();
  if (CAR_LABEL_KEYS.includes(t)) return t;
  return "annet";
}

/**
 * @param {unknown[]} rawRows
 */
function aggregateFromRows(rawRows) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const byLand = new Map();
  const traffic = { privat: 0, yrkes: 0 };
  const carTypes = Object.fromEntries(CAR_LABEL_KEYS.map((k) => [k, 0]));
  const gpsPoints = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const land = normalizeLandCode(row);
    if (land) {
      byLand.set(land, (byLand.get(land) || 0) + 1);
    }

    const tr = normalizeTraffic(row);
    if (tr) traffic[tr] += 1;

    const ct = normalizeCarType(row);
    carTypes[ct] += 1;

    const lat = parseCoord(row.breddegrad ?? row.lat);
    const lng = parseCoord(
      row.lengdegrad ?? row.lng ?? row.longitude ?? row.lon
    );
    if (lat != null && lng != null) {
      gpsPoints.push({ lat, lng, land, row });
    }
  }

  const regionNames = new Intl.DisplayNames(["nb"], { type: "region" });
  const carsPerCountry = [...byLand.entries()]
    .map(([code, count]) => {
      const centroid = COUNTRY_CENTROIDS[code];
      const lat = centroid ? centroid[0] : 55;
      const lng = centroid ? centroid[1] : 12;
      return {
        code,
        name: regionNames.of(code) || code,
        count,
        lat,
        lng,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    rows,
    carsPerCountry,
    traffic,
    carTypes,
    gpsPoints,
  };
}

async function fetchTellingRows(dataUrl) {
  if (!dataUrl) return [];
  const res = await fetch(dataUrl, { method: "GET" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function fixLeafletIcons() {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

function chartTextColor() {
  return THEME.foreground;
}

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: chartTextColor,
        font: { family: FONT, size: 12 },
      },
    },
    tooltip: {
      bodyFont: { family: FONT },
      titleFont: { family: FONT },
    },
  },
};

/**
 * @param {HTMLElement} root
 * @param {object} [options]
 * @param {string} [options.dataUrl] – GOOGLE_SCRIPT_URL (GET → JSON)
 * @returns {Promise<() => void>}
 */
export async function createDashboard(root, options = {}) {
  fixLeafletIcons();

  let rows = [];
  try {
    if (options.dataUrl) {
      rows = await fetchTellingRows(options.dataUrl);
    }
  } catch (e) {
    console.warn("Dashboard: klarte ikke å hente data", e);
  }

  const agg = aggregateFromRows(rows);
  const { carsPerCountry, traffic, carTypes, gpsPoints } = agg;
  const hasRows = rows.length > 0;

  const mapEl = root.querySelector("[data-dashboard-map]");
  const barCanvas = root.querySelector('[data-chart="bars"]');
  const trafficCanvas = root.querySelector('[data-chart="traffic"]');
  const carTypesCanvas = root.querySelector('[data-chart="car-types"]');

  if (!mapEl || !barCanvas || !trafficCanvas || !carTypesCanvas) {
    console.warn("createDashboard: mangler DOM-elementer");
    return () => {};
  }

  const map = L.map(mapEl, {
    scrollWheelZoom: true,
    attributionControl: true,
  }).setView([62.5, 12], 4.5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  const bounds = [];

  const regionForMap = new Intl.DisplayNames(["nb"], { type: "region" });

  if (gpsPoints.length > 0) {
    for (const p of gpsPoints) {
      const marker = L.marker([p.lat, p.lng]).addTo(map);
      const typeLabel = CAR_LABELS[normalizeCarType(p.row)] ?? p.row.type;
      const landName = regionForMap.of(p.land) || p.land || "?";
      marker.bindPopup(
        `<strong style="color:${THEME.foreground};font-family:${FONT}">${landName}</strong><br/>` +
          `<span style="color:${THEME.foreground};opacity:.85">${typeLabel}</span>`
      );
      bounds.push([p.lat, p.lng]);
    }
  } else {
    for (const row of carsPerCountry) {
      const marker = L.marker([row.lat, row.lng]).addTo(map);
      marker.bindPopup(
        `<strong style="color:${THEME.foreground};font-family:${FONT}">${row.name}</strong><br/>` +
          `<span style="color:${THEME.foreground};opacity:.85">${row.count} ${row.count === 1 ? "telling" : "tellinger"}</span>`
      );
      bounds.push([row.lat, row.lng]);
    }
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: gpsPoints.length ? 12 : 6 });
  }

  Chart.defaults.color = THEME.foreground;
  Chart.defaults.font.family = FONT;

  const barLabels = hasRows
    ? carsPerCountry.map((c) => c.name)
    : ["(ingen data)"];
  const barData = hasRows ? carsPerCountry.map((c) => c.count) : [0];

  const barChart = new Chart(barCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: barLabels,
      datasets: [
        {
          label: "Antall tellinger",
          data: barData,
          backgroundColor: `${THEME.meadow}cc`,
          borderColor: THEME.foreground,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      scales: {
        x: {
          ticks: { color: THEME.foreground, font: { family: FONT, size: 11 } },
          grid: { color: `${THEME.foreground}18` },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: THEME.foreground,
            font: { family: FONT, size: 11 },
            precision: 0,
          },
          grid: { color: `${THEME.foreground}18` },
        },
      },
      plugins: {
        ...commonChartOptions.plugins,
        legend: { display: false },
        title: {
          display: true,
          text: hasRows ? "Tellinger per land" : "Tellinger per land (ingen data)",
          color: THEME.foreground,
          font: { family: FONT, size: 15, weight: "600" },
        },
      },
    },
  });

  const tPriv = traffic.privat;
  const tYrk = traffic.yrkes;
  const trafficTotal = tPriv + tYrk;
  const trafficLabels =
    trafficTotal > 0 ? ["Privat", "Yrkestrafikk"] : ["Ingen data"];
  const trafficData = trafficTotal > 0 ? [tPriv, tYrk] : [1];
  const trafficColors =
    trafficTotal > 0
      ? [THEME.meadow, THEME.terra]
      : [`${THEME.foreground}33`];

  const trafficChart = new Chart(trafficCanvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: trafficLabels,
      datasets: [
        {
          data: trafficData,
          backgroundColor: trafficColors,
          borderColor: THEME.background,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        title: {
          display: true,
          text: "Privat vs yrkestrafikk",
          color: THEME.foreground,
          font: { family: FONT, size: 15, weight: "600" },
        },
        tooltip: {
          ...commonChartOptions.plugins.tooltip,
          callbacks: {
            label(ctx) {
              if (trafficTotal === 0) return "Ingen tellinger";
              const v = ctx.raw;
              const pct =
                trafficTotal > 0
                  ? Math.round((v / trafficTotal) * 100)
                  : 0;
              return `${ctx.label}: ${v} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  const carKeys = CAR_LABEL_KEYS;
  const carPalette = [
    THEME.meadow,
    THEME.terra,
    `${THEME.meadow}99`,
    `${THEME.terra}cc`,
    `${THEME.foreground}55`,
  ];

  const carTotal = carKeys.reduce((s, k) => s + (carTypes[k] ?? 0), 0);
  const carLabelsResolved = carTotal > 0 ? carKeys.map((k) => CAR_LABELS[k]) : ["Ingen data"];
  const carDataResolved = carTotal > 0 ? carKeys.map((k) => carTypes[k] ?? 0) : [1];
  const carColorsResolved =
    carTotal > 0 ? carPalette : [`${THEME.foreground}33`];

  const carTypeChart = new Chart(carTypesCanvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: carLabelsResolved,
      datasets: [
        {
          data: carDataResolved,
          backgroundColor: carColorsResolved,
          borderColor: THEME.background,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        title: {
          display: true,
          text: "Biltyper",
          color: THEME.foreground,
          font: { family: FONT, size: 15, weight: "600" },
        },
        tooltip: {
          ...commonChartOptions.plugins.tooltip,
          callbacks: {
            label(ctx) {
              if (carTotal === 0) return "Ingen tellinger";
              const v = ctx.raw;
              const pct = carTotal > 0 ? Math.round((v / carTotal) * 100) : 0;
              return `${ctx.label}: ${v} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  return function destroyDashboard() {
    barChart.destroy();
    trafficChart.destroy();
    carTypeChart.destroy();
    map.remove();
  };
}
