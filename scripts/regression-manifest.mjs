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
    ],
  },
  {
    name:'calendar-imports',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs calendar-imports'],
      ['calendar-stamp-assets-transport','node scripts/calendar-stamp-assets-transport-contract.mjs'],
      ['calendar-stamp-read-api','node scripts/calendar-animated-stamps-read-api-contract.mjs'],
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
    ],
  },
];

// Historical checks are kept separate from ordinary PR CI. Phase 1 migration leaves none.
export const legacyRegressionChecks=[];