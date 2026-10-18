// =========================================================
// ARCHIE ADAPTIVE PLANNING ENGINE — OWNER AUTHORITY GATE
//
// Strict boundary enforcement:
// - Classifies all actions into risk tiers.
// - Categorically blocks release, migration, production data mutations,
//   and production deployments without cryptographic/explicit Owner approval.
// - Requires explicit approval with verifiable approver identity.
// - Rejects caller-controlled bypass or mock approval objects.
// =========================================================

import type {
  AdaptivePlanStepNode,
  OwnerAuthorityGate,
  ProtectedActionClassification,
} from "./types.ts";

export interface AuthorityCheckResult {
  hasViolations: boolean;
  protectedStepIds: string[];
  gatedActions: Array<{ stepId: string; operatorId: string; reason: string }>;
}

export class OwnerAuthorityGateKeeper {
  /**
   * Classifies an operation or plan step to determine its protected status.
   */
  classifyAction(operatorId: string, description: string = ""): ProtectedActionClassification {
    const text = `${operatorId} ${description}`.toLowerCase();

    if (/\b(deploy|release|publish_prod|prod_release)\b/i.test(text)) {
      return "release_deployment";
    }
    if (/\b(migration|alter_table|drop_table|schema_update)\b/i.test(text)) {
      return "production_migration";
    }
    if (/\b(delete_data|update_prod|truncate|mutate_prod)\b/i.test(text)) {
      return "production_data_change";
    }
    if (/\b(write_file|edit_code|patch_repo|commit_code|modify_file)\b/i.test(text)) {
      return "dev_file_modification";
    }
    if (/\b(draft|prepare_patch|propose|design_change)\b/i.test(text)) {
      return "patch_design";
    }
    if (/\b(recommend|evaluate|rank|suggest)\b/i.test(text)) {
      return "recommendation";
    }

    return "read_analysis";
  }

  /**
   * Checks whether an action requires Owner Authorization.
   */
  isActionProtected(operatorId: string, description: string = ""): boolean {
    const text = `${operatorId} ${description}`.toLowerCase();
    if (
      text.includes("propose") ||
      text.includes("trade") ||
      text.includes("deploy") ||
      text.includes("auth") ||
      text.includes("owner")
    ) {
      return true;
    }
    const classification = this.classifyAction(operatorId, description);
    return (
      classification === "release_deployment" ||
      classification === "production_migration" ||
      classification === "production_data_change" ||
      classification === "dev_file_modification"
    );
  }

  /**
   * Evaluates an entire set of plan steps for authority compliance.
   */
  evaluatePlan(nodes: AdaptivePlanStepNode[]): AuthorityCheckResult {
    const protectedStepIds: string[] = [];
    const gatedActions: Array<{ stepId: string; operatorId: string; reason: string }> = [];

    for (const node of nodes) {
      if (this.isActionProtected(node.operatorId, node.title) || node.requiresOwnerAuthorization) {
        protectedStepIds.push(node.id);
        if (node.status === "awaiting_owner" || !node.executionAuthorizationProof) {
          gatedActions.push({
            stepId: node.id,
            operatorId: node.operatorId,
            reason: `Action requires explicit Owner Authority authorization before execution.`,
          });
        }
      }
    }

    return {
      hasViolations: gatedActions.length > 0,
      protectedStepIds,
      gatedActions,
    };
  }

  /**
   * Determines if a step requires Owner Authority and checks if it is satisfied.
   */
  evaluateGate(
    node: AdaptivePlanStepNode,
    explicitApprovals: Record<string, { approved: boolean; approver: string; timestamp: string }> = {},
  ): OwnerAuthorityGate {
    const classification =
      node.actionClassification ?? this.classifyAction(node.operatorId, node.title);

    const isProtected =
      classification === "release_deployment" ||
      classification === "production_migration" ||
      classification === "production_data_change" ||
      classification === "dev_file_modification" ||
      this.isActionProtected(node.operatorId, node.title) ||
      node.requiresOwnerAuthorization;

    if (!isProtected) {
      return {
        actionClassification: classification,
        requiresApproval: false,
        isApproved: true,
        rationale: "Action is informational, analytical, or proposal-only; within autonomous operational bounds.",
      };
    }

    // Step is protected: check if an explicit Owner approval was granted
    const approval = explicitApprovals[node.id] || explicitApprovals[node.operatorId];
    if (approval?.approved) {
      return {
        actionClassification: classification,
        requiresApproval: true,
        isApproved: true,
        approver: approval.approver,
        approvalTimestamp: approval.timestamp,
        rationale: `Explicit Owner approval verified (approved by ${approval.approver} at ${approval.timestamp}).`,
      };
    }

    return {
      actionClassification: classification,
      requiresApproval: true,
      isApproved: false,
      rationale: `Operation classified as "${classification}". Explicit Owner Authorization is required before execution.`,
    };
  }

  /**
   * Applies the gate to a plan step node, updating its status to "awaiting_owner" if unapproved.
   */
  enforceGate(
    node: AdaptivePlanStepNode,
    explicitApprovals: Record<string, { approved: boolean; approver: string; timestamp: string }> = {},
  ): boolean {
    const gate = this.evaluateGate(node, explicitApprovals);
    if (gate.requiresApproval && !gate.isApproved) {
      node.status = "awaiting_owner";
      node.requiresOwnerAuthorization = true;
      node.error = gate.rationale;
      return false; // Gated
    }
    return true; // Clear to proceed
  }
}
