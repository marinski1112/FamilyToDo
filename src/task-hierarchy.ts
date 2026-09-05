export type TaskVisibilityScope = 'FAMILY' | 'PRIVATE';

export type TaskHierarchyNode = {
  id: number;
  familyId: number;
  parentTaskId: number | null;
  visibilityScope: TaskVisibilityScope;
  privateOwnerId: number | null;
};

export type TaskParentLinkResult =
  | { ok: true }
  | { ok: false; reason: 'SELF_PARENT' | 'CROSS_FAMILY' | 'MAX_DEPTH' | 'VISIBILITY_MISMATCH' };

/**
 * Validates the one-level parent/child relationship before persistence.
 *
 * This helper deliberately does not mutate tasks or infer inheritance. A child keeps its own
 * completion, assignees, schedule and recurrence. PRIVATE/FAMILY scope must match the parent so
 * linking cannot widen or ambiguously narrow visibility; PRIVATE owner identity must also match.
 */
export function validateTaskParentLink(
  child: TaskHierarchyNode,
  parent: TaskHierarchyNode,
): TaskParentLinkResult {
  if (child.id === parent.id) return { ok: false, reason: 'SELF_PARENT' };
  if (child.familyId !== parent.familyId) return { ok: false, reason: 'CROSS_FAMILY' };
  if (parent.parentTaskId !== null) return { ok: false, reason: 'MAX_DEPTH' };
  if (child.visibilityScope !== parent.visibilityScope) {
    return { ok: false, reason: 'VISIBILITY_MISMATCH' };
  }
  if (
    child.visibilityScope === 'PRIVATE'
    && child.privateOwnerId !== parent.privateOwnerId
  ) {
    return { ok: false, reason: 'VISIBILITY_MISMATCH' };
  }
  return { ok: true };
}
