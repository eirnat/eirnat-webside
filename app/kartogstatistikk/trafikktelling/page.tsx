"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Car,
  Bus,
  Truck,
  Motorbike,
  Globe,
  BadgeCheck,
  User,
  Briefcase,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { DashboardSection } from "../DashboardSection";
import { GOOGLE_SCRIPT_URL } from "../google-script";

// Live klokke (viser "Nå: HH:MM:SS", oppdateres hvert sekund)
function useLiveClock() {
  const [time, setTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("nb-NO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return time;
}

// GPS ved sidelasting
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

// Land med navn, emoji-flag og country codes til ev framtidig bruk
const FLAG_COUNTRIES = [
  {
    name: "Norge",
    emoji: "🇳🇴",
    code: "NO",
  },
  {
    name: "Sverige",
    emoji: "🇸🇪",
    code: "SE",
  },
  {
    name: "Danmark",
    emoji: "🇩🇰",
    code: "DK",
  },
  {
    name: "Tyskland",
    emoji: "🇩🇪",
    code: "DE",
  },
  {
    name: "Polen",
    emoji: "🇵🇱",
    code: "PL",
  },
  {
    name: "Litauen",
    emoji: "🇱🇹",
    code: "LT",
  },
  {
    name: "Finland",
    emoji: "🇫🇮",
    code: "FI",
  },
  {
    name: "Nederland",
    emoji: "🇳🇱",
    code: "NL",
  },
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

const ALL_COUNTRIES = getAllCountryOptions();
const TRAFFIC_TYPES = [
  {
    key: "privat",
    label: "Privat",
    icon: User,
    color: "text-meadow",
  },
  {
    key: "yrkes",
    label: "Yrkestrafikk",
    icon: Briefcase,
    color: "text-meadow",
  },
];

const CAR_TYPES = [
  {
    key: "personbil",
    label: "Personbil",
    icon: Car,
    color: "text-meadow",
  },
  {
    key: "lastebil",
    label: "Lastebil",
    icon: Truck,
    color: "text-meadow",
  },
  {
    key: "buss",
    label: "Buss",
    icon: Bus,
    color: "text-meadow",
  },
  {
    key: "motorsykkel",
    label: "Motorsykkel",
    icon: Motorbike,
    color: "text-meadow",
  },
  {
    key: "annet",
    label: "Annet",
    icon: MoreHorizontal,
    color: "text-meadow",
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function TrafikktellerPage() {
  const liveTime = useLiveClock();
  const { gps, gpsStatus } = useGeolocation();

  // Stegvalg (0=land, 1=trafikktype, 2=biltype)
  const [step, setStep] = useState(0);

  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [selectedTraffic, setSelectedTraffic] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // refs til seksjonene for smooth scroll
  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const resultatRef = useRef<HTMLDivElement>(null);

  // Scroll til ønsket steg (smooth)
  function scrollToRef(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Håndter valg og auto-scroll til neste steg
  function velgLand(code: string) {
    setSelectedCountry(code);
    setTimeout(() => {
      setStep(1);
      scrollToRef(step2Ref);
    }, 180); // la brev animasjonen på valgt flagg få vises
  }

  function velgLandDropdown(event: React.ChangeEvent<HTMLSelectElement>) {
    const code = event.target.value;
    setSelectedCountry(code);
    if (code) {
      setTimeout(() => {
        setStep(1);
        scrollToRef(step2Ref);
      }, 180);
    }
  }

  function velgTrafikk(key: string) {
    setSelectedTraffic(key);
    setTimeout(() => {
      setStep(2);
      scrollToRef(step3Ref);
    }, 180);
  }

  function velgBil(key: string) {
    setSelectedCar(key);
    // Ikke auto-scroll, vis skjema-knapp istedet
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
          // no-cors tillater bare enkle Content-Type-verdier; Apps Script kan likevel parse JSON fra body
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
      setTimeout(() => {
        scrollToRef(resultatRef);
      }, 120);
      await sleep(1300);
      setSelectedCountry(null);
      setSelectedTraffic(null);
      setSelectedCar(null);
      setStep(0);
    } catch {
      setSendError("Klarte ikke å sende inn data.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground font-sans">
      {/* Topptittel */}
      <div className="border-b border-foreground/10 bg-background/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 pt-2 pb-1 text-center text-xs text-foreground/50 tabular-nums">
          Nå: {liveTime}
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-1 text-center text-xs text-foreground/55">
          {gpsStatus === "pending" && "Henter posisjon..."}
          {gpsStatus === "success" && "📍 Posisjon hentet"}
          {gpsStatus === "failure" && "⚠️ GPS ikke tilgjengelig"}
        </div>
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <Link
            href="/kartogstatistikk"
            className="inline-flex items-center gap-2 rounded-full bg-terra px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-meadow hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Tilbake til Kart og statistikk
          </Link>
          <h1 className="text-lg md:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6 text-meadow" />
            Telleverktøy: Trafikktelling (3 steg)
          </h1>
        </div>
      </div>

      {/* Steg 1: Land */}
      <section ref={step1Ref} className="px-6 py-14 md:py-20">
        <div className="max-w-2xl mx-auto text-center mb-4">
          <div className="text-meadow font-semibold uppercase tracking-widest mb-2">
            Steg 1
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            Velg land
          </h2>
          <p className="text-base md:text-lg text-foreground/80">
            Hvilket land har kjøretøyet tilhørighet til?
          </p>
        </div>
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-3 md:gap-5 mb-4 pt-2">
          {FLAG_COUNTRIES.map((c) => (
            <button
              key={c.code}
              aria-label={c.name}
              className={
                `transition-all flex flex-col items-center justify-center border-2 rounded-xl py-3 md:py-4 text-3xl md:text-4xl shadow-sm font-medium ` +
                (selectedCountry === c.code
                  ? `border-meadow bg-meadow/10 ring-2 ring-meadow`
                  : `border-foreground/10 bg-background hover:border-meadow/60`)
              }
              onClick={() => velgLand(c.code)}
            >
              <span className="mb-1">{c.emoji}</span>
              <span className="text-xs md:text-[13px] font-medium text-foreground mb-0.5">
                {c.name}
              </span>
            </button>
          ))}
        </div>
        <div className="max-w-xs mx-auto mt-2">
          <select
            className="w-full rounded-lg border border-foreground/15 px-4 py-2 text-base md:text-lg bg-white/30 appearance-none transition focus:border-meadow focus:ring-2 focus:ring-meadow mt-1"
            value={selectedCountry ?? ""}
            onChange={velgLandDropdown}
            aria-label="Velg land"
          >
            <option value="">Velg land...</option>
            {ALL_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Steg 2: Trafikktype */}
      <section
        ref={step2Ref}
        className={`px-6 py-14 md:py-20 transition-opacity duration-300 ${step >= 1 ? "opacity-100" : "opacity-70 pointer-events-none select-none"}`}
      >
        <div className="max-w-2xl mx-auto text-center mb-4">
          <div className="text-meadow font-semibold uppercase tracking-widest mb-2">
            Steg 2
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            Trafikktype
          </h2>
          <p className="text-base md:text-lg text-foreground/80">
            Hvilken type trafikk dreier det seg om?
          </p>
        </div>
        <div className="max-w-lg mx-auto grid grid-cols-2 gap-5 pt-3">
          {TRAFFIC_TYPES.map((t) => (
            <button
              key={t.key}
              aria-label={t.label}
              className={
                `transition-all flex flex-col items-center justify-center border-2 rounded-2xl py-6 shadow-md font-semibold text-xl md:text-2xl ` +
                (selectedTraffic === t.key
                  ? `border-meadow bg-meadow/10 ring-2 ring-meadow`
                  : `border-foreground/10 bg-background hover:border-meadow/70`)
              }
              onClick={() => velgTrafikk(t.key)}
              disabled={!selectedCountry || (!!selectedTraffic && selectedTraffic !== t.key)}
            >
              <t.icon className={`mb-2 h-10 w-10 ${t.color}`} />
              <span className="tracking-tight">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Steg 3: Biltype */}
      <section
        ref={step3Ref}
        className={`px-6 py-14 md:py-20 transition-opacity duration-300 ${step >= 2 ? "opacity-100" : "opacity-70 pointer-events-none select-none"}`}
      >
        <div className="max-w-2xl mx-auto text-center mb-4">
          <div className="text-meadow font-semibold uppercase tracking-widest mb-2">
            Steg 3
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-2">
            Biltype
          </h2>
          <p className="text-base md:text-lg text-foreground/80">
            Hvilken type kjøretøy gjelder tellingen?
          </p>
        </div>

        <div className="max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-4 pt-2">
          {CAR_TYPES.map((c) => (
            <button
              key={c.key}
              aria-label={c.label}
              className={
                `transition-all flex flex-col items-center justify-center border-2 rounded-2xl py-7 px-0 shadow-md font-semibold text-lg md:text-xl ` +
                (selectedCar === c.key
                  ? `border-meadow bg-meadow/10 ring-2 ring-meadow`
                  : `border-foreground/10 bg-background hover:border-meadow/70`)
              }
              onClick={() => velgBil(c.key)}
              disabled={!selectedTraffic || (!!selectedCar && selectedCar !== c.key)}
            >
              <c.icon className={`mb-2 h-8 w-8 ${c.color}`} />
              <span className="tracking-tight">{c.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Bekreft-knapp */}
      <div className="max-w-lg mx-auto mt-12 mb-8 flex flex-col items-center">
        <button
          type="button"
          disabled={
            !selectedCountry || !selectedTraffic || !selectedCar || sending
          }
          className={
            "w-full rounded-2xl px-8 py-5 bg-meadow text-background shadow-2xl font-extrabold text-2xl tracking-tight transition-all hover:bg-meadow/90 focus:bg-meadow/80 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          }
          onClick={sendData}
        >
          {sending ? "Sender..." : "Bekreft og send"}
        </button>
        {sendError && (
          <div className="mt-4 text-red-600 text-center text-base font-medium">
            {sendError}
          </div>
        )}
      </div>

      <DashboardSection />

      {/* Bekreftelse */}
      <div ref={resultatRef} className="max-w-xl mx-auto px-6 pb-20 md:pb-28 min-h-[70px] flex items-center justify-center">
        {sent && (
          <div className="rounded-2xl bg-meadow/20 border border-meadow flex flex-col items-center gap-2 px-7 py-6 shadow mt-2">
            <BadgeCheck className="h-8 w-8 text-meadow mb-1" />
            <div className="text-lg text-foreground font-semibold mb-0.5">
              Tellingen er registrert!
            </div>
            <div className="text-base text-foreground/80">
              Takk for bidraget.
            </div>
          </div>
        )}
      </div>

    </main>
  );
}
