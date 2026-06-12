const express  = require('express');
const ExcelJS  = require('exceljs');
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const app       = express();
const PORT      = 3000;
const DB_PATH   = path.join(__dirname, 'anera-visitas.db');
const XLSX_PATH = path.join(__dirname, 'ANERA-Visitas.xlsx');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SQLite setup ─────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS visitas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL,
    telefono      TEXT NOT NULL,
    correo        TEXT DEFAULT '',
    ciudad        TEXT DEFAULT '',
    fechaVisita   TEXT NOT NULL,
    hora          TEXT NOT NULL,
    interes       TEXT NOT NULL,
    notas         TEXT DEFAULT '',
    estatus       TEXT DEFAULT 'Pendiente',
    contactadoPor TEXT DEFAULT '',
    nivelInteres  TEXT DEFAULT '',
    fechaRegistro TEXT DEFAULT ''
  )
`);

// ─── Import Excel → SQLite (solo si la BD está vacía) ─────────────────────────

async function importFromExcel() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM visitas').get();
  if (n > 0 || !fs.existsSync(XLSX_PATH)) return;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('Visitas');
  if (!ws) return;

  const insert = db.prepare(`
    INSERT INTO visitas
      (nombre, telefono, correo, ciudad, fechaVisita, hora, interes,
       notas, estatus, contactadoPor, nivelInteres, fechaRegistro)
    VALUES
      (@nombre,@telefono,@correo,@ciudad,@fechaVisita,@hora,@interes,
       @notas,@estatus,@contactadoPor,@nivelInteres,@fechaRegistro)
  `);

  const importAll = db.transaction(rows => { for (const r of rows) insert.run(r); });

  const rows = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = row.values;
    const str = x => (x == null ? '' : String(x instanceof Date ? x.toLocaleDateString('es-MX') : x));
    rows.push({
      nombre:        str(v[2]),
      telefono:      str(v[3]),
      correo:        str(v[4]),
      ciudad:        str(v[5]),
      fechaVisita:   str(v[6]),
      hora:          str(v[7]),
      interes:       str(v[8]),
      notas:         str(v[9]),
      estatus:       str(v[10]) || 'Pendiente',
      contactadoPor: str(v[11]),
      nivelInteres:  str(v[12]),
      fechaRegistro: str(v[13]),
    });
  });

  if (rows.length) {
    importAll(rows);
    console.log(`📥  ${rows.length} registros importados desde Excel`);
  }
}

// ─── Excel export helper ──────────────────────────────────────────────────────

const EXCEL_COLS = [
  { header: 'ID',               key: 'id',            width: 6  },
  { header: 'Nombre Completo',  key: 'nombre',        width: 28 },
  { header: 'Teléfono/WhatsApp',key: 'telefono',      width: 18 },
  { header: 'Correo',           key: 'correo',        width: 28 },
  { header: 'Ciudad de Origen', key: 'ciudad',        width: 20 },
  { header: 'Fecha Visita',     key: 'fechaVisita',   width: 14 },
  { header: 'Hora',             key: 'hora',          width: 8  },
  { header: 'Interés de Compra',key: 'interes',       width: 20 },
  { header: 'Notas Internas',   key: 'notas',         width: 40 },
  { header: 'Estatus',          key: 'estatus',       width: 14 },
  { header: 'Contactado por',   key: 'contactadoPor', width: 16 },
  { header: 'Nivel de Interés', key: 'nivelInteres',  width: 18 },
  { header: 'Fecha Registro',   key: 'fechaRegistro', width: 20 },
];

async function buildExcel(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Visitas');
  ws.columns = EXCEL_COLS;

  const hdr = ws.getRow(1);
  hdr.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  hdr.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C5E' } };
  hdr.alignment = { vertical: 'middle', horizontal: 'center' };
  hdr.height    = 22;

  rows.forEach((v, idx) => {
    const row = ws.addRow([
      v.id, v.nombre, v.telefono, v.correo, v.ciudad,
      v.fechaVisita, v.hora, v.interes, v.notas,
      v.estatus, v.contactadoPor, v.nivelInteres, v.fechaRegistro,
    ]);
    const fill = idx % 2 === 0
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    row.eachCell(cell => { cell.fill = fill; });
    row.alignment = { vertical: 'middle' };
  });

  return wb;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/visitas', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM visitas ORDER BY id ASC').all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/visita', (req, res) => {
  try {
    const { nombre, telefono, correo, ciudad, fechaVisita, hora,
            interes, notas, contactadoPor, nivelInteres } = req.body;
    if (!nombre || !telefono || !fechaVisita || !hora || !interes || !contactadoPor)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const fechaRegistro = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO visitas
        (nombre,telefono,correo,ciudad,fechaVisita,hora,interes,notas,
         estatus,contactadoPor,nivelInteres,fechaRegistro)
      VALUES (?,?,?,?,?,?,?,?,'Pendiente',?,?,?)
    `).run(nombre, telefono, correo||'', ciudad||'', fechaVisita, hora,
           interes, notas||'', contactadoPor, nivelInteres||'', fechaRegistro);

    res.json(db.prepare('SELECT * FROM visitas WHERE id=?').get(lastInsertRowid));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/visita/:id', (req, res) => {
  try {
    const { nombre, telefono, correo, ciudad, fechaVisita, hora,
            interes, notas, estatus, contactadoPor, nivelInteres } = req.body;
    if (!nombre || !telefono || !fechaVisita || !hora || !interes || !estatus || !contactadoPor)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const { changes } = db.prepare(`
      UPDATE visitas SET
        nombre=?,telefono=?,correo=?,ciudad=?,fechaVisita=?,hora=?,
        interes=?,notas=?,estatus=?,contactadoPor=?,nivelInteres=?
      WHERE id=?
    `).run(nombre, telefono, correo||'', ciudad||'', fechaVisita, hora,
           interes, notas||'', estatus, contactadoPor, nivelInteres||'',
           req.params.id);

    if (changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/visita/:id/estatus', (req, res) => {
  try {
    const { estatus } = req.body;
    const valid = ['Pendiente','Confirmada','Realizada','Cancelada'];
    if (!valid.includes(estatus)) return res.status(400).json({ error: 'Estatus inválido' });

    const { changes } = db.prepare('UPDATE visitas SET estatus=? WHERE id=?')
                          .run(estatus, req.params.id);
    if (changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/visita/:id', (req, res) => {
  try {
    const { changes } = db.prepare('DELETE FROM visitas WHERE id=?').run(req.params.id);
    if (changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export-excel', async (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM visitas ORDER BY id ASC').all();
    const wb   = await buildExcel(rows);
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      'attachment; filename="ANERA-Visitas.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────────────────────

importFromExcel().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅  ANERA Visitas corriendo en http://localhost:${PORT}\n`);
  });
});
