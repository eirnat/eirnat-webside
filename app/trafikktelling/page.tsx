"use client";

import { useEffect, useState } from "react";
import {
  Car,
  Bus,
  Truck,
  Motorbike,
  BadgeCheck,
  User,
  Briefcase,
  MoreHorizontal,
} from "lucide-react";
import { GOOGLE_SCRIPT_URL } from "./google-script";

function formatClock(date: Date) {
  return date.toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function useLiveClock() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const update = () => setTime(formatClock(new Date()));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

function useGeolocation() {
  const [gps, setGps] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null,
  });
  const [gpsStatus, setGpsStatus] = useState<"pending" | "success" | "failure">(
    "pending"
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setGpsStatus("failure"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("success");
      },
      () => {
        setGpsStatus("failure");
      }
    );
  }, []);

  return { gps, gpsStatus };
}

const FLAG_COUNTRIES = [
  { name: "Norge", emoji: "🇳🇴", code: "NO" },
  { name: "Sverige", emoji: "🇸🇪", code: "SE" },
  { name: "Danmark", emoji: "🇩🇰", code: "DK" },
  { name: "Tyskland", emoji: "🇩🇪", code: "DE" },
  { name: "Polen", emoji: "🇵🇱", code: "PL" },
  { name: "Litauen", emoji: "🇱🇹", code: "LT" },
  { name: "Finland", emoji: "🇫🇮", code: "FI" },
  { name: "Nederland", emoji: "🇳🇱", code: "NL" },
];

const EXCLUDED_REGION_CODES = new Set([
  "AC",
  "CP",
  "CQ",
  "DG",
  "EA",
  "EU",
  "EZ",
  "IC",
  "QO",
  "TA",
  "UN",
  "XA",
  "XB",
  "ZZ",
]);

function getAllCountryOptions() {
  const regionNames = new Intl.DisplayNames(["nb"], { type: "region" });
  const countries: { code: string; name: string }[] = [];

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      if (EXCLUDED_REGION_CODES.has(code)) continue;

      const name = regionNames.of(code);
      if (!name || name === code) continue;
      if (name.toLowerCase().startsWith("ukjent")) continue;

      countries.push({ code, name });
    }
  }

  countries.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  return countries;
}

function useCountryOptions() {
  const [countries, setCountries] = useState<{ code: string; name: string }[]>(
    []
  );

  useEffect(() => {
    setCountries(getAllCountryOptions());
  }, []);

  return countries;
}

const TRAFFIC_TYPES = [
  { key: "privat", label: "Privat", icon: User },
  { key: "yrkes", label: "Yrkestrafikk", icon: Briefcase },
];

const CAR_TYPES = [
  { key: "personbil", label: "Personbil", icon: Car },
  { key: "lastebil", label: "Lastebil", icon: Truck },
  { key: "buss", label: "Buss", icon: Bus },
  { key: "motorsykkel", label: "Motorsykkel", icon: Motorbike },
  { key: "annet", label: "Annet", icon: MoreHorizontal },
];

const STEPS = [
  { id: 0, label: "Land" },
  { id: 1, label: "Trafikk" },
  { id: 2, label: "Kjøretøy" },
] as const;

const DRAFT_KEY = "trafikktelling-draft";

type Draft = {
  step: number;
  country: string | null;
  traffic: string | null;
  car: string | null;
};

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Draft>;
    const country =
      typeof data.country === "string" && /^[A-Z]{2}$/.test(data.country)
        ? data.country
        : null;
    const traffic =
      data.traffic === "privat" || data.traffic === "yrkes" ? data.traffic : null;
    const car =
      typeof data.car === "string" && CAR_TYPES.some((c) => c.key === data.car)
        ? data.car
        : null;
    let step = data.step === 1 || data.step === 2 ? data.step : 0;
    if (!country) step = 0;
    else if (step === 2 && !traffic) step = 1;
    return { step, country, traffic, car };
  } catch {
    return null;
  }
}

