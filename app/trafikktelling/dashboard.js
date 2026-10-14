/**
 * Kart og diagrammer for statistikksiden.
 * Periodefilter og tall ligger i statsModel.ts. update() tegner på nytt.
 */
import L from "leaflet";
import Chart from "chart.js/auto";
import "leaflet/dist/leaflet.css";
import { buildView } from "./statsModel";

/** R902-palett, samme verdier som .trafikktelling i globals.css */
const THEME = {
  background: "#ffffff",
  foreground: "#444f55",
  orange: "#ff9600",
  blue: "#077197",
  green: "#158925",
  gray: "#dadada",
  red: "#b63434",
};

const FONT_FALLBACK = "Arial, Helvetica, sans-serif";
const NORWAY_VIEW = { center: [65, 13], zoom: 4 };
const CAR_PALETTE = [
  THEME.orange,
  THEME.blue,
  THEME.green,
  THEME.foreground,
  THEME.red,
  THEME.gray,
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function countMarker() {
  return L.divIcon({
    className: "vv-count-marker",
    html: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function chartOptions(fontFamily) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: THEME.foreground,
          font: { family: fontFamily, size: 12 },
        },
      },
      tooltip: {
        bodyFont: { family: fontFamily },
        titleFont: { family: fontFamily },
      },
    },
  };
}

function axisScale(fontFamily) {
  return {
    ticks: { color: THEME.foreground, font: { family: fontFamily, size: 11 } },
    grid: { color: `${THEME.foreground}18` },
  };
}

function titlePlugin(fontFamily, text) {
  return {
    display: true,
    text,
    color: THEME.foreground,
    font: { family: fontFamily, size: 15, weight: "600" },
  };
}

/**
 * @param {HTMLElement} root
 * @returns {{ update: (rows: unknown[], period: { from: Date | null, to: Date | null, incomplete: boolean, id: string }) => void, destroy: () => void }}
 */
