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

// Historical Wave/fix checks remain available for explicit audits, but are not
// allowed to make an unrelated PR red merely because an old implementation
// string or CI layout changed. Keep this list until each contract has either
// moved into an active feature group or has been intentionally retired.
export const legacyRegressionChecks=[
  ['domain-waves-81-116','npm run check:domain-smoke'],
  ['wave109','node scripts/wave109-smoke.mjs'],
  ['wave110','node scripts/wave110-smoke.mjs'],
  ['wave111','node scripts/wave111-smoke.mjs'],
  ['wave112','node scripts/wave112-smoke.mjs'],
  ['wave117','npm run check:wave117'],
  ['wave118','npm run check:wave118'],
  ['wave119','npm run check:wave119'],
  ['wave120','npm run check:wave120'],
  ['wave121','npm run check:wave121'],
  ['wave122','npm run check:wave122'],
  ['wave123','node scripts/wave123-smoke.mjs'],
  ['wave124','npm run check:wave124'],
  ['wave125','node scripts/wave125-smoke.mjs'],
  ['wave126','node scripts/wave126-smoke.mjs'],
  ['wave127','node scripts/wave127-smoke.mjs'],
  ['wave128','node scripts/wave128-smoke.mjs'],
  ...[1,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23].map(n=>[`wave128-fix${n}`,`node scripts/wave128-fix${n}-smoke.mjs`]),
];
