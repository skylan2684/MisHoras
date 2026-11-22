// Pruebas de la lógica de "Mis horas" (index.html) con tiempo simulado.
// Simulan cerrar y reabrir la app guardando solo lo que hay en localStorage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'index.html'), 'utf8');
const KEY = 'donpinol.mishoras.v1';
// Managua = UTC−06:00 todo el año. Hora local -> instante UTC.
const managua = (y, m, d, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h + 6, mi, s);

function abrir(now, stored, opts = {}) {
  const errores = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errores.push(String(e.detail || e.message || e)));
  const clock = { now };
  const dom = new JSDOM(HTML, {
    url: 'https://mishoras.test/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      if (stored != null) w.localStorage.setItem(KEY, stored);
      if (opts.puente) w.MisHorasNativo = opts.puente;
      if (opts.portapapeles) Object.defineProperty(w.navigator, 'clipboard', { value: opts.portapapeles, configurable: true });
      if (opts.sinAlmacenamiento) {
        Object.defineProperty(w, 'localStorage', { get() { throw new Error('sin almacenamiento'); } });
      }
      w.scrollTo = () => {}; // jsdom no implementa scrollTo (en Android sí existe)
      w.Date.now = () => clock.now;
      w.__tick = [];
      w.setInterval = f => { w.__tick.push(f); return 1; };
    }
  });
  const w = dom.window;
  const $ = id => w.document.getElementById(id);
  return {
    w, $, errores, clock,
    avanzar(ms) { clock.now += ms; w.__tick.forEach(f => f()); },
    irA(t) { clock.now = t; w.__tick.forEach(f => f()); },
    marcar() { $('mark').click(); },
    turno(i) { $('shift').selectedIndex = i; },
    guardado() { return w.localStorage.getItem(KEY); },
    historial() { return [...w.document.querySelectorAll('.entry')].map(e => [...e.querySelectorAll('span')].map(s => s.textContent)); },
    cerrar() { w.close(); }
  };
}

test('abre directo en registro real, sin modo prueba ni reset, con reloj AM/PM', () => {
  const a = abrir(managua(2026, 11, 22, 16, 44, 48));
  assert.equal(a.errores.length, 0, a.errores.join('|'));
  assert.match(a.$('status').textContent, /REGISTRO REAL/);
  assert.doesNotMatch(a.w.document.body.textContent, /prueba|Resetear|MODO/i);
  assert.equal(a.$('reset'), null);
  assert.equal(a.$('mark').textContent, 'Marcar entrada');
  assert.match(a.$('clock').textContent, /^4:44:48\s?PM$/i);
  assert.match(a.$('date').textContent, /domingo, 22 de noviembre de 2026/);
  assert.equal(a.$('timer').textContent, '00:00:00');
  assert.equal(a.$('shift').options.length, 3);
  a.cerrar();
});

test('la hora y la fecha son las de Managua aunque el teléfono use otra zona', () => {
  // 2026-11-23 03:30 UTC = domingo 22 21:30 en Managua
  const a = abrir(Date.UTC(2026, 10, 23, 3, 30, 0));
  assert.match(a.$('clock').textContent, /^9:30:00\s?PM$/i);
  assert.match(a.$('date').textContent, /domingo, 22 de noviembre/);
  a.cerrar();
});

test('una jornada en curso se recupera al cerrar y volver a abrir la app', () => {
  const a = abrir(managua(2026, 11, 23, 5, 0, 0));
  a.turno(0); a.marcar();
  assert.equal(a.$('mark').textContent, 'Marcar salida');
  const guardado = a.guardado();
  assert.ok(guardado, 'debe haber guardado la entrada');
  a.cerrar();
  // se cierra la app y se reabre dos horas después
  const b = abrir(managua(2026, 11, 23, 7, 0, 0), guardado);
  assert.equal(b.errores.length, 0, b.errores.join('|'));
  assert.match(b.$('status').textContent, /EN CURSO/);
  assert.equal(b.$('mark').textContent, 'Marcar salida');
  assert.equal(b.$('shift').selectedIndex, 0);
  assert.equal(b.$('shift').disabled, true);
  assert.equal(b.$('timer').textContent, '02:00:00');
  b.avanzar(30 * 60000);
  assert.equal(b.$('timer').textContent, '02:30:00');
  b.cerrar();
});

