"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@ayvana/auth";
import {
  addCaseMessage,
  assignCase,
  transitionCase,
  resolveCase,
  reopenCase,
  type CaseStatus,
  type CaseAuthorRole,
} from "@ayvana/db";

type Result = { success: true } | { error: string };

async function requireHandler() {
  const user = await getAuthUser();
  if (!user) return { user: null, err: "Unauthorized" as const };
  if (!["ADMIN", "SUPPORT", "CALL_CENTER"].includes(user.role ?? "")) return { user: null, err: "Forbidden" as const };
  return { user, err: null };
}

export async function replyToCaseAction(caseId: string, body: string, isInternal: boolean): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  if (!body.trim()) return { error: "Message is empty" };
  await addCaseMessage({
    caseId,
    authorUserId: user.userId,
    authorRole: (user.role as CaseAuthorRole) ?? "SUPPORT",
    body: body.trim(),
    channel: "WEBSITE",
    isInternal,
  });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function assignToMeAction(caseId: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  const team = user.role === "CALL_CENTER" ? "CALL_CENTER" : "SUPPORT";
  await assignCase({ caseId, assignedToUserId: user.userId, assignedTeam: team, actorUserId: user.userId });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function setCaseStatusAction(caseId: string, to: CaseStatus): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  try {
    await transitionCase({ caseId, to, actorUserId: user.userId });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid transition" };
  }
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function resolveCaseAction(caseId: string, relatedReturnId?: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  try {
    await resolveCase({ caseId, actorUserId: user.userId, relatedReturnId: relatedReturnId || null });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cannot resolve" };
  }
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}

export async function reopenCaseAction(caseId: string): Promise<Result> {
  const { user, err } = await requireHandler();
  if (err || !user) return { error: err ?? "Forbidden" };
  await reopenCase({ caseId, actorUserId: user.userId });
  revalidatePath(`/cases/${caseId}`);
  return { success: true };
}
