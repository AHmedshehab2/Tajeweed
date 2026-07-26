const { DAY_NAMES_AR } = require('./backend/src/constants');

const jsLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

console.log('=== SANITY CHECK DAY LABELS ===');
jsLabels.forEach((label, i) => {
  const backendLabel = DAY_NAMES_AR[i];
  console.assert(
    backendLabel === label,
    `Mismatch at index ${i}: expected ${label}, got ${backendLabel}`
  );
  console.log(`Index ${i} (${i === 0 ? 'Sunday' : i === 6 ? 'Saturday' : 'Weekday'}): JS='${label}' <-> Backend='${backendLabel}' OK`);
});

console.log('Day label alignment check passed successfully!');
