export const activeRegressionGroups=[
  {
    name:'core-domain',
    checks:[
      ['current-contracts','node scripts/core-contract-smoke.mjs'],
      ['regression-structure','node scripts/regression-structure-smoke.mjs'],
      ['package-test-entrypoint','node scripts/package-test-entrypoint-contract.mjs'],
      ['form-audit','node scripts/form-control-contract.mjs'],
      ['d1-remote-trigger-compat','node scripts/d1-remote-trigger-compat-contract.mjs'],
      ['public-integrations-health-privacy','node scripts/public-integrations-health-privacy-contract.mjs'],
      ['public-secrets-health-privacy','node scripts/public-secrets-health-privacy-contract.mjs'],
      ['task-event-occurrence-date','node scripts/task-event-occurrence-date-contract.mjs'],
      ['worker-error-log-privacy','node scripts/worker-error-log-privacy-contract.mjs'],
      ['index-entrypoint-modularity','node scripts/index-entrypoint-modularity-contract.mjs'],
      ['notification-lifecycle-modularity','node scripts/notification-lifecycle-modularity-contract.mjs'],
      ['line-daily-digest-modularity','node scripts/line-daily-digest-modularity-contract.mjs'],
      ['line-webhook-modularity','node scripts/line-webhook-modularity-contract.mjs'],
      ['item-api-modularity','node scripts/item-api-modularity-contract.mjs'],
      ['task-api-modularity','node scripts/task-api-modularity-contract.mjs'],
      ['recurring-occurrence-modularity','node scripts/recurring-occurrence-modularity-contract.mjs'],
      ['page-route-dispatcher','node scripts/page-route-dispatcher-contract.mjs'],
      ['context-api-route-dispatcher','node scripts/context-api-route-dispatcher-contract.mjs'],
      ['public-route-dispatcher','node scripts/public-route-dispatcher-contract.mjs'],
      ['reorder-api-modularity','node scripts/reorder-api-modularity-contract.mjs'],
      ['task-delete-modularity','node scripts/task-delete-modularity-contract.mjs'],
      ['new-entry-pages-modularity','node scripts/new-entry-pages-modularity-contract.mjs'],
      ['child-growth-journal','node scripts/child-growth-journal-contract.mjs'],
      ['child-journal-google-calendar','node scripts/child-journal-google-calendar-contract.mjs'],
    ],
  },
  {
    name:'calendar-imports',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs calendar-imports'],
      ['calendar-stamp-assets-transport','node scripts/calendar-stamp-assets-transport-contract.mjs'],
      ['calendar-stamp-read-api','node scripts/calendar-animated-stamps-read-api-contract.mjs'],
      ['calendar-mobile-ui-error-privacy','node scripts/calendar-mobile-ui-error-privacy-contract.mjs'],
    ],
  },
  {
    name:'google-integrations',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs google-integrations'],
      ['google-home-refresh-log-privacy','node scripts/google-home-refresh-log-privacy-contract.mjs'],
    ],
  },
  {
    name:'ui-product',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs ui-product'],
      ['messages-action-error-display-privacy','node scripts/messages-action-error-display-privacy-contract.mjs'],
      ['task-shopping-error-display-privacy','node scripts/task-shopping-error-display-privacy-contract.mjs'],
    ],
  },
];

// Historical checks are kept separate from ordinary PR CI. Phase 1 migration leaves none.
export const legacyRegressionChecks=[];