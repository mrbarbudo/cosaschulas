const { chromium } = require('playwright');
const APP = 'file:///home/user/cosaschulas/index.html';
const A = (cond, msg) => { if (!cond) { console.error('FALLA:', msg); process.exitCode = 1; } };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 420, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(APP);
  await page.click('[data-act="trip-new"]');
  await page.fill('#tName', 'Pichilemu 2026');
  await page.fill('#tStart', '2026-01-10');
  await page.fill('#tEnd', '2026-01-17');
  await page.fill('#tMe', 'Jota');
  await page.click('#tSubmit');

  // Personas (check-out exclusivo): Jota 10→17 (7n), Cami 10→13 (3n), Seba 12→17 (5n)
  for (const [name, ci, co] of [['Cami', '2026-01-10', '2026-01-13'], ['Seba', '2026-01-12', '2026-01-17']]) {
    await page.click('[data-act="person-new"]');
    await page.fill('#pName', name);
    await page.fill('#pFrom', ci);
    await page.fill('#pTo', co);
    await page.click('#pSubmit');
    await page.waitForTimeout(100);
  }

  const addExpense = async ({ title, amount, payer, type, cat, from, to }) => {
    await page.click('nav.tabs button[data-id="gastos"]');
    await page.click('[data-act="expense-new"]');
    await page.fill('#eDesc', title);
    await page.fill('#eAmount', String(amount));
    await page.selectOption('#ePayer', { label: payer });
    await page.selectOption('#eCategory', cat);
    await page.check(`input[name=eMode][value=${type}]`);
    await page.fill('#eFrom', from);
    if (type === 'per_day') await page.fill('#eTo', to);
    await page.click('#eSubmit');
    await page.waitForTimeout(120);
  };

  // Cabaña 700.000 por noche 10→17 (daily 100.000; noches 10,11: J+C; 12: J+C+S; 13-16: J+S)
  await addExpense({ title: 'Arriendo cabaña', amount: 700000, payer: 'Jota', type: 'per_day', cat: 'alojamiento', from: '2026-01-10', to: '2026-01-17' });
  // Auto día 10: 40.000 entre presentes ese día (J, C) → 20.000 c/u
  await addExpense({ title: 'Auto día 1', amount: 40000, payer: 'Cami', type: 'custom_split', cat: 'transporte', from: '2026-01-10' });
  // Auto día 12: 40.000 entre presentes (J, C, S) → 13.333 c/u
  await addExpense({ title: 'Auto día 3', amount: 40000, payer: 'Seba', type: 'custom_split', cat: 'transporte', from: '2026-01-12' });
  // Súper global: 60.000 entre todos → 20.000 c/u
  await addExpense({ title: 'Súper', amount: 60000, payer: 'Jota', type: 'shared_all', cat: 'comida', from: '2026-01-11' });

  const r = await page.evaluate(() => {
    const t = state.trips[0];
    const c = computeTrip(t);
    const miles = settlementMilestones(c.users, c.per);
    const cab = t.expenses.find(e => e.title === 'Arriendo cabaña');
    const auto1 = t.expenses.find(e => e.title === 'Auto día 1');
    return {
      total: c.total,
      nets: c.nets.map(n => ({ name: n.name, paid: n.paid, owed: n.owed, net: n.net, byCat: n.byCat })),
      miles: miles.map(m => ({ date: m.date, leaving: m.leaving, isLast: m.isLast, transfers: m.transfers })),
      cabShares: shareExpense(c.users, cab).shares,
      auto1Shares: shareExpense(c.users, auto1).shares,
      wa: whatsappText(t),
    };
  });

  console.log(JSON.stringify({ total: r.total, nets: r.nets, miles: r.miles }, null, 1));

  const near = (a, b, tol = 5) => Math.abs(a - b) <= tol;
  A(r.total === 84000000, 'total 840.000');
  const J = r.nets.find(n => n.name === 'Jota'), C = r.nets.find(n => n.name === 'Cami'), S = r.nets.find(n => n.name === 'Seba');
  // Cabaña estricta por noche: J 333.333,33 · C 133.333,33 · S 233.333,33
  const cabVals = Object.values(r.cabShares);
  A(cabVals.reduce((a, b) => a + b, 0) === 70000000, 'cabaña suma exacta');
  A(near(J.byCat.alojamiento, 33333333), 'aloj Jota ~333.333,33: ' + J.byCat.alojamiento);
  A(near(C.byCat.alojamiento, 13333333), 'aloj Cami ~133.333,33: ' + C.byCat.alojamiento);
  A(near(S.byCat.alojamiento, 23333333), 'aloj Seba ~233.333,33: ' + S.byCat.alojamiento);
  // Auto día 1 solo entre presentes (J y C): Seba 0
  const seba = r.nets.find(n => n.name === 'Seba');
  const sebaId = Object.keys(r.auto1Shares).find(id => r.auto1Shares[id] === 0);
  A(Object.values(r.auto1Shares).filter(v => v > 0).length === 2, 'auto día 1 entre 2 personas');
  A(Object.values(r.auto1Shares).filter(v => v === 2000000).length === 2, 'auto día 1: 20.000 c/u');
  // Transporte: J 20.000+13.333 · C 20.000+13.333 · S 13.333
  A(near(S.byCat.transporte, 1333333), 'transporte Seba ~13.333');
  // Comida global 20.000 c/u
  A(J.byCat.comida === 2000000 && C.byCat.comida === 2000000 && S.byCat.comida === 2000000, 'comida 20.000 c/u');
  // Saldos suman 0
  A(r.nets.reduce((a, n) => a + n.net, 0) === 0, 'saldos suman 0');
  // Hitos: 13 ene se va Cami (paga todo su saldo a Jota); 17 ene cierre (Seba→Jota)
  A(r.miles.length === 2, 'dos hitos');
  A(r.miles[0].date === '2026-01-13' && r.miles[0].leaving.includes('Cami') && !r.miles[0].isLast, 'hito 1: sale Cami el 13');
  A(r.miles[0].transfers.length === 1 && r.miles[0].transfers[0].from === 'Cami' && r.miles[0].transfers[0].to === 'Jota', 'hito 1: Cami→Jota');
  A(r.miles[0].transfers[0].cents === -C.net, 'hito 1 salda exactamente a Cami');
  A(r.miles[1].date === '2026-01-17' && r.miles[1].isLast, 'hito 2: cierre el 17');
  A(r.miles[1].transfers.length === 1 && r.miles[1].transfers[0].from === 'Seba' && r.miles[1].transfers[0].to === 'Jota' && r.miles[1].transfers[0].cents === -S.net, 'hito 2: Seba→Jota exacto');
  // WhatsApp
  A(r.wa.includes('Hitos de salida') && r.wa.includes('transfiere') && r.wa.includes('🏠'), 'texto WhatsApp completo');
  console.log('--- WhatsApp ---\n' + r.wa + '\n----------------');

  // Capturas
  await page.click('nav.tabs button[data-id="cuentas"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shot2-cuentas.png', fullPage: true });
  await page.click('nav.tabs button[data-id="gastos"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot2-gastos.png', fullPage: true });

  // Migración v1: pegar un respaldo con el esquema antiguo
  const v1 = {
    id: 'oldtrip1', name: 'Viaje Viejo', start: '2026-02-01', end: '2026-02-05', currency: 'CLP',
    people: [
      { id: 'a', name: 'Ana', from: '2026-02-01', to: '2026-02-05' },
      { id: 'b', name: 'Beto', from: '2026-02-03', to: '2026-02-05' }],
    expenses: [
      { id: 'x', desc: 'Hostal', amount: 4000000, payerId: 'a', mode: 'days', from: '2026-02-01', to: '2026-02-05', participants: null },
      { id: 'y', desc: 'Cena', amount: 1000000, payerId: 'b', mode: 'equal', participants: null, from: '2026-02-04', to: '2026-02-04' }],
  };
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push('P2: ' + e.message));
  await p2.goto(APP);
  await p2.evaluate(json => {
    document.getElementById('pasteBox').value = json;
    document.getElementById('dlgPaste').showModal();
  }, JSON.stringify(v1));
  await p2.click('#formPaste button[type=submit]');
  await p2.waitForTimeout(200);
  await p2.click('[data-act="import-accept"]');
  await p2.waitForTimeout(200);
  const mig = await p2.evaluate(() => {
    const t = state.trips.find(x => x.name === 'Viaje Viejo');
    const c = computeTrip(t);
    return { schema: t.schema, ana: t.people[0], hostal: t.expenses[0], cena: t.expenses[1], sum: c.nets.reduce((a, n) => a + n.net, 0), total: c.total };
  });
  console.log('migración:', JSON.stringify(mig, null, 1));
  A(mig.schema === 2, 'schema 2');
  A(mig.ana.checkInDate === '2026-02-01' && mig.ana.checkOutDate === '2026-02-06', 'Ana migrada a check-out exclusivo');
  A(mig.hostal.type === 'per_day' && mig.hostal.title === 'Hostal' && mig.hostal.to === '2026-02-06', 'hostal migrado per_day');
  A(mig.cena.type === 'shared_all' && mig.cena.to === '2026-02-04', 'cena migrada shared_all');
  A(mig.sum === 0 && mig.total === 5000000, 'viaje migrado calcula bien');

  // Tema oscuro de la nueva vista Cuentas
  const ctx3 = await browser.newContext({ colorScheme: 'dark', viewport: { width: 420, height: 950 } });
  const p3 = await ctx3.newPage();
  p3.on('pageerror', e => errors.push('P3: ' + e.message));
  const code = await page.evaluate(async () => 'vaquita:' + await encodeShare(state.trips[0]));
  await p3.goto(APP);
  await p3.evaluate(c => { document.getElementById('pasteBox').value = c; document.getElementById('dlgPaste').showModal(); }, code);
  await p3.click('#formPaste button[type=submit]');
  await p3.waitForTimeout(200);
  await p3.click('[data-act="import-accept"]');
  await p3.click('nav.tabs button[data-id="cuentas"]');
  await p3.waitForTimeout(200);
  await p3.screenshot({ path: 'shot2-dark.png', fullPage: true });

  console.log(errors.length ? 'ERRORES DE JS:\n' + errors.join('\n') : 'SIN ERRORES DE JS');
  if (errors.length) process.exitCode = 1;
  await browser.close();
  console.log(process.exitCode ? 'RESULTADO: FALLAS' : 'RESULTADO: TODO OK');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
