// ── Navigation ────────────────────────────────────────────────────────────────

let allVisitas = [];

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('view-' + view).classList.add('active');
    if (view === 'dashboard' || view === 'registros') loadVisitas();
    cerrarSidebar();
  });
});

// ── Hamburger ─────────────────────────────────────────────────────────────────

const hamburger      = document.getElementById('hamburger');
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

hamburger.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  hamburger.classList.toggle('is-open', open);
  sidebarOverlay.classList.toggle('active', open);
});

sidebarOverlay.addEventListener('click', cerrarSidebar);

function cerrarSidebar() {
  sidebar.classList.remove('open');
  hamburger.classList.remove('is-open');
  sidebarOverlay.classList.remove('active');
}

// ── Sort state ────────────────────────────────────────────────────────────────

let sortState = { col: null, dir: 'asc' };

document.querySelector('#tbl-registros thead').addEventListener('click', e => {
  const th = e.target.closest('.sortable');
  if (!th) return;
  const col = th.dataset.col;
  if (sortState.col === col) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.col = col;
    sortState.dir = 'asc';
  }
  filtrarTabla();
  updateSortHeaders();
});

function updateSortHeaders() {
  document.querySelectorAll('#tbl-registros th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === sortState.col) {
      th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function applySortOrder(data) {
  if (!sortState.col) return data;
  return [...data].sort((a, b) => {
    const va = (a[sortState.col] || '').toString().toLowerCase();
    const vb = (b[sortState.col] || '').toString().toLowerCase();
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    return sortState.dir === 'asc' ? cmp : -cmp;
  });
}

// ── Load & render ─────────────────────────────────────────────────────────────

async function loadVisitas() {
  try {
    const res  = await fetch('/api/visitas');
    allVisitas = await res.json();
    renderDashboard(allVisitas);
    renderTablaRegistros(allVisitas);
  } catch (e) {
    console.error('Error cargando visitas:', e);
  }
}

function renderDashboard(data) {
  const hoy   = new Date();
  const anio  = hoy.getFullYear();
  const mes   = hoy.getMonth();
  const hoyStr = hoy.toISOString().slice(0, 10);

  document.getElementById('cnt-total').textContent = data.filter(v => {
    const d = new Date(v.fechaVisita + 'T00:00:00');
    return d.getFullYear() === anio && d.getMonth() === mes;
  }).length;

  document.getElementById('cnt-agendadas').textContent = data.filter(v =>
    v.fechaVisita > hoyStr
  ).length;

  const fechaEl = document.getElementById('fecha-hoy');
  if (fechaEl) {
    const texto = hoy.toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    fechaEl.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  const recent = [...data].reverse().slice(0, 8);
  const tbody  = document.querySelector('#tbl-recientes tbody');
  tbody.innerHTML = recent.length
    ? recent.map(v => `
        <tr>
          <td>${v.id}</td>
          <td><strong>${esc(v.nombre)}</strong></td>
          <td>${esc(v.fechaVisita)}</td>
          <td>${badgeCanal(v.canalIngreso)}</td>
          <td>${esc(v.interes)}</td>
          <td>${badgeNivel(v.nivelInteres)}</td>
          <td>${badgeVisito(v.id, v.visito)}</td>
          <td>${v.notas ? `<button class="btn-nota" onclick="verNota(${v.id})" title="Ver nota">📋</button>` : '<span class="sub-text">—</span>'}</td>
          <td><div class="acciones">
            <button class="btn-edit" onclick="abrirEditar(${v.id})" title="Editar">✎</button>
            <button class="btn-del"  onclick="eliminarVisita(${v.id})" title="Eliminar">✕</button>
          </div></td>
        </tr>`).join('')
    : `<tr><td colspan="8" class="empty-row">Sin registros todavía.</td></tr>`;
}

function renderTablaRegistros(data) {
  const tbody = document.querySelector('#tbl-registros tbody');
  const empty = document.getElementById('empty-state');

  if (!data.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const sorted = sortState.col ? applySortOrder(data) : [...data].reverse();
  tbody.innerHTML = sorted.map(v => `
    <tr id="row-${v.id}">
      <td>${v.id}</td>
      <td>
        <strong>${esc(v.nombre)}</strong><br>
        <span class="sub-text">${esc(v.telefono)}</span>
      </td>
      <td>${esc(v.telefono)}</td>
      <td>${esc(v.ciudad || '—')}</td>
      <td>${esc(v.fechaRegistro || '—')}</td>
      <td>${esc(v.fechaVisita || '—')}</td>
      <td>${badgeCanal(v.canalIngreso)}</td>
      <td>${esc(v.interes)}</td>
      <td>${badgeNivel(v.nivelInteres)}</td>
      <td>${badgeVisito(v.id, v.visito)}</td>
      <td>${esc(v.contactadoPor || '—')}</td>
      <td>${v.notas ? `<button class="btn-nota" onclick="verNota(${v.id})" title="Ver nota">📋</button>` : '<span class="sub-text">—</span>'}</td>
      <td><div class="acciones">
        <button class="btn-edit" onclick="abrirEditar(${v.id})" title="Editar">✎</button>
        <button class="btn-del"  onclick="eliminarVisita(${v.id})" title="Eliminar">✕</button>
      </div></td>
    </tr>`).join('');
}

// ── Form submit ───────────────────────────────────────────────────────────────

document.getElementById('form-visita').addEventListener('submit', async e => {
  e.preventDefault();
  const msg  = document.getElementById('form-msg');
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));

  msg.className   = 'form-msg';
  msg.textContent = '';

  try {
    const res  = await fetch('/api/visita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al guardar');
    msg.className   = 'form-msg ok';
    msg.textContent = `✓ Visita registrada correctamente (ID #${json.id})`;
    form.reset();
    setTimeout(() => { msg.className = 'form-msg'; }, 4000);
  } catch (err) {
    msg.className   = 'form-msg error';
    msg.textContent = '✗ ' + err.message;
  }
});

function resetForm() {
  document.getElementById('form-visita').reset();
  document.getElementById('form-msg').className = 'form-msg';
}

// ── Status change ─────────────────────────────────────────────────────────────

async function cambiarEstatus(select) {
  const id     = select.dataset.id;
  const estatus = select.value;
  try {
    const res = await fetch(`/api/visita/${id}/estatus`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estatus }),
    });
    if (!res.ok) throw new Error();
    await loadVisitas();
  } catch {
    alert('No se pudo actualizar el estatus.');
  }
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function abrirEditar(id) {
  const v = allVisitas.find(x => Number(x.id) === Number(id));
  if (!v) return;
  const f = document.getElementById('form-editar');
  f.id.value            = v.id;
  f.nombre.value        = v.nombre        || '';
  f.telefono.value      = v.telefono      || '';
  f.correo.value        = v.correo        || '';
  f.ciudad.value        = v.ciudad        || '';
  f.fechaVisita.value   = v.fechaVisita && v.hora
    ? v.fechaVisita + 'T' + v.hora
    : (v.fechaVisita || '');
  f.interes.value       = v.interes       || '';
  f.contactadoPor.value = v.contactadoPor || '';
  f.estatus.value       = v.estatus       || 'Pendiente';
  f.notas.value         = v.notas         || '';
  f.visito.checked      = v.visito        || false;
  document.querySelectorAll('#form-editar [name="canalIngreso"]').forEach(r => {
    r.checked = r.value === (v.canalIngreso || '');
  });
  document.querySelectorAll('#form-editar [name="nivelInteres"]').forEach(r => {
    r.checked = r.value === (v.nivelInteres || '');
  });
  document.getElementById('modal-msg').className = 'form-msg';
  document.getElementById('modal-overlay').classList.add('open');
}

function cerrarModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return;
  document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('form-editar').addEventListener('submit', async e => {
  e.preventDefault();
  const msg  = document.getElementById('modal-msg');
  const f    = e.target;
  const id   = f.id.value;
  const data = Object.fromEntries(new FormData(f));

  msg.className = 'form-msg';
  try {
    const res  = await fetch(`/api/visita/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al guardar');
    document.getElementById('modal-overlay').classList.remove('open');
    await loadVisitas();
  } catch (err) {
    msg.className   = 'form-msg error';
    msg.textContent = '✗ ' + err.message;
  }
});

// ── Visito toggle ─────────────────────────────────────────────────────────────

function badgeVisito(id, visito) {
  return visito
    ? `<button class="badge-visito" onclick="toggleVisito(${id}, true)" title="Clic para desmarcar">✓ Visitó</button>`
    : `<button class="badge-visito-no" onclick="toggleVisito(${id}, false)" title="Clic para marcar">🚫</button>`;
}

async function toggleVisito(id, actual) {
  try {
    const res = await fetch(`/api/visita/${id}/visito`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visito: !actual }),
    });
    if (!res.ok) throw new Error();
    await loadVisitas();
  } catch {
    alert('No se pudo actualizar.');
  }
}

// ── Nota modal ────────────────────────────────────────────────────────────────

function verNota(id) {
  const v = allVisitas.find(x => Number(x.id) === Number(id));
  if (!v) return;
  document.getElementById('modal-nota-texto').textContent = v.notas || '';
  document.getElementById('modal-nota-overlay').classList.add('open');
}

function cerrarModalNota(e) {
  if (e && e.target !== document.getElementById('modal-nota-overlay')) return;
  document.getElementById('modal-nota-overlay').classList.remove('open');
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function eliminarVisita(id) {
  if (!confirm('¿Seguro que deseas eliminar esta visita?')) return;
  try {
    const res = await fetch(`/api/visita/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    await loadVisitas();
  } catch {
    alert('No se pudo eliminar el registro.');
  }
}

// ── Search / filter ───────────────────────────────────────────────────────────

function filtrarTabla() {
  const q = document.getElementById('buscador').value.toLowerCase();
  const filtered = allVisitas.filter(v =>
    [v.nombre, v.telefono, v.correo, v.ciudad, v.interes,
     v.estatus, v.notas, v.contactadoPor, v.nivelInteres]
      .some(f => (f || '').toLowerCase().includes(q))
  );
  renderTablaRegistros(filtered);
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportExcel() {
  window.location.href = '/api/export-excel';
}

// ── Badges ────────────────────────────────────────────────────────────────────

function badgeCanal(canal) {
  const map = {
    'Walk in':       'badge-canal-walkin',
    'Huésped':       'badge-canal-huesped',
    'Redes sociales':'badge-canal-redes',
    'WhatsApp':      'badge-canal-whatsapp',
  };
  if (!canal || !map[canal]) return '<span class="sub-text">—</span>';
  return `<span class="badge ${map[canal]}">${esc(canal)}</span>`;
}

function badgeNivel(nivel) {
  const map = {
    'Alto interés':    'badge-nivel-alto',
    'En seguimiento':  'badge-nivel-seg',
    'Solo explorando': 'badge-nivel-solo',
  };
  if (!nivel) return '<span class="badge badge-nivel-solo">—</span>';
  return `<span class="badge ${map[nivel] || 'badge-nivel-solo'}">${esc(nivel)}</span>`;
}

function badge(estatus) {
  const map = {
    'Pendiente':  'badge-pendiente',
    'Confirmada': 'badge-confirmada',
    'Realizada':  'badge-realizada',
    'Cancelada':  'badge-cancelada',
    'Sin éxito':  'badge-sinexico',
  };
  return `<span class="badge ${map[estatus] || ''}">${esc(estatus)}</span>`;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Logout ───────────────────────────────────────────────────────────────────

document.getElementById('btn-logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadVisitas();
