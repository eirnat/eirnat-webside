"use client";

import { useActionState } from "react";
import { updateLinkAction, type ActionResult } from "./actions";
import type { Link } from "@/lib/db/types";

const initialState: ActionResult = { ok: true };

type EditLinkFormProps = {
  link: Link;
};

export function EditLinkForm({ link }: EditLinkFormProps) {
  const [state, formAction, pending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => updateLinkAction(formData),
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4 bg-white border border-slate-200 rounded-2xl p-6">
      <input type="hidden" name="id" value={link.id} />

      {!state.ok && state.error ? (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.ok && !pending && state !== initialState ? null : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Internt navn</span>
          <input
            name="label"
            defaultValue={link.label}
            required
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Fysisk plassering</span>
          <input
            name="place_name"
            defaultValue={link.place_name ?? ""}
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Måladresse (https)</span>
        <input
          name="target_url"
          type="url"
          defaultValue={link.target_url}
          required
          className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5"
        />
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={link.active} />
        <span className="text-sm text-slate-700">Aktiv</span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-slate-900 text-white font-semibold px-5 py-2.5 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Lagrer…" : "Lagre endringer"}
      </button>
    </form>
  );
}
