export const activeRegressionGroups=[
  {
    name:'core-domain',
    checks:[
      ['current-contracts','node scripts/core-contract-smoke.mjs'],
      ['form-audit','npm run check:wave123-form-audit'],
    ],
  },
  {
    name:'calendar-imports',
    checks:[
      ['calendar-foundation','npm run check:wave123'],
      ['calendar-current','npm run check:wave128'],
      ['calendar-ui-current','node scripts/wave128-fix23-smoke.mjs'],
      ['ics-budget','node scripts/wave109-smoke.mjs'],
      ['ics-completion','node scripts/wave110-smoke.mjs'],
      ['ics-resume','node scripts/wave111-smoke.mjs'],
      ['ics-ordinals','node scripts/wave112-smoke.mjs'],
      ['event-reset-import','node scripts/wave128-fix21-smoke.mjs'],
    ],
  },
  {
    name:'google-integrations',
    checks:[
      ['google-home','npm run check:wave125'],
      ['google-credentials','npm run check:wave126'],
      ['ai-model-watch','npm run check:wave127'],
      ['calendar-delete-idempotency','node scripts/wave128-fix13-smoke.mjs'],
      ['calendar-retry-normalization','node scripts/wave128-fix16-smoke.mjs'],
      ['calendar-bounded-sync','node scripts/wave128-fix18-smoke.mjs'],
      ['calendar-duplicate-prevention','node scripts/wave128-fix20-smoke.mjs'],
    ],
  },
  {
    name:'ui-product',
    checks:[
      ['family-log-management','node scripts/wave128-fix17-smoke.mjs'],
      ['mobile-navigation','node scripts/wave128-fix8-smoke.mjs'],
      ['interactive-contrast','node scripts/wave128-fix9-smoke.mjs'],
      ['version','npm run check:version'],
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
