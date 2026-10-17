/** Shared hard ceiling for one request's sequential tool executions. */
export const MAX_TOOL_HOPS = 8;

/** One boundary rule shared by the native reasoning loop and HTTP chat tool runner. */
export function isToolHopWithinBudget(executedHops: number, budget = MAX_TOOL_HOPS): boolean {
  return Number.isSafeInteger(executedHops) && executedHops >= 0 &&
    Number.isSafeInteger(budget) && budget >= 0 && executedHops < budget;
}
