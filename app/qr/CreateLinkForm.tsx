"use client";

import { useActionState, useRef, useEffect } from "react";
import { createLinkAction, type ActionResult } from "./actions";

const initialState: ActionResult = { ok: true };

export function CreateLinkForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => createLinkAction(formData),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const prevPending = useRef(false);

  useEffect(() => {
    if (prevPending.current && !pending && state.ok) {
      formRef.current?.reset();
    }
    prevPending.current = pending;
  }, [pending, state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {!state.ok && state.error ? (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok && prevPending.current ? (
        <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Kode opprettet!
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Internt navn *</span>
          <input
            name="label"
            required
            placeholder="Plakat Fløyen"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fysisk plassering</span>
          <input
            name="place_name"
            placeholder="Nedre stasjon, Fløyen"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Måladresse (https) *</span>
        <input
          name="target_url"
          type="url"
          required
          placeholder="https://example.com"
          className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-blue-600 text-white font-semibold px-5 py-2.5 hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "Oppretter…" : "Opprett QR-kode"}
      </button>
    </form>
  );
}
