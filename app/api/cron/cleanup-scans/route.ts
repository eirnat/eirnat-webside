import { deleteScansOlderThan } from "@/lib/db/scans";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const deleted = await deleteScansOlderThan(90);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    console.error("Cron cleanup feilet", error);
    return Response.json({ ok: false, error: "Cleanup failed" }, { status: 500 });
  }
}
