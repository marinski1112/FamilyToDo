export const activeRegressionGroups=[
  {
    name:'core-domain',
    checks:[
      ['current-contracts','node scripts/core-contract-smoke.mjs'],
      ['regression-structure','node scripts/regression-structure-smoke.mjs'],
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

// Historical Wave/fix checks remain available for explicit audits, but are not
// allowed to make an unrelated PR red merely because an old implementation
// string or CI layout changed. Keep this list until each contract has either
// moved into an active feature group or has been intentionally retired.
export const legacyRegressionChecks=[
  ['domain-waves-81-116','npm run check:domain-smoke'],
  ['wave117','npm run check:wave117'],
  ['wave118','npm run check:wave118'],
  ['wave119','npm run check:wave119'],
  ['wave120','npm run check:wave120'],
  ['wave121','npm run check:wave121'],
  ['wave122','npm run check:wave122'],
  ['wave124','npm run check:wave124'],
  ...[1,3,5,6,7,10,11,12,14,15,19,22].map(n=>[`wave128-fix${n}`,`node scripts/wave128-fix${n}-smoke.mjs`]),
];
