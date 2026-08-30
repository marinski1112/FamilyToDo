export const activeRegressionGroups=[
  {
    name:'core-domain',
    checks:[
      ['current-contracts','node scripts/core-contract-smoke.mjs'],
      ['regression-structure','node scripts/regression-structure-smoke.mjs'],
      ['package-test-entrypoint','node scripts/package-test-entrypoint-contract.mjs'],
      ['form-audit','node scripts/form-control-contract.mjs'],
    ],
  },
  {
    name:'calendar-imports',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs calendar-imports'],
    ],
  },
  {
    name:'google-integrations',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs google-integrations'],
    ],
  },
  {
    name:'ui-product',
    checks:[
      ['feature-contracts','node scripts/feature-contract-bundle.mjs ui-product'],
    ],
  },
];

// Historical checks that have not yet been migrated or intentionally retired.
// These are opt-in audits only and must not block ordinary PR CI.
export const legacyRegressionChecks=[
  ['domain-waves-81-83','npm run check:domain-smoke'],
];