export function createDashboard(root) {
  const fontFamily = getComputedStyle(root).fontFamily || FONT_FALLBACK;
  const commonChartOptions = chartOptions(fontFamily);
  const mapEl = root.querySelector("[data-dashboard-map]");
  const timeCanvas = root.querySelector('[data-chart="time"]');
  const barCanvas = root.querySelector('[data-chart="bars"]');
  const trafficCanvas = root.querySelector('[data-chart="traffic"]');
  const carTypesCanvas = root.querySelector('[data-chart="car-types"]');

  if (!mapEl || !timeCanvas || !barCanvas || !trafficCanvas || !carTypesCanvas) {
    console.warn("createDashboard: mangler DOM-elementer");
    return { update() {}, destroy() {} };
  }

  const map = L.map(mapEl, {
    scrollWheelZoom: true,
    attributionControl: true,
  }).setView(NORWAY_VIEW.center, NORWAY_VIEW.zoom);

  L.tileLayer(
    "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
    {
      attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
      maxZoom: 18,
    },
  ).addTo(map);

  const markers = L.layerGroup().addTo(map);
  const countIcon = countMarker();

  Chart.defaults.color = THEME.foreground;
  Chart.defaults.font.family = fontFamily;

  const live = { trafficTotal: 0, carTotal: 0 };

  const timeChart = new Chart(timeCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Antall tellinger",
          data: [],
          backgroundColor: THEME.orange,
          borderWidth: 0,
          borderRadius: 0,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      scales: {
        x: axisScale(fontFamily),
        y: {
          ...axisScale(fontFamily),
          beginAtZero: true,
          ticks: { ...axisScale(fontFamily).ticks, precision: 0 },
        },
      },
      plugins: {
        ...commonChartOptions.plugins,
        legend: { display: false },
        title: titlePlugin(fontFamily, "Tellinger over tid"),
      },
    },
  });

  const barChart = new Chart(barCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Antall tellinger",
          data: [],
          backgroundColor: THEME.blue,
          borderWidth: 0,
          borderRadius: 0,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      scales: {
        x: axisScale(fontFamily),
        y: {
          ...axisScale(fontFamily),
          beginAtZero: true,
          ticks: { ...axisScale(fontFamily).ticks, precision: 0 },
        },
      },
      plugins: {
        ...commonChartOptions.plugins,
        legend: { display: false },
        title: titlePlugin(fontFamily, "Tellinger per land"),
      },
    },
  });

  const trafficChart = new Chart(trafficCanvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["Ingen data"],
      datasets: [
        {
          data: [1],
          backgroundColor: [`${THEME.foreground}33`],
          borderColor: THEME.background,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        title: titlePlugin(fontFamily, "Privat vs yrkestrafikk"),
        tooltip: {
          ...commonChartOptions.plugins.tooltip,
          callbacks: {
            label(ctx) {
              if (live.trafficTotal === 0) return "Ingen tellinger";
              const value = Number(ctx.raw);
              const pct = Math.round((value / live.trafficTotal) * 100);
              return `${ctx.label}: ${value} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  const carTypeChart = new Chart(carTypesCanvas.getContext("2d"), {
    type: "pie",
    data: {
      labels: ["Ingen data"],
      datasets: [
        {
          data: [1],
          backgroundColor: [`${THEME.foreground}33`],
          borderColor: THEME.background,
          borderWidth: 2,
        },
      ],
    },
    options: {
      ...commonChartOptions,
      plugins: {
        ...commonChartOptions.plugins,
        title: titlePlugin(fontFamily, "Biltyper"),
        tooltip: {
          ...commonChartOptions.plugins.tooltip,
          callbacks: {
            label(ctx) {
              if (live.carTotal === 0) return "Ingen tellinger";
              const value = Number(ctx.raw);
              const pct = Math.round((value / live.carTotal) * 100);
              return `${ctx.label}: ${value} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  let destroyed = false;

  function renderMarkers(points) {
    markers.clearLayers();
    if (points.length === 0) {
      map.setView(NORWAY_VIEW.center, NORWAY_VIEW.zoom);
      return;
    }

    const bounds = [];
    for (const point of points) {
      const marker = L.marker([point.lat, point.lng], { icon: countIcon });
      marker.bindPopup(
        `<strong>${escapeHtml(point.landName)}</strong><br/>${escapeHtml(point.typeLabel)}<br/>${escapeHtml(point.whenLabel)}`,
      );
      markers.addLayer(marker);
      bounds.push([point.lat, point.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
      return;
    }
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }

  function update(rows, period) {
    if (destroyed) return;
    const view = buildView(rows, period);
    live.trafficTotal = view.privat + view.yrkes;
    live.carTotal = view.carTypes.reduce((sum, item) => sum + item.count, 0);

    timeChart.data.labels =
      view.buckets.length > 0 ? view.buckets.map((bucket) => bucket.label) : ["Ingen data"];
    timeChart.data.datasets[0].data =
      view.buckets.length > 0 ? view.buckets.map((bucket) => bucket.count) : [0];
    timeChart.options.plugins.title.text = view.bucketTitle;
    timeChart.update();

    const hasCountries = view.countries.length > 0;
    barChart.data.labels = hasCountries
      ? view.countries.map((country) => country.name)
      : ["Ingen data"];
    barChart.data.datasets[0].data = hasCountries
      ? view.countries.map((country) => country.count)
      : [0];
    barChart.update();

    if (live.trafficTotal > 0) {
      trafficChart.data.labels = ["Privat", "Yrkestrafikk"];
      trafficChart.data.datasets[0].data = [view.privat, view.yrkes];
      trafficChart.data.datasets[0].backgroundColor = [THEME.blue, THEME.green];
    } else {
      trafficChart.data.labels = ["Ingen data"];
      trafficChart.data.datasets[0].data = [1];
      trafficChart.data.datasets[0].backgroundColor = [`${THEME.foreground}33`];
    }
    trafficChart.update();

    if (live.carTotal > 0) {
      carTypeChart.data.labels = view.carTypes.map((item) => item.label);
      carTypeChart.data.datasets[0].data = view.carTypes.map((item) => item.count);
      carTypeChart.data.datasets[0].backgroundColor = CAR_PALETTE;
    } else {
      carTypeChart.data.labels = ["Ingen data"];
      carTypeChart.data.datasets[0].data = [1];
      carTypeChart.data.datasets[0].backgroundColor = [`${THEME.foreground}33`];
    }
    carTypeChart.update();

    renderMarkers(view.points);
    map.invalidateSize();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    timeChart.destroy();
    barChart.destroy();
    trafficChart.destroy();
    carTypeChart.destroy();
    map.remove();
  }

  requestAnimationFrame(() => {
    if (!destroyed) map.invalidateSize();
  });

  return { update, destroy };
}
