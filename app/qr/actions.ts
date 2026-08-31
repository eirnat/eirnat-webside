"use server";

import { revalidatePath } from "next/cache";
import { generateSlug } from "@/lib/qr/slug";
import { validateTargetUrl } from "@/lib/qr/validate-url";
import { createLink, updateLink, getLinkById } from "@/lib/db/links";

export type ActionResult = {
  ok: boolean;
  error?: string;
};

export async function createLinkAction(formData: FormData): Promise<ActionResult> {
  const label = String(formData.get("label") ?? "").trim();
  const placeName = String(formData.get("place_name") ?? "").trim();
  const targetUrlRaw = String(formData.get("target_url") ?? "").trim();

  if (!label) {
    return { ok: false, error: "Internt navn er påkrevd." };
  }

  let targetUrl: string;
  try {
    targetUrl = validateTargetUrl(targetUrlRaw);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ugyldig måladresse.",
    };
  }

  try {
    await createLink({
      slug: generateSlug(),
      target_url: targetUrl,
      label,
      place_name: placeName || null,
    });
    revalidatePath("/qr");
    return { ok: true };
  } catch (error) {
    console.error("createLinkAction feilet", error);
    return { ok: false, error: "Kunne ikke opprette kode. Prøv igjen." };
  }
}

export async function updateLinkAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const placeName = String(formData.get("place_name") ?? "").trim();
  const targetUrlRaw = String(formData.get("target_url") ?? "").trim();
  const active = formData.get("active") === "on";

  if (!id || !label) {
    return { ok: false, error: "Manglende data." };
  }

  let targetUrl: string;
  try {
    targetUrl = validateTargetUrl(targetUrlRaw);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ugyldig måladresse.",
    };
  }

  try {
    const updated = await updateLink(id, {
      target_url: targetUrl,
      label,
      place_name: placeName || null,
      active,
    });

    if (!updated) {
      return { ok: false, error: "Koden finnes ikke." };
    }

    revalidatePath("/qr");
    revalidatePath(`/qr/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("updateLinkAction feilet", error);
    return { ok: false, error: "Kunne ikke oppdatere kode." };
  }
}

export async function deactivateLinkAction(id: string): Promise<ActionResult> {
  try {
    const link = await getLinkById(id);
    if (!link) {
      return { ok: false, error: "Koden finnes ikke." };
    }

    await updateLink(id, {
      target_url: link.target_url,
      label: link.label,
      place_name: link.place_name,
      active: false,
    });

    revalidatePath("/qr");
    revalidatePath(`/qr/${id}`);
    return { ok: true };
  } catch (error) {
    console.error("deactivateLinkAction feilet", error);
    return { ok: false, error: "Kunne ikke deaktivere kode." };
  }
}

export async function exportScansCsv(linkId: string): Promise<string> {
  const { getAllScansForExport } = await import("@/lib/db/scans");
  const scans = await getAllScansForExport(linkId);

  const header = [
    "id",
    "ts",
    "country",
    "region",
    "city",
    "device_type",
    "os",
    "browser",
    "visitor_hash",
  ];

  const rows = scans.map((scan) =>
    [
      scan.id,
      scan.ts.toISOString(),
      scan.country ?? "",
      scan.region ?? "",
      scan.city ?? "",
      scan.device_type ?? "",
      scan.os ?? "",
      scan.browser ?? "",
      scan.visitor_hash ?? "",
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );

  return [header.join(","), ...rows].join("\n");
}
