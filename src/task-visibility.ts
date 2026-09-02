/**
 * Transitional retained boundary for task/item/shopping visibility predicates.
 *
 * The canonical implementation still lives in src/app.ts during the incremental
 * monolith decomposition. Retained modules import this boundary instead of
 * reaching directly into app.ts, so the implementation can be moved here in a
 * later behavior-preserving extraction without touching every caller again.
 */
export {
  taskVisibilitySql,
  taskChildVisibilitySql,
  activityLogVisibilitySql,
  canAccessTask,
} from './app';
