const { chromium } = require('playwright');
const APP = 'file:///home/user/cosaschulas/index.html';
let failures = 0;
const A = (cond, msg) => { if (!cond) { console.error('❌ FALLA:', msg); failures++; } else { console.log('✔', msg); } };

// Ground truth en pesos (la app calcula en centavos; se compara el valor redondeado a peso,
// que es lo que muestra la UI en CLP)
const GT = {
  paid:  { 'Iván': 712000, 'JP': 59000, 'Mauricio': 26000, 'Pancho': 0 },
  owed:  { 'JP': 93000, 'Pancho': 168000, 'Mauricio': 268000, 'Iván': 268000 },
  aloj:  { 'JP': 50000, 'Pancho': 116667, 'Mauricio': 216667, 'Iván': 216667 },
  net:   { 'JP': -34000, 'Pancho': -168000, 'Mauricio': -242000, 'Iván': 444000 },
  total: 797000,
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 420, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(APP);

  // Viaje de 9 noches: días 1..9 = 1..9 de marzo (check-out final 10 mar)
  await page.click('[data-act="trip-new"]');
  await page.fill('#tName', 'Ground Truth');
  await page.fill('#tStart', '2026-03-01');
  await page.fill('#tEnd', '2026-03-10');
  await page.fill('#tMe', 'JP');
  await page.click('#tSubmit');
  await page.waitForTimeout(150);

  // JP ya existe con estadía completa: corregirla a días 1-3 (check-out día 4)
  await page.click('nav.tabs button[data-id="personas"]');
  await page.click('[data-act="person-edit"]');
  await page.fill('#pTo', '2026-03-04');
  await page.click('#pSubmit');
  await page.waitForTimeout(120);

  for (const [name, ci, co] of [
    ['Pancho', '2026-03-01', '2026-03-07'],   // días 1-6
    ['Mauricio', '2026-03-01', '2026-03-10'], // días 1-9
    ['Iván', '2026-03-01', '2026-03-10'],     // días 1-9
  ]) {
    await page.click('[data-act="person-new"]');
    await page.fill('#pName', name);
    await page.fill('#pFrom', ci);
    await page.fill('#pTo', co);
    await page.click('#pSubmit');
    await page.waitForTimeout(120);
  }

  // excludeNames: para custom_split con subgrupo explícito (desmarcar chips)
  const addExpense = async ({ title, amount, payer, type, cat, from, to, excludeNames }) => {
    await page.click('nav.tabs button[data-id="gastos"]');
    await page.click('[data-act="expense-new"]');
    await page.fill('#eDesc', title);
    await page.fill('#eAmount', String(amount));
    await page.selectOption('#ePayer', { label: payer });
    await page.selectOption('#eCategory', cat);
    await page.check(`input[name=eMode][value=${type}]`);
    await page.fill('#eFrom', from);
    if (type === 'per_day') await page.fill('#eTo', to);
    if (excludeNames) for (const n of excludeNames) await page.click(`#eParts [data-part]:text-is("${n}")`);
    await page.click('#eSubmit');
    await page.waitForTimeout(120);
  };

  // Alojamiento $600.000 por noche, 9 noches, pagó Iván
  await addExpense({ title: 'Alojamiento', amount: 600000, payer: 'Iván', type: 'per_day', cat: 'alojamiento', from: '2026-03-01', to: '2026-03-10' });
  // Supermercado $96.000 entre 4, con 3 pagadores → 3 gastos globales
  await addExpense({ title: 'Súper (boleta JP)', amount: 59000, payer: 'JP', type: 'shared_all', cat: 'comida', from: '2026-03-02' });
  await addExpense({ title: 'Súper (boleta Mauricio)', amount: 26000, payer: 'Mauricio', type: 'shared_all', cat: 'comida', from: '2026-03-02' });
  await addExpense({ title: 'Súper (boleta Iván)', amount: 11000, payer: 'Iván', type: 'shared_all', cat: 'comida', from: '2026-03-02' });
  // Auto día 1 $40.000 entre los presentes ese día (los 4)
  await addExpense({ title: 'Auto día 1', amount: 40000, payer: 'Iván', type: 'custom_split', cat: 'transporte', from: '2026-03-01' });
  // Auto día 2 $25.000 entre subgrupo explícito (sin JP, aunque estaba presente)
  await addExpense({ title: 'Auto día 2', amount: 25000, payer: 'Iván', type: 'custom_split', cat: 'transporte', from: '2026-03-02', excludeNames: ['JP'] });
  // Bencina y peajes: globales entre los 4
  await addExpense({ title: 'Bencina inicial', amount: 30000, payer: 'Iván', type: 'shared_all', cat: 'transporte', from: '2026-03-01' });
  await addExpense({ title: 'Peajes iniciales', amount: 6000, payer: 'Iván', type: 'shared_all', cat: 'transporte', from: '2026-03-01' });

  const r = await page.evaluate(() => {
    const t = state.trips[0];
    const c = computeTrip(t);
    const miles = settlementMilestones(c.users, c.per);
    const aloj = t.expenses.find(e => e.title === 'Alojamiento');
    const auto2 = t.expenses.find(e => e.title === 'Auto día 2');
    const byName = {};
    c.nets.forEach(n => byName[n.name] = n);
    // Reconstrucción de tramos del alojamiento: parte de cada persona por noche
    const users = c.users;
    const shares = shareExpense(users, aloj).shares;
    return {
      totalCents: c.total,
      sumNet: c.nets.reduce((a, n) => a + n.net, 0),
      sumOwed: c.nets.reduce((a, n) => a + n.owed, 0),
      byName: Object.fromEntries(Object.entries(byName).map(([k, n]) => [k, { paid: n.paid, owed: n.owed, net: n.net, aloj: n.byCat.alojamiento, transp: n.byCat.transporte, comida: n.byCat.comida }])),
      alojShares: Object.fromEntries(users.map(u => [u.name, shares[u.id]])),
      auto2Included: auto2.includedUserIds ? auto2.includedUserIds.length : null,
      miles: miles.map(m => ({ date: m.date, leaving: m.leaving, isLast: m.isLast, transfers: m.transfers })),
    };
  });

  console.log(JSON.stringify(r, null, 1));
  console.log('\n=== CALIBRACIÓN CONTRA GROUND TRUTH (pesos) ===');
  const pesos = cents => Math.round(cents / 100);

  A(r.totalCents === GT.total * 100, `Total del viaje $${GT.total.toLocaleString('es-CL')}`);
  A(r.sumNet === 0, 'Saldos netos suman exactamente 0');
  A(r.sumOwed === r.totalCents, 'La suma de consumos reales cuadra con el total (sin pérdida por redondeo)');

  for (const who of ['JP', 'Pancho', 'Mauricio', 'Iván']) {
    const n = r.byName[who];
    A(pesos(n.paid) === GT.paid[who], `${who} desembolso inicial: $${GT.paid[who].toLocaleString('es-CL')} (obtuvo $${pesos(n.paid).toLocaleString('es-CL')})`);
    A(pesos(n.owed) === GT.owed[who], `${who} consumo real: $${GT.owed[who].toLocaleString('es-CL')} (obtuvo $${pesos(n.owed).toLocaleString('es-CL')})`);
    A(pesos(n.aloj) === GT.aloj[who], `${who} alojamiento por tramos: $${GT.aloj[who].toLocaleString('es-CL')} (obtuvo $${pesos(n.aloj).toLocaleString('es-CL')})`);
    A(pesos(n.net) === GT.net[who], `${who} balance neto: $${GT.net[who].toLocaleString('es-CL')} (obtuvo $${pesos(n.net).toLocaleString('es-CL')})`);
  }
  A(r.auto2Included === 3, 'Auto día 2 quedó restringido a subgrupo de 3');

  // Liquidación: JP→Iván 34.000 (sale día 4), Pancho→Iván 168.000 (sale día 7), Mauricio→Iván 242.000 (cierre día 10)
  const expectMiles = [
    ['2026-03-04', 'JP', 'Iván', 34000, false],
    ['2026-03-07', 'Pancho', 'Iván', 168000, false],
    ['2026-03-10', 'Mauricio', 'Iván', 242000, true],
  ];
  A(r.miles.length === 3, 'Tres hitos de salida');
  expectMiles.forEach(([date, from, to, amt, isLast], i) => {
    const m = r.miles[i];
    A(m && m.date === date && m.isLast === isLast, `Hito ${i + 1} en ${date}${isLast ? ' (cierre)' : ''}`);
    A(m && m.transfers.length === 1 && m.transfers[0].from === from && m.transfers[0].to === to && pesos(m.transfers[0].cents) === amt,
      `Hito ${i + 1}: ${from} transfiere $${amt.toLocaleString('es-CL')} a ${to}` +
      (m && m.transfers[0] ? ` (obtuvo ${m.transfers[0].from}→${m.transfers[0].to} $${pesos(m.transfers[0].cents).toLocaleString('es-CL')})` : ' (sin transferencia)'));
  });
  const ivanReceives = r.miles.flatMap(m => m.transfers).filter(t => t.to === 'Iván').reduce((a, t) => a + t.cents, 0);
  A(pesos(ivanReceives) === 444000, `Iván recibe en total $444.000 (obtuvo $${pesos(ivanReceives).toLocaleString('es-CL')})`);

  await page.click('nav.tabs button[data-id="cuentas"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shot3-groundtruth.png', fullPage: true });

  if (errors.length) { console.error('ERRORES DE JS:\n' + errors.join('\n')); failures++; }
  await browser.close();
  console.log(failures ? `\nRESULTADO: ${failures} DIFERENCIAS — REQUIERE CALIBRACIÓN` : '\nRESULTADO: COINCIDENCIA EXACTA CON EL GROUND TRUTH');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
