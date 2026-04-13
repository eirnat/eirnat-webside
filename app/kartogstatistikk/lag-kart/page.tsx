"use client";

import dynamic from "next/dynamic";
import { Download, GitBranch, List, RotateCcw, Slash, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type ActiveTool, type KartMotorHandle } from "@/components/KartMotor";

const KartMotor = dynamic(() => import("@/components/KartMotor"), {
  ssr: false,
  loading: () => <div className="h-full w-full">Laster kartmodul...</div>,
});

const toolButtonBase =
  "w-full rounded-xl px-4 py-3 text-sm font-semibold border shadow-sm transition-all hover:-translate-y-0.5 active:scale-95";

const toolButtonGrid =
  `${toolButtonBase} flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 text-center`;

const toolButtonFull =
  `${toolButtonBase} flex items-center justify-center gap-2`;

const signIconButtonBase =
  "flex size-[3.25rem] shrink-0 items-center justify-center rounded-xl border shadow-sm transition-all hover:-translate-y-0.5 active:scale-95";

const quickActionBtn =
  "flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center text-[10px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 active:scale-95";

export default function LagKartPage() {
  const mapRef = useRef<KartMotorHandle | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>("none");
  const [onClear, setOnClear] = useState(0);
  const [onUndo, setOnUndo] = useState(0);
  const [showLegend, setShowLegend] = useState(true);
  const [editingAnnotation, setEditingAnnotation] = useState<{
    id: string;
    text: string;
    size: number;
    rotation: number;
    coordinates: [number, number];
    hasBackground: boolean;
  } | null>(null);
  const [mapStyle, setMapStyle] = useState<"dataviz" | "streets">("streets");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    document.title = "Lag omkjøringskart - eirnat.no";
  }, []);

  useEffect(() => {
    const handleUndoShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;

      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      event.preventDefault();
      setOnUndo((prev) => prev + 1);
    };

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, []);

  const handleEditingAnnotationChange = useCallback(
    (annotation: { id: string; text: string; size: number; rotation: number; coordinates: [number, number]; hasBackground: boolean } | null) => {
      setEditingAnnotation((prev) => {
        if (!annotation) return null;
        if (
          prev &&
          prev.id === annotation.id &&
          prev.text === annotation.text &&
          prev.size === annotation.size &&
          prev.rotation === annotation.rotation &&
          prev.coordinates[0] === annotation.coordinates[0] &&
          prev.coordinates[1] === annotation.coordinates[1] &&
          prev.hasBackground === annotation.hasBackground
        ) {
          return prev;
        }
        return annotation;
      });
    },
    []
  );

  const handleTextAnnotationCreated = useCallback(() => {
    setActiveTool("none");
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {!isMounted ? (
        <div className="flex h-[100dvh] items-center justify-center text-slate-600">
          <div className="text-sm">Laster …</div>
        </div>
      ) : (
        <div className="flex h-[100dvh] min-h-0 flex-col lg:flex-row">
        <aside className="order-2 flex h-auto w-full max-h-[25vh] shrink-0 flex-col overflow-y-auto border-t border-slate-200 bg-white p-4 lg:order-1 lg:h-full lg:max-h-none lg:min-h-0 lg:w-80 lg:max-w-xs lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-t-0 lg:p-6">
          {/* Laptop: vertikal meny */}
          <div className="hidden min-h-0 flex-1 flex-col gap-6 overflow-y-auto lg:flex">
            <div className="hidden shrink-0 lg:block">
              <h1 className="text-xl font-bold tracking-tight">
                Lag omkjøringskart
              </h1>
              <details className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 shadow-sm">
                <summary className="cursor-pointer list-none whitespace-nowrap text-sm font-bold text-slate-800">
                  Se bruksanvisning
                </summary>
                <div className="mt-3 text-sm text-slate-700">
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      <span className="font-medium">Zoom helt inn:</span> Zoom inn til
                      gatenivå før du begynner å tegne. Dette er avgjørende for at
                      linjene skal treffe riktig.
                    </li>
                    <li>
                      <span className="font-medium">Tegn tiltak:</span> Velg
                      &quot;Stengt veg&quot; eller &quot;Alternativ rute&quot; og trykk på
                      veglenkene. (Tips: En linje er nok selv om både vei og fortau
                      stenges).
                    </li>
                    <li>
                      <span className="font-medium">Plasser skilt:</span> Sett ut
                      stoppskilt der det er behov for det.
                    </li>
                    <li>
                      <span className="font-medium">Velg utsnitt:</span> Juster kartet
                      og velg karttype. Det du ser i bildet er det som blir med på
                      fila.
                    </li>
                    <li>
                      <span className="font-medium">Legg til tekst:</span> Sett inn
                      tekstbokser helt til slutt (da slipper du å flytte dem hvis du
                      endrer utsnittet).
                    </li>
                    <li>
                      <span className="font-medium">Last ned:</span> Trykk på
                      &quot;Last ned som PNG&quot; for å lagre kartet på din maskin.
                    </li>
                  </ol>
                </div>
              </details>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-slate-500">
                VERKTØY
              </div>
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTool((prev) =>
                        prev === "closed" ? "none" : "closed"
                      )
                    }
                    className={`${toolButtonGrid} ${
                      activeTool === "closed"
                        ? "border-2 border-red-600 bg-red-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Slash
                      className={`h-5 w-5 shrink-0 ${
                        activeTool === "closed"
                          ? "text-white"
                          : "text-red-600"
                      }`}
                    />
                    <span>Stengt vei</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTool((prev) =>
                        prev === "detour" ? "none" : "detour"
                      )
                    }
                    className={`${toolButtonGrid} ${
                      activeTool === "detour"
                        ? "border-2 border-green-600 bg-green-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <GitBranch
                      className={`h-5 w-5 shrink-0 ${
                        activeTool === "detour"
                          ? "text-white"
                          : "text-green-600"
                      }`}
                    />
                    <span>Omkjøringsvei</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTool((prev) =>
                        prev === "text" ? "none" : "text"
                      )
                    }
                    className={`${toolButtonFull} min-w-0 flex-1 ${
                      activeTool === "text"
                        ? "border-2 border-slate-700 bg-slate-700 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Type
                      className={`h-5 w-5 shrink-0 ${
                        activeTool === "text"
                          ? "text-white"
                          : "text-slate-700"
                      }`}
                    />
                    Legg til tekst
                  </button>
                  <button
                    type="button"
                    title="Sett ut skilt"
                    aria-label="Sett ut skilt"
                    onClick={() =>
                      setActiveTool((prev) =>
                        prev === "sign" ? "none" : "sign"
                      )
                    }
                    className={`${signIconButtonBase} ${
                      activeTool === "sign"
                        ? "border-2 border-amber-600 bg-amber-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden
                    >
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="currentColor"
                        className={
                          activeTool === "sign"
                            ? "text-white"
                            : "text-[#E60000]"
                        }
                      />
                      <rect
                        x="6"
                        y="11"
                        width="12"
                        height="2.5"
                        fill={
                          activeTool === "sign" ? "#E60000" : "#ffffff"
                        }
                      />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLegend((prev) => !prev)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
                >
                  <List className="h-4 w-4 shrink-0" />
                  Vis/Skjul tegnforklaring
                </button>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-slate-500">
                KARTTYPE
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMapStyle("streets")}
                  className={`${toolButtonGrid} ${
                    mapStyle === "streets"
                      ? "border-2 border-slate-700 bg-slate-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>Detaljert</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("dataviz")}
                  className={`${toolButtonGrid} ${
                    mapStyle === "dataviz"
                      ? "border-2 border-slate-700 bg-slate-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>Enkelt</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setOnClear((prev) => prev + 1)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 active:scale-[0.98]"
              >
                Tøm kart
              </button>
              <button
                type="button"
                onClick={() => setOnUndo((prev) => prev + 1)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 active:scale-[0.98]"
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                Angre siste
              </button>
            </div>

            <button
              type="button"
              onClick={() => mapRef.current?.downloadAsPng()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-700 bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Download className="h-5 w-5 shrink-0" />
              Last ned kartbilde (PNG)
            </button>

            <div className="border-t border-slate-200 pt-4 text-[10px] uppercase tracking-wider text-slate-400">
              <div>Utviklet av Eirik Natlandsmyr</div>
              <a
                href="mailto:hei@eirnat.no"
                className="transition-colors hover:text-slate-500"
              >
                hei@eirnat.no
              </a>
            </div>
          </div>

          {/* Mobil: prioritert rad øverst, resten under i samme scroll (aside) */}
          <div className="flex flex-col lg:hidden">
            <div className="mb-4 grid w-full shrink-0 grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() =>
                setActiveTool((prev) => (prev === "closed" ? "none" : "closed"))
              }
              className={`${quickActionBtn} ${
                activeTool === "closed"
                  ? "border-2 border-red-600 bg-red-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Slash
                className={`h-4 w-4 shrink-0 ${
                  activeTool === "closed" ? "text-white" : "text-red-600"
                }`}
              />
              <span className="leading-tight">Stengt vei</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setActiveTool((prev) => (prev === "detour" ? "none" : "detour"))
              }
              className={`${quickActionBtn} ${
                activeTool === "detour"
                  ? "border-2 border-green-600 bg-green-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <GitBranch
                className={`h-4 w-4 shrink-0 ${
                  activeTool === "detour" ? "text-white" : "text-green-600"
                }`}
              />
              <span className="leading-tight">Omkjøring</span>
            </button>
            <button
              type="button"
              title="Sett ut skilt"
              aria-label="Sett ut skilt"
              onClick={() =>
                setActiveTool((prev) => (prev === "sign" ? "none" : "sign"))
              }
              className={`${quickActionBtn} ${
                activeTool === "sign"
                  ? "border-2 border-amber-600 bg-amber-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="currentColor"
                  className={
                    activeTool === "sign" ? "text-white" : "text-[#E60000]"
                  }
                />
                <rect
                  x="6"
                  y="11"
                  width="12"
                  height="2.5"
                  fill={activeTool === "sign" ? "#E60000" : "#ffffff"}
                />
              </svg>
              <span className="leading-tight">Skilt</span>
            </button>
            <button
              type="button"
              onClick={() => setOnUndo((prev) => prev + 1)}
              className={`${quickActionBtn} border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100`}
            >
              <RotateCcw className="h-4 w-4 shrink-0 text-slate-600" />
              <span className="leading-tight">Angre</span>
            </button>
            </div>

            <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-slate-500">
                TEKST
              </div>
              <button
                type="button"
                onClick={() =>
                  setActiveTool((prev) => (prev === "text" ? "none" : "text"))
                }
                className={`${toolButtonFull} w-full ${
                  activeTool === "text"
                    ? "border-2 border-slate-700 bg-slate-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Type
                  className={`h-5 w-5 shrink-0 ${
                    activeTool === "text" ? "text-white" : "text-slate-700"
                  }`}
                />
                Legg til tekst
              </button>
              <button
                type="button"
                onClick={() => setShowLegend((prev) => !prev)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
              >
                <List className="h-4 w-4 shrink-0" />
                Vis/Skjul tegnforklaring
              </button>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold tracking-wide text-slate-500">
                KARTTYPE
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMapStyle("streets")}
                  className={`${toolButtonGrid} ${
                    mapStyle === "streets"
                      ? "border-2 border-slate-700 bg-slate-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>Detaljert</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("dataviz")}
                  className={`${toolButtonGrid} ${
                    mapStyle === "dataviz"
                      ? "border-2 border-slate-700 bg-slate-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>Enkelt</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOnClear((prev) => prev + 1)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 active:scale-[0.98]"
            >
              Tøm kart
            </button>

            <button
              type="button"
              onClick={() => mapRef.current?.downloadAsPng()}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-blue-700 bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <Download className="h-5 w-5 shrink-0" />
              Last ned kartbilde (PNG)
            </button>

            <div className="border-t border-slate-200 pt-3 text-[10px] uppercase tracking-wider text-slate-400">
              <div>Utviklet av Eirik Natlandsmyr</div>
              <a
                href="mailto:hei@eirnat.no"
                className="transition-colors hover:text-slate-500"
              >
                hei@eirnat.no
              </a>
            </div>
            </div>
          </div>
        </aside>

        <section className="order-1 min-h-0 min-w-0 flex-1 lg:order-2">
          <KartMotor
            ref={mapRef as never}
            mapStyle={mapStyle}
            activeTool={activeTool}
            onClear={onClear}
            onUndo={onUndo}
            editingAnnotation={editingAnnotation}
            onEditingAnnotationChange={handleEditingAnnotationChange}
            showLegend={showLegend}
            onTextAnnotationCreated={handleTextAnnotationCreated}
          />
        </section>
      </div>
      )}
    </main>
  );
}
