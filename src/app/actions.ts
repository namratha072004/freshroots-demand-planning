"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSql } from "@/lib/db";
import { createSessionToken, isValidSessionToken, passwordAccepted, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";
import { approveRecommendation, rejectRecommendation } from "@/lib/decisions";
import { runPlanning } from "@/lib/run";
import { markLead } from "@/lib/leads";
import { resetGroup, saveEdits, setPoDryRun, type SettingGroup } from "@/lib/settings";
import { createDraftPo, type CreateResult } from "@/lib/zoho/draftPo";
import { assertNotStopped, evaluateAndLatch, resumeKillSwitch } from "@/lib/killSwitch";

/** Every page shows numbers that depend on decisions, runs and settings, so refresh all of them after any change. */
function refreshAll() {
  revalidatePath("/", "layout");
}

async function requireAuth() {
  const jar = await cookies();
  if (!(await isValidSessionToken(jar.get(SESSION_COOKIE)?.value))) throw new Error("Not signed in");
}

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string; needsConfirm?: boolean; pending?: number };

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!passwordAccepted(password)) return { error: "Wrong password" };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function approve(id: number): Promise<ActionResult> {
  await requireAuth();
  try {
    await approveRecommendation(id);
    await evaluateAndLatch();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not approve" };
  }
  refreshAll();
  return { ok: true };
}

export async function reject(id: number, reason: string): Promise<ActionResult> {
  await requireAuth();
  try {
    await rejectRecommendation(id, reason);
    await evaluateAndLatch();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not reject" };
  }
  refreshAll();
  return { ok: true };
}

/** Manual run. If unanswered flags exist, the caller must confirm that they will be marked SUPERSEDED. */
export async function runNow(confirmSupersede: boolean): Promise<ActionResult> {
  await requireAuth();
  try {
    await assertNotStopped();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Blocked" };
  }
  const sql = getSql();
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM recommendations WHERE status = 'PENDING' AND action <> 'NEEDS_RAGHAV'`;
  if ((n as number) > 0 && !confirmSupersede) {
    return {
      ok: false,
      needsConfirm: true,
      pending: n as number,
      message: `${n} flags have no answer yet. A new run marks them SUPERSEDED (not counted as rejections).`,
    };
  }
  try {
    const s = await runPlanning("manual");
    refreshAll();
    return { ok: true, message: `Run ${s.runId} finished: ${s.recommendations} flags.${s.ai && s.ai.status !== "ok" ? ` AI reasons: ${s.ai.status}.` : ""}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Run failed" };
  }
}

export async function resume(note: string): Promise<ActionResult> {
  await requireAuth();
  try {
    await resumeKillSwitch(note);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not resume" };
  }
  refreshAll();
  return { ok: true };
}

export async function markLaunchLead(id: number, mark: string): Promise<ActionResult> {
  await requireAuth();
  try {
    await markLead(id, mark);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the mark" };
  }
  refreshAll();
  return { ok: true };
}

/** The only way a draft PO is created: Raghav clicks the button. */
export async function createDraftPoAction(): Promise<CreateResult> {
  await requireAuth();
  const r = await createDraftPo();
  refreshAll();
  return r;
}

export type SettingsResult = { ok: true; message: string } | { ok: false; message: string; errors: string[] };

/** Save edited rubric / limit values. They apply to the next run. */
export async function saveSettingsAction(edits: Record<string, number>): Promise<SettingsResult> {
  await requireAuth();
  try {
    const r = await saveEdits(edits);
    if (!r.ok) return { ok: false, message: "Nothing was saved.", errors: r.errors };
    refreshAll();
    refreshAll();
    return { ok: true, message: r.changed === 0 ? "No changes to save." : `Saved ${r.changed} change${r.changed === 1 ? "" : "s"}. They apply to the next run.` };
  } catch (e) {
    return { ok: false, message: "Could not save.", errors: [e instanceof Error ? e.message : "Unknown error"] };
  }
}

export async function resetSettingsAction(groups: SettingGroup[]): Promise<SettingsResult> {
  await requireAuth();
  try {
    let n = 0;
    for (const g of groups) n += await resetGroup(g);
    refreshAll();
    refreshAll();
    return { ok: true, message: n === 0 ? "Already at the defaults." : `Reset ${n} value${n === 1 ? "" : "s"} to the defaults.` };
  } catch (e) {
    return { ok: false, message: "Could not reset.", errors: [e instanceof Error ? e.message : "Unknown error"] };
  }
}

/** Switch the Create draft PO button between live (real drafts in Zoho) and dry run (shows the request only). */
export async function setPoModeAction(dryRun: boolean): Promise<SettingsResult> {
  await requireAuth();
  try {
    await setPoDryRun(dryRun);
    refreshAll();
    refreshAll();
    return { ok: true, message: dryRun ? "Dry run: the button now only shows the request." : "Live: the button now creates real draft POs in Zoho." };
  } catch (e) {
    return { ok: false, message: "Could not change the mode.", errors: [e instanceof Error ? e.message : "Unknown error"] };
  }
}