test('turno Día completo: entrada 5:00, salida 12:30 => 7 h 30 min y diferencia +00:00:00', () => {
  const a = abrir(managua(2026, 11, 23, 5, 0, 0));
  a.turno(0); a.marcar();
  a.irA(managua(2026, 11, 23, 12, 30, 0)); a.marcar();
  const [h] = a.historial();
  assert.equal(h.length, 6);
  assert.match(h[0], /^Fecha: lunes, 23 de noviembre de 2026/);
  assert.match(h[1], /^Turno: Día$/);
  assert.match(h[2], /^Entrada: 5:00:00\s?AM$/i);
  assert.match(h[3], /^Salida: 12:30:00\s?PM$/i);
  assert.match(h[4], /^Horas trabajadas: 07:30:00$/);
  assert.match(h[5], /^Diferencia: \+00:00:00$/);
  assert.equal(a.$('week').textContent, '7 h 30 min');
  assert.equal(a.$('month').textContent, '7 h 30 min');
  // sobrevive a cerrar/abrir
  const b = abrir(managua(2026, 11, 23, 13, 0, 0), a.guardado());
  assert.deepEqual(b.historial(), a.historial());
  assert.equal(b.$('mark').textContent, 'Marcar entrada');
  a.cerrar(); b.cerrar();
});

test('diferencia negativa y positiva respecto a la duración del turno', () => {
  // Noche: 5 h. Sale 30 min antes => −00:30:00. Domingo: 6 h. Sale 15 min después => +00:15:00
  const a = abrir(managua(2026, 11, 24, 16, 0, 0));
  a.turno(1); a.marcar(); a.irA(managua(2026, 11, 24, 20, 30, 0)); a.marcar();
  a.irA(managua(2026, 11, 29, 5, 0, 0)); a.turno(2); a.marcar(); a.irA(managua(2026, 11, 29, 11, 15, 0)); a.marcar();
  const h = a.historial(); // más reciente primero
  assert.match(h[0][5], /^Diferencia: \+00:15:00$/);
  assert.match(h[1][5], /^Diferencia: −00:30:00$/);
  a.cerrar();
});

test('turno que cruza la medianoche: se guarda, muestra fecha en la salida y cuenta bien', () => {
  const a = abrir(managua(2026, 11, 24, 21, 0, 0)); // martes 9 PM
  a.turno(1); a.marcar();
  a.irA(managua(2026, 11, 25, 2, 0, 0)); a.marcar(); // miércoles 2 AM
  const [h] = a.historial();
  assert.match(h[0], /^Fecha: martes, 24 de noviembre/);
  assert.match(h[3], /^Salida: .*25\/11\/26.*2:00:00\s?AM/i, h[3]);
  assert.match(h[4], /^Horas trabajadas: 05:00:00$/);
  assert.equal(a.$('week').textContent, '5 h 00 min');
  a.cerrar();
});

test('cambio de semana: domingo 11 PM a lunes 2 AM solo suma a la semana nueva lo que cae en ella', () => {
  const a = abrir(managua(2026, 11, 22, 23, 0, 0));
  a.turno(1); a.marcar();
  a.irA(managua(2026, 11, 23, 2, 0, 0)); a.marcar();
  assert.equal(a.$('week').textContent, '2 h 00 min');   // lunes 00:00 a 02:00
  assert.equal(a.$('month').textContent, '3 h 00 min');  // todo es noviembre
  a.cerrar();
});

test('cambio de mes: 30 nov 11 PM a 1 dic 2 AM suma a diciembre solo 2 h', () => {
  const a = abrir(managua(2026, 11, 30, 23, 0, 0));
  a.turno(1); a.marcar();
  a.irA(managua(2026, 12, 1, 2, 0, 0)); a.marcar();
  assert.equal(a.$('month').textContent, '2 h 00 min');
  a.cerrar();
});

test('cambio de fecha con la app abierta: a medianoche el reloj y la fecha pasan al día siguiente', () => {
  const a = abrir(managua(2026, 11, 22, 23, 59, 58));
  assert.match(a.$('date').textContent, /domingo, 22 de noviembre/);
  a.avanzar(4000);
  assert.match(a.$('date').textContent, /lunes, 23 de noviembre/);
  assert.match(a.$('clock').textContent, /^12:00:02\s?AM$/i);
  a.cerrar();
});

test('jornada en curso mientras cambia el día: el contador sigue y la semana se corta a medianoche', () => {
  const a = abrir(managua(2026, 11, 22, 23, 30, 0));
  a.turno(1); a.marcar();
  a.irA(managua(2026, 11, 23, 0, 30, 0));
  assert.equal(a.$('timer').textContent, '01:00:00');
  assert.equal(a.$('week').textContent, '0 h 30 min');
  assert.equal(a.$('month').textContent, '1 h 00 min');
  a.cerrar();
});

