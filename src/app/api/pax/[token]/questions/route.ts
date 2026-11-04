import { getDb } from "@/lib/db";
import { offerByToken } from "@/lib/pax/offer";
import { askQuestion, QuestionError } from "@/lib/pax/questions";
import { hit } from "@/lib/rate-limit";
import { ipHash } from "@/lib/request";

// A4 passenger question (SPEC F13). Rate limited per passenger (10 a day) and per IP.
export async function POST(request: Request, ctx: RouteContext<"/api/pax/[token]/questions">) {
  const db = getDb();
  try {
    const limit = await hit(db, `qa-ip:${await ipHash()}`, 40, 3600);
    if (!limit.allowed) return Response.json({ error: "Too many questions. Try again later." }, { status: 429 });
    const { token } = await ctx.params;
    const view = await offerByToken(db, token);
    if (!view) return Response.json({ error: "This link is not valid or has expired." }, { status: 404 });
    const { question } = (await request.json().catch(() => ({}))) as { question?: unknown };
    const r = await askQuestion(db, view.passengerId, typeof question === "string" ? question : "");
    return Response.json(r);
  } catch (err) {
    if (err instanceof QuestionError) return Response.json({ error: err.message }, { status: 400 });
    console.error(JSON.stringify({ evt: "qa_error", message: err instanceof Error ? err.message : "unknown" }));
    return Response.json({ error: "The question could not be answered. Use Talk to a person." }, { status: 500 });
  }
}
