"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { JudgeError, startJudgeRun } from "@/lib/judge/run";
import { ipHash } from "@/lib/request";

export interface StartState {
  error: string | null;
}

/** "Start the judge demo" (SPEC 14): a private copy of the scenario, signed in as its duty manager. */
export async function startJudgeDemo(_prev: StartState, form: FormData): Promise<StartState> {
  const scenarioKey = form.get("scenario") === "B" ? "B" : "A";
  let target: string;
  try {
    const run = await startJudgeRun(getDb(), { ipHash: await ipHash(), scenarioKey });
    await createSession(run.userId, "DUTY_MANAGER");
    target = `/ops/disruptions/${run.disruptionId}?tab=evidence`;
  } catch (err) {
    if (err instanceof JudgeError) return { error: err.message };
    console.error(JSON.stringify({ evt: "judge_start_error", message: err instanceof Error ? err.message : "unknown" }));
    return { error: "The demo could not be started. Try again in a minute." };
  }
  redirect(target);
}