test('si el reloj del teléfono va hacia atrás no deja marcar salida', () => {
  const a = abrir(managua(2026, 11, 23, 8, 0, 0));
  a.marcar();
  a.irA(managua(2026, 11, 23, 7, 0, 0)); a.marcar();
  assert.match(a.$('notice').textContent, /Revisá la hora del teléfono/);
  assert.equal(a.$('mark').textContent, 'Marcar salida');
  a.cerrar();
});

test('los datos guardados con varias jornadas se leen completos al reabrir', () => {
  const a = abrir(managua(2026, 11, 23, 5, 0, 0));
  for (let d = 23; d <= 27; d++) {
    a.irA(managua(2026, 11, d, 5, 0, 0)); a.turno(0); a.marcar();
    a.irA(managua(2026, 11, d, 12, 30, 0)); a.marcar();
  }
  const b = abrir(managua(2026, 11, 28, 6, 0, 0), a.guardado());
  assert.equal(b.historial().length, 5);
  assert.equal(b.$('week').textContent, '37 h 30 min');
  a.cerrar(); b.cerrar();
});

test('almacenamiento dañado (JSON inválido) no deja la app en blanco', () => {
  const a = abrir(managua(2026, 11, 23, 8, 0, 0), '{esto no es json');
  assert.equal(a.errores.length, 0, a.errores.join('|'));
  assert.equal(a.$('mark').textContent, 'Marcar entrada');
  // lo dañado no se pierde: queda una copia para recuperarlo
  assert.equal(a.w.localStorage.getItem(KEY + '.respaldo-danado'), '{esto no es json');
  a.cerrar();
});

test('almacenamiento con contenido inesperado (null / sin "real") no deja la app en blanco', () => {
  for (const raro of ['null', '{}', '{"real":null}', '[]']) {
    const a = abrir(managua(2026, 11, 23, 8, 0, 0), raro);
    assert.equal(a.errores.length, 0, `${raro}: ${a.errores.join('|')}`);
    assert.equal(a.$('mark').textContent, 'Marcar entrada', raro);
    a.cerrar();
  }
});

test('si no hay almacenamiento avisa y sigue funcionando en memoria', () => {
  const a = abrir(managua(2026, 11, 23, 8, 0, 0), null, { sinAlmacenamiento: true });
  assert.equal(a.errores.length, 0, a.errores.join('|'));
  a.marcar();
  assert.match(a.$('notice').textContent, /solo conserva las marcas/);
  a.cerrar();
});

// ---------- Pantalla de historial, compartir y exportar ----------
const puenteFalso = () => { const p = { textos: [], csvs: [] }; p.compartirTexto = t => p.textos.push(t); p.compartirCsv = (n, c) => p.csvs.push([n, c]); return p; };
const unaJornada = a => { a.irA(managua(2026, 11, 23, 5, 0, 0)); a.turno(0); a.marcar(); a.irA(managua(2026, 11, 23, 12, 30, 0)); a.marcar(); };

test('el historial está en otra pantalla: se abre con el botón y se vuelve al inicio', () => {
  const a = abrir(managua(2026, 11, 23, 8, 0, 0));
  assert.equal(a.$('home').hidden, false);
  assert.equal(a.$('hist').hidden, true);
  assert.equal(a.$('nav').textContent, 'Historial');
  a.$('nav').click();
  assert.equal(a.$('home').hidden, true);
  assert.equal(a.$('hist').hidden, false);
  assert.equal(a.$('nav').textContent, 'Inicio');
  assert.ok(a.$('history').closest('#hist'), 'la lista de jornadas vive en la pantalla de historial');
  assert.ok(!a.$('home').contains(a.$('history')), 'el inicio ya no muestra la lista');
  a.w.location.hash = ''; // lo mismo que hace el botón Atrás de Android
  a.w.dispatchEvent(new a.w.Event('hashchange'));
  assert.equal(a.$('home').hidden, false);
  assert.equal(a.$('hist').hidden, true);
  a.cerrar();
});

test('el inicio sigue mostrando reloj, turno, entrada/salida y acumulados', () => {
  const a = abrir(managua(2026, 11, 23, 8, 0, 0));
  for (const id of ['clock', 'date', 'timer', 'shift', 'mark', 'week', 'month']) assert.ok(a.$('home').contains(a.$(id)), id);
  a.cerrar();
});

