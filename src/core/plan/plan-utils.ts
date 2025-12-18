import { tui } from "../../cli/tui";
import type { NoopPlan, ParsedPlan, PlanItem } from "../types/orchestrator.types";

export function isNoopPlan(plan: unknown): plan is NoopPlan {
  return Boolean(plan && typeof plan === "object" && (plan as NoopPlan).noop === true);
}

export function parsePlan(plan: unknown): ParsedPlan | null {
  if (!plan || typeof plan !== "object") return null;
  const parsed = plan as { plan?: unknown };
  if (!Array.isArray(parsed.plan)) return null;
  const items: PlanItem[] = parsed.plan
    .map((entry) => (typeof entry === "object" && entry ? (entry as PlanItem) : null))
    .filter(Boolean) as PlanItem[];
  return {
    plan: items,
    noop: (plan as { noop?: boolean }).noop,
    reason: (plan as { reason?: string }).reason,
    name: (plan as { name?: string }).name,
  };
}

export function logPlan(auditorName: string, plan: unknown): void {
  const pretty = typeof plan === "string" ? plan : JSON.stringify(plan, null, 2);
  tui.logLeft(`[${auditorName}] plan:\n${pretty}`, "success");
}
