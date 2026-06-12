const express  = require('express');
const session  = require('express-session');
const ExcelJS  = require('exceljs');
const { Pool } = require('pg');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const XLSX_PATH   = path.join(__dirname, 'ANERA-Visitas.xlsx');
const CREDENTIALS = { usuario: 'anera', password: 'playablanca2026' };

const mapRow = r => ({
  id:            r.id,
  nombre:        r.nombre,
  telefono:      r.telefono,
  correo:        r.correo,
  ciudad:        r.ciudad,
  fechaVisita:   r.fechavisita,
  hora:          r.hora,
  interes:       r.interes,
  notas:         r.notas,
  estatus:       r.estatus,
  contactadoPor: r.contactadopor,
  nivelInteres:  r.nivelinteres,
  fechaRegistro: r.fecharegistro,
  visito:        r.visito || false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitas (
      id            SERIAL PRIMARY KEY,
      nombre        TEXT NOT NULL,
      telefono      TEXT NOT NULL,
      correo        TEXT DEFAULT '',
      ciudad        TEXT DEFAULT '',
      fechavisita   TEXT NOT NULL,
      hora          TEXT NOT NULL,
      interes       TEXT NOT NULL,
      notas         TEXT DEFAULT '',
      estatus       TEXT DEFAULT 'Pendiente',
      contactadopor TEXT DEFAULT '',
      nivelinteres  TEXT DEFAULT '',
      fecharegistro TEXT DEFAULT '',
      visito        BOOLEAN DEFAULT false
    )
  `);
  await pool.query(`
    ALTER TABLE visitas ADD COLUMN IF NOT EXISTS visito BOOLEAN DEFAULT false
  `);
}

async function importFromExcel() {
  const { rows: [{ n }] } = await pool.query('SELECT COUNT(*)::int AS n FROM visitas');
  if (n > 0 || !fs.existsSync(XLSX_PATH)) return;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.getWorksheet('Visitas');
  if (!ws) return;

  const str = x => (x == null ? '' : String(x instanceof Date ? x.toLocaleDateString('es-MX') : x));
  const records = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const v = row.values;
    records.push([
      str(v[2]), str(v[3]), str(v[4]), str(v[5]),
      str(v[6]), str(v[7]), str(v[8]), str(v[9]),
      str(v[10]) || 'Pendiente', str(v[11]), str(v[12]), str(v[13]),
    ]);
  });
  if (!records.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of records) {
      await client.query(`
        INSERT INTO visitas
          (nombre,telefono,correo,ciudad,fechavisita,hora,interes,notas,
           estatus,contactadopor,nivelinteres,fecharegistro)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `, r);
    }
    await client.query('COMMIT');
    console.log(`Importados ${records.length} registros desde Excel`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error importando Excel:', e.message);
  } finally {
    client.release();
  }
}

const EXCEL_COLS = [
  { header: 'ID',                key: 'id',            width: 6  },
  { header: 'Nombre Completo',   key: 'nombre',        width: 28 },
  { header: 'Teléfono/WhatsApp', key: 'telefono',      width: 18 },
  { header: 'Correo',            key: 'correo',        width: 28 },
  { header: 'Ciudad de Origen',  key: 'ciudad',        width: 20 },
  { header: 'Fecha Visita',      key: 'fechaVisita',   width: 14 },
  { header: 'Hora',              key: 'hora',          width: 8  },
  { header: 'Interés de Compra', key: 'interes',       width: 20 },
  { header: 'Notas Internas',    key: 'notas',         width: 40 },
  { header: 'Seguimiento',       key: 'estatus',       width: 14 },
  { header: 'Contactado por',    key: 'contactadoPor', width: 16 },
  { header: 'Estatus',           key: 'nivelInteres',  width: 18 },
  { header: 'Fecha Registro',    key: 'fechaRegistro', width: 20 },
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

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: 'anera-playa-blanca-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

app.get('/login', (req, res) => {
  if (req.session.auth) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === CREDENTIALS.usuario && password === CREDENTIALS.password) {
    req.session.auth = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.use((req, res, next) => {
  if (/\.(css|js|png|jpg|jpeg|ico|woff2?)$/.test(req.path)) return next();
  if (req.path === '/login' || req.path === '/api/login') return next();
  if (!req.session.auth) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'No autenticado' });
    return res.redirect('/login');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/api/visitas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM visitas ORDER BY id ASC');
    res.json(rows.map(mapRow));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/visita', async (req, res) => {
  try {
    const { nombre, telefono, correo, ciudad, fechaVisita, hora,
            interes, notas, contactadoPor, nivelInteres } = req.body;
    if (!nombre || !telefono || !fechaVisita || !hora || !interes || !contactadoPor)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const visito = req.body.visito === 'true' || req.body.visito === true;
    const fechaRegistro = req.body.fechaRegistro ||
      new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
    const { rows } = await pool.query(`
      INSERT INTO visitas
        (nombre,telefono,correo,ciudad,fechavisita,hora,interes,notas,
         estatus,contactadopor,nivelinteres,fecharegistro,visito)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pendiente',$9,$10,$11,$12)
      RETURNING *
    `, [nombre, telefono, correo||'', ciudad||'', fechaVisita, hora,
        interes, notas||'', contactadoPor, nivelInteres||'', fechaRegistro, visito]);

    res.json(mapRow(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/visita/:id', async (req, res) => {
  try {
    const { nombre, telefono, correo, ciudad, fechaVisita, hora,
            interes, notas, estatus, contactadoPor, nivelInteres } = req.body;
    if (!nombre || !telefono || !fechaVisita || !hora || !interes || !estatus || !contactadoPor)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const visito = req.body.visito === 'true' || req.body.visito === true;
    const { rowCount } = await pool.query(`
      UPDATE visitas SET
        nombre=$1, telefono=$2, correo=$3, ciudad=$4, fechavisita=$5,
        hora=$6, interes=$7, notas=$8, estatus=$9,
        contactadopor=$10, nivelinteres=$11, visito=$12
      WHERE id=$13
    `, [nombre, telefono, correo||'', ciudad||'', fechaVisita, hora,
        interes, notas||'', estatus, contactadoPor, nivelInteres||'', visito,
        req.params.id]);

    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/visita/:id/visito', async (req, res) => {
  try {
    const visito = req.body.visito === true || req.body.visito === 'true';
    const { rowCount } = await pool.query(
      'UPDATE visitas SET visito=$1 WHERE id=$2', [visito, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/visita/:id/estatus', async (req, res) => {
  try {
    const { estatus } = req.body;
    const valid = ['Pendiente','Confirmada','Realizada','Cancelada','Sin éxito'];
    if (!valid.includes(estatus)) return res.status(400).json({ error: 'Estatus inválido' });

    const { rowCount } = await pool.query(
      'UPDATE visitas SET estatus=$1 WHERE id=$2', [estatus, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/visita/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM visitas WHERE id=$1', [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export-excel', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM visitas ORDER BY id ASC');
    const wb = await buildExcel(rows.map(mapRow));
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      'attachment; filename="ANERA-Visitas.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function start() {
  console.log('DATABASE_URL definida:', !!process.env.DATABASE_URL);
  console.log('PORT:', PORT);

  app.listen(PORT, () => {
    console.log(`ANERA Visitas corriendo en http://localhost:${PORT}`);
  });

  try {
    await initDB();
    await importFromExcel();
    console.log('Base de datos lista');
  } catch (err) {
    console.error('Error al conectar DB:', err);
  }
}

start();