function choiceClass(selected: boolean) {
  return (
    "flex min-h-20 flex-col items-center justify-center border-2 px-2 py-4 text-center font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vv-blue disabled:cursor-not-allowed disabled:opacity-40 " +
    (selected
      ? "border-vv-orange bg-vv-ink text-white"
      : "border-vv-gray bg-white text-vv-ink hover:border-vv-ink")
  );
}

export default function TrafikktellerPage() {
  const liveTime = useLiveClock();
  const { gps, gpsStatus } = useGeolocation();
  const allCountries = useCountryOptions();

  const [step, setStep] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedTraffic, setSelectedTraffic] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const readyToSend = Boolean(selectedCountry && selectedTraffic && selectedCar);

  useEffect(() => {
    const draft = readDraft();
    if (draft) {
      setStep(draft.step);
      setSelectedCountry(draft.country);
      setSelectedTraffic(draft.traffic);
      setSelectedCar(draft.car);
    }
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const draft: Draft = {
      step,
      country: selectedCountry,
      traffic: selectedTraffic,
      car: selectedCar,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draftReady, step, selectedCountry, selectedTraffic, selectedCar]);

  function countryName(code: string | null) {
    if (!code) return null;
    return (
      FLAG_COUNTRIES.find((c) => c.code === code)?.name ??
      allCountries.find((c) => c.code === code)?.name ??
      code
    );
  }

  function canOpenStep(index: number) {
    if (index === 0) return true;
    if (index === 1) return Boolean(selectedCountry);
    return Boolean(selectedCountry && selectedTraffic);
  }

  function velgLand(code: string) {
    setSent(false);
    setSelectedCountry(code);
    setStep(1);
  }

  function velgLandDropdown(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    setSent(false);
    setSelectedCountry(code || null);
    if (code) setStep(1);
  }

  function velgTrafikk(key: string) {
    setSent(false);
    setSelectedTraffic(key);
    setStep(2);
  }

  function velgBil(key: string) {
    setSent(false);
    setSelectedCar(key);
  }

  async function sendData() {
    setSending(true);
    setSendError(null);
    setSent(false);

    const land = selectedCountry;
    const trafikk = selectedTraffic;
    const type = selectedCar;

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify({
          land,
          trafikk,
          type,
          lat: gps.lat,
          lng: gps.lng,
        }),
      });
      setSent(true);
      setSelectedCar(null);
      setStep(2);
    } catch {
      setSendError("Klarte ikke å sende inn data.");
    } finally {
      setSending(false);
    }
  }

  const gpsLabel =
    gpsStatus === "pending"
      ? "Henter posisjon"
      : gpsStatus === "success"
        ? "Posisjon hentet"
        : "GPS ikke tilgjengelig";

  const summary = [
    countryName(selectedCountry),
    TRAFFIC_TYPES.find((t) => t.key === selectedTraffic)?.label,
    CAR_TYPES.find((c) => c.key === selectedCar)?.label,
  ].filter(Boolean);

  return (
    <main className={readyToSend ? "pb-28" : undefined}>
      <div className="flex justify-end border-b border-vv-gray px-4 py-2 text-xs text-vv-ink sm:px-6">
        <div className="text-right">
          <div className="tabular-nums">Nå: {liveTime}</div>
          <div>{gpsLabel}</div>
        </div>
      </div>

      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-3 border border-vv-gray" role="tablist" aria-label="Steg">
          {STEPS.map((item, index) => {
            const open = canOpenStep(item.id);
            const active = step === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`steg-tab-${item.id}`}
                aria-selected={active}
                aria-controls={`steg-panel-${item.id}`}
                disabled={!open}
                onClick={() => setStep(item.id)}
                className={
                  "px-2 py-3 text-xs font-semibold uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-vv-blue disabled:cursor-not-allowed sm:text-sm " +
                  (active
                    ? "border-t-4 border-t-vv-orange bg-vv-ink text-white"
                    : open
                      ? "bg-white text-vv-ink hover:bg-vv-mist"
                      : "bg-vv-mist text-vv-ink/45")
                }
              >
                {index + 1} {item.label}
              </button>
            );
          })}
        </div>

        {summary.length > 0 && step > 0 && (
          <p className="mt-4 text-sm text-vv-ink">{summary.join(" · ")}</p>
        )}

        <div
          role="tabpanel"
          id={`steg-panel-${step}`}
          aria-labelledby={`steg-tab-${step}`}
          className="mt-8"
        >
          {step === 0 && (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Velg land
              </h2>
              <p className="mt-2 text-base">
                Hvilket land har kjøretøyet tilhørighet til?
              </p>
              <div className="mt-6 grid grid-cols-4 gap-3">
                {FLAG_COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    aria-label={c.name}
                    aria-pressed={selectedCountry === c.code}
                    className={choiceClass(selectedCountry === c.code)}
                    onClick={() => velgLand(c.code)}
                  >
                    <span className="text-2xl leading-none sm:text-3xl" aria-hidden="true">
                      {c.emoji}
                    </span>
                    <span className="mt-2 text-xs font-normal sm:text-sm">{c.name}</span>
                  </button>
                ))}
              </div>
              <label className="mt-6 block max-w-sm text-sm">
                <span className="mb-1 block">Andre land</span>
                <select
                  className="w-full border-2 border-vv-gray bg-white px-3 py-3 text-base text-vv-ink focus:border-vv-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vv-blue"
                  value={selectedCountry ?? ""}
                  onChange={velgLandDropdown}
                  aria-label="Velg land"
                >
                  <option value="">Velg land</option>
                  {allCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Trafikktype
              </h2>
              <p className="mt-2 text-base">Hvilken type trafikk dreier det seg om?</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {TRAFFIC_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    aria-label={t.label}
                    aria-pressed={selectedTraffic === t.key}
                    className={choiceClass(selectedTraffic === t.key) + " min-h-32 text-lg sm:text-xl"}
                    onClick={() => velgTrafikk(t.key)}
                  >
                    <t.icon
                      className={`mb-2 h-8 w-8 ${selectedTraffic === t.key ? "text-white" : "text-vv-ink"}`}
                      aria-hidden="true"
                    />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Kjøretøy
              </h2>
              <p className="mt-2 text-base">Hvilken type kjøretøy gjelder tellingen?</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {CAR_TYPES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    aria-label={c.label}
                    aria-pressed={selectedCar === c.key}
                    className={choiceClass(selectedCar === c.key) + " min-h-28 text-sm sm:text-base"}
                    onClick={() => velgBil(c.key)}
                  >
                    <c.icon
                      className={`mb-2 h-7 w-7 ${selectedCar === c.key ? "text-white" : "text-vv-ink"}`}
                      aria-hidden="true"
                    />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {sendError && (
          <div
            className="mt-6 border border-vv-red bg-vv-red-bg px-4 py-3 text-sm text-vv-red"
            role="alert"
          >
            {sendError}
          </div>
        )}

        {sent && (
          <div className="mt-6 flex items-start gap-3 border border-vv-green bg-vv-green-bg px-4 py-4">
            <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-vv-green" aria-hidden="true" />
            <div>
              <p className="font-semibold">Tellingen er registrert</p>
              <p className="mt-1 text-sm">Takk for bidraget.</p>
            </div>
          </div>
        )}
      </section>

      {readyToSend && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-vv-gray bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-vv-ink">{summary.join(" · ")}</p>
            <button
              type="button"
              disabled={sending}
              className="bg-vv-ink px-6 py-4 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vv-blue disabled:cursor-not-allowed disabled:opacity-60 sm:shrink-0"
              onClick={sendData}
            >
              {sending ? "Sender" : "Bekreft og send"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
