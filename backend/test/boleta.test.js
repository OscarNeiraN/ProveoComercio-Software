const test = require('node:test');
const assert = require('node:assert/strict');
const { generarXMLDTE, siguienteFolio } = require('../boleta');

const emisor = {
  rut: '12345678-9',
  razonSocial: 'ProveoComercio SpA',
  giro: 'Comercio',
  acteco: '472000',
  direccion: 'Av. Principal 123',
  comuna: 'Santiago',
  ciudad: 'Santiago',
};

test('generarXMLDTE creates a boleta with escaped customer and item data', () => {
  const xml = generarXMLDTE({
    tipo: 39,
    folio: 7,
    fecha: new Date('2026-01-15T12:00:00Z'),
    emisor,
    receptor: {
      rut: '11111111-1',
      nombre: 'Cliente & Compania',
      email: 'cliente@example.com',
    },
    items: [
      {
        nombre: 'Monitor <Ultra>',
        descripcion: 'SKU & special',
        cantidad: 2,
        precio: 1000,
      },
    ],
  });

  assert.match(xml, /<TipoDTE>39<\/TipoDTE>/);
  assert.match(xml, /<Folio>7<\/Folio>/);
  assert.match(xml, /<FchEmis>2026-01-15<\/FchEmis>/);
  assert.match(xml, /Cliente &amp; Compania/);
  assert.match(xml, /Monitor &lt;Ultra&gt;/);
  assert.match(xml, /SKU &amp; special/);
  assert.match(xml, /<MntTotal>2000<\/MntTotal>/);
});

test('siguienteFolio increments and commits the folio transaction', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push(['begin']),
    execute: async (sql, params) => {
      calls.push(['execute', sql, params]);
      if (sql.includes('SELECT ultimo_folio')) {
        return [[{ ultimo_folio: 41 }]];
      }
      return [{ affectedRows: 1 }];
    },
    commit: async () => calls.push(['commit']),
    rollback: async () => calls.push(['rollback']),
    release: () => calls.push(['release']),
  };
  const pool = {
    getConnection: async () => connection,
  };

  const folio = await siguienteFolio(pool, 39);

  assert.equal(folio, 42);
  assert.deepEqual(calls[0], ['begin']);
  assert.equal(calls.some(call => call[0] === 'commit'), true);
  assert.equal(calls.some(call => call[0] === 'rollback'), false);
  assert.deepEqual(calls.at(-1), ['release']);
});
