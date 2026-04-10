"use client";

import dynamic from "next/dynamic";
import { Ban, Download, GitBranch, RotateCcw, Type } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActiveTool,
  MapEditorHandle,
  MapEditorProps,
  MapStyleMode,
} from "@/components/MapEditor";

const MapEditor = dynamic(
  () => import("@/components/MapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-50 flex items-center justify-center">
        Laster kartmodul...
      </div>
    ),
  }
) as ForwardRefExoticComponent<
  MapEditorProps & RefAttributes<MapEditorHandle>
>;

const toolButtonBase =
  "w-full rounded-xl px-4 py-4 md:py-3 text-left text-sm font-semibold border shadow-sm transition-all hover:-translate-y-0.5 active:scale-95";

export default function LagKartPage() {
  const mapRef = useRef<MapEditorHandle | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>("none");
  const [onClear, setOnClear] = useState(0);
  const [onUndo, setOnUndo] = useState(0);
  const [onDeleteEditingAnnotation, setOnDeleteEditingAnnotation] = useState(0);
  const [activeStyle, setActiveStyle] = useState<MapStyleMode>("light");

  const [editingAnnotation, setEditingAnnotation] = useState<{
    id: string;
    text: string;
    size: number;
  } | null>(null);
  const [localText, setLocalText] = useState("");
  const [localSize, setLocalSize] = useState(16);

  useEffect(() => {
    if (!editingAnnotation) {
      setLocalText("");
      setLocalSize(16);
      return;
    }
    setLocalText(editingAnnotation.text);
    setLocalSize(editingAnnotation.size);
  }, [editingAnnotation?.id]);

  const handleEditingAnnotationChange = useCallback(
    (annotation: { id: string; text: string; size: number } | null) => {
      setEditingAnnotation(annotation);
    },
    []
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex flex-col md:flex-row h-screen overflow-hidden">
        <aside className="order-last md:order-first w-full md:max-w-xs bg-white md:border-r border-slate-200 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto shadow-xl md:shadow-none z-10">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Lag kart</h1>
            <p className="mt-2 text-sm text-slate-600">
              Velg verktøy og klikk på vegnettet.
            </p>
          </div>

          <div className="space-y-4">
            <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              KARTTYPE
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveStyle("light")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                  activeStyle === "light"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600"
                }`}
              >
                Gråtone
              </button>
              <button
                type="button"
                onClick={() => setActiveStyle("streets")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                  activeStyle === "streets"
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600"
                }`}
              >
                Farge
              </button>
            </div>

            <div className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              VERKTØY
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setActiveTool(activeTool === "closed" ? "none" : "closed")}
                className={`${toolButtonBase} ${
                  activeTool === "closed"
                    ? "bg-red-600 text-white border-red-700"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Ban className="h-4 w-4" /> Stengt vei
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTool(activeTool === "detour" ? "none" : "detour")}
                className={`${toolButtonBase} ${
                  activeTool === "detour"
                    ? "bg-green-600 text-white border-green-700"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" /> Omkjøring
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTool(activeTool === "text" ? "none" : "text")}
                className={`${toolButtonBase} ${
                  activeTool === "text"
                    ? "bg-slate-800 text-white border-slate-900"
                    : "bg-white border-slate-200 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4" /> Legg til tekst
                </div>
              </button>
            </div>

            {editingAnnotation && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-bottom-2">
                <label className="text-[10px] font-bold text-slate-500 block mb-2 uppercase">
                  Rediger tekst
                </label>
                <input
                  type="text"
                  value={localText}
                  onChange={(e) => setLocalText(e.target.value)}
                  onBlur={() =>
                    setEditingAnnotation((prev) =>
                      prev ? { ...prev, text: localText } : null
                    )
                  }
                  className="w-full p-2 border rounded-lg mb-3 text-sm focus:ring-2 ring-slate-200 outline-none"
                />
                <input
                  type="range"
                  min={10}
                  max={40}
                  value={localSize}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setLocalSize(val);
                    setEditingAnnotation((prev) =>
                      prev ? { ...prev, size: val } : null
                    );
                  }}
                  className="w-full mb-3"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOnDeleteEditingAnnotation((p) => p + 1);
                    setEditingAnnotation(null);
                  }}
                  className="w-full py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Slett tekst
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto space-y-2">
            <button
              type="button"
              onClick={() => setOnClear((p) => p + 1)}
              className="w-full py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Tøm kart
            </button>
            <button
              type="button"
              onClick={() => setOnUndo((p) => p + 1)}
              className="w-full py-2 text-xs font-medium border rounded-lg flex items-center justify-center gap-2 hover:bg-slate-50"
            >
              <RotateCcw className="h-3 w-3" /> Angre siste
            </button>
            <button
              type="button"
              onClick={() => mapRef.current?.downloadAsPng()}
              className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800"
            >
              <Download className="h-4 w-4" /> Last ned kart
            </button>

            <div className="pt-4 border-t text-[10px] text-slate-400 text-center uppercase tracking-tighter">
              © {new Date().getFullYear()} Eirnat • post@eirnat.no
            </div>
          </div>
        </aside>

        <section className="flex-grow relative h-full">
          <MapEditor
            ref={mapRef}
            activeTool={activeTool}
            onClear={onClear}
            onUndo={onUndo}
            editingAnnotation={editingAnnotation}
            onEditingAnnotationChange={handleEditingAnnotationChange}
            onDeleteEditingAnnotation={onDeleteEditingAnnotation}
            mapStyle={activeStyle}
          />
        </section>
      </div>
    </main>
  );
}
