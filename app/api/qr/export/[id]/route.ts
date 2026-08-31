import { auth } from "@/auth";
import { exportScansCsv } from "@/app/qr/actions";
import { getLinkById } from "@/lib/db/links";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const link = await getLinkById(id);
  if (!link) {
    return new Response("Not found", { status: 404 });
  }

  const csv = await exportScansCsv(id);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="skanninger-${link.slug}.csv"`,
    },
  });
}