test('compartir por WhatsApp envía un informe de texto con todas las jornadas, la más reciente primero', () => {
  const p = puenteFalso();
  const a = abrir(managua(2026, 11, 23, 5, 0, 0), null, { puente: p });
  unaJornada(a);
  a.irA(managua(2026, 11, 24, 16, 0, 0)); a.turno(1); a.marcar(); a.irA(managua(2026, 11, 24, 20, 30, 0)); a.marcar();
  a.$('nav').click();
  a.$('shareText').click();
  assert.equal(p.textos.length, 1);
  const t = p.textos[0];
  assert.match(t, /^Mis horas · DonPinol\nInforme al /);
  assert.match(t, /Esta semana: 12 h 00 min · Este mes: 12 h 00 min/);
  assert.ok(t.indexOf('martes, 24 de noviembre') < t.indexOf('lunes, 23 de noviembre'), 'más reciente primero');
  assert.match(t, /1\) Fecha: martes, 24 de noviembre de 2026\n   Turno: Noche\n   Entrada: 4:00:00\s?PM\n   Salida: 8:30:00\s?PM\n   Horas trabajadas: 04:30:00\n   Diferencia: −00:30:00/);
  assert.match(t, /2\) Fecha: lunes, 23 de noviembre de 2026\n   Turno: Día[\s\S]*Diferencia: \+00:00:00/);
  a.cerrar();
});

test('exportar crea un CSV con encabezado, fechas ISO de Managua y horas en 24 h', () => {
  const p = puenteFalso();
  const a = abrir(managua(2026, 11, 23, 5, 0, 0), null, { puente: p });
  unaJornada(a);
  a.irA(managua(2026, 11, 24, 21, 0, 0));
  a.$('nav').click();
  a.$('shareCsv').click();
  assert.equal(p.csvs.length, 1);
  const [nombre, csv] = p.csvs[0];
  assert.equal(nombre, 'MisHoras-2026-11-24.csv');
  const l = csv.split('\r\n');
  assert.equal(l[0], '"Fecha","Turno","Entrada","Salida","Horas trabajadas","Diferencia"');
  assert.equal(l[1], '"2026-11-23","Día","2026-11-23 05:00:00","2026-11-23 12:30:00","07:30:00","+00:00:00"');
  assert.equal(l.length, 3); // encabezado + 1 fila + salto final
  a.cerrar();
});

test('una jornada en curso se comparte como pendiente, no como terminada', () => {
  const p = puenteFalso();
  const a = abrir(managua(2026, 11, 23, 5, 0, 0), null, { puente: p });
  a.turno(0); a.marcar(); a.irA(managua(2026, 11, 23, 6, 0, 0));
  a.$('nav').click(); a.$('shareText').click(); a.$('shareCsv').click();
  assert.match(p.textos[0], /Salida: Pendiente/);
  assert.match(p.textos[0], /Diferencia: Pendiente de salida/);
  assert.match(p.csvs[0][1], /"En curso","01:00:00","En curso"/);
  a.cerrar();
});

test('sin jornadas no se comparte nada y se avisa', () => {
  const p = puenteFalso();
  const a = abrir(managua(2026, 11, 23, 5, 0, 0), null, { puente: p });
  a.$('nav').click(); a.$('shareText').click();
  assert.match(a.$('histNotice').textContent, /no hay jornadas/i);
  a.$('shareCsv').click();
  assert.equal(p.textos.length + p.csvs.length, 0);
  a.cerrar();
});

test('fuera de Android (sin puente) el informe se copia al portapapeles', async () => {
  const copiado = [];
  const a = abrir(managua(2026, 11, 23, 5, 0, 0), null, { portapapeles: { writeText: t => { copiado.push(t); return Promise.resolve(); } } });
  unaJornada(a);
  a.$('nav').click(); a.$('shareText').click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(copiado.length, 1);
  assert.match(a.$('histNotice').textContent, /copiado/i);
  a.cerrar();
});

test('el historial recuperado tras cerrar y abrir también se puede compartir', () => {
  const a = abrir(managua(2026, 11, 23, 5, 0, 0));
  unaJornada(a);
  const p = puenteFalso();
  const b = abrir(managua(2026, 11, 25, 9, 0, 0), a.guardado(), { puente: p });
  b.$('nav').click(); b.$('shareText').click();
  assert.match(p.textos[0], /lunes, 23 de noviembre de 2026/);
  a.cerrar(); b.cerrar();
});
