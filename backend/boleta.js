/**
 * boleta.js — Generador XML DTE formato SII Chile
 */

const TASA_IVA = 19;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fechaSII(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function generarXMLDTE({ tipo = 39, folio, fecha = new Date(), emisor, receptor, items }) {
  const detalle = items.map((item, idx) => {
    const montoItem = Math.round(item.precio * item.cantidad);
    return { ...item, nroLinea: idx + 1, montoItem };
  });

  const mntTotal = detalle.reduce((s, i) => s + i.montoItem, 0);

  let mntNeto, mntIVA, totalDoc;
  if (tipo === 39) {
    mntNeto  = Math.round(mntTotal / (1 + TASA_IVA / 100));
    mntIVA   = mntTotal - mntNeto;
    totalDoc = mntTotal;
  } else {
    mntNeto  = mntTotal;
    mntIVA   = Math.round(mntTotal * TASA_IVA / 100);
    totalDoc = mntNeto + mntIVA;
  }

  const lineasXML = detalle.map(item => `
    <Detalle>
      <NroLinDet>${item.nroLinea}</NroLinDet>
      <NmbItem>${esc(item.nombre)}</NmbItem>
      <DscItem>${esc(item.descripcion ?? '')}</DscItem>
      <QtyItem>${item.cantidad}</QtyItem>
      <UnmdItem>UN</UnmdItem>
      <PrcItem>${item.precio}</PrcItem>
      <MontoItem>${item.montoItem}</MontoItem>
    </Detalle>`).join('');

  const rutRecep = receptor.rut || '66666666-6';
  const nombreRecep = receptor.nombre || 'Consumidor Final';

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE version="1.0">
  <Documento ID="F${tipo}T${folio}">
    <Encabezado>
      <IdDoc>
        <TipoDTE>${tipo}</TipoDTE>
        <Folio>${folio}</Folio>
        <FchEmis>${fechaSII(fecha)}</FchEmis>
        <IndServicio>3</IndServicio>
        <MntBruto>1</MntBruto>
        <FmaPago>1</FmaPago>
      </IdDoc>
      <Emisor>
        <RUTEmisor>${esc(emisor.rut)}</RUTEmisor>
        <RznSoc>${esc(emisor.razonSocial)}</RznSoc>
        <GiroEmis>${esc(emisor.giro)}</GiroEmis>
        <Acteco>${emisor.acteco ?? 0}</Acteco>
        <DirOrigen>${esc(emisor.direccion)}</DirOrigen>
        <CmnaOrigen>${esc(emisor.comuna)}</CmnaOrigen>
        <CiudadOrigen>${esc(emisor.ciudad ?? emisor.comuna)}</CiudadOrigen>
      </Emisor>
      <Receptor>
        <RUTRecep>${esc(rutRecep)}</RUTRecep>
        <RznSocRecep>${esc(nombreRecep)}</RznSocRecep>
        <CorreoRecep>${esc(receptor.email ?? '')}</CorreoRecep>
      </Receptor>
      <Totales>
        <MntNeto>${mntNeto}</MntNeto>
        <TasaIVA>${TASA_IVA}</TasaIVA>
        <IVA>${mntIVA}</IVA>
        <MntTotal>${totalDoc}</MntTotal>
      </Totales>
    </Encabezado>
    ${lineasXML}
  </Documento>
</DTE>`;
}

async function siguienteFolio(pool, tipoDTE = 39) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT ultimo_folio FROM folios WHERE tipo_dte = ? FOR UPDATE',
      [tipoDTE]
    );
    if (!rows.length) throw new Error(`No existe configuración de folio para tipo DTE ${tipoDTE}`);
    const folio = rows[0].ultimo_folio + 1;
    await conn.execute(
      'UPDATE folios SET ultimo_folio = ? WHERE tipo_dte = ?',
      [folio, tipoDTE]
    );
    await conn.commit();
    return folio;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { generarXMLDTE, siguienteFolio };
