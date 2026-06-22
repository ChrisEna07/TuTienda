const API = '/api';
let TOKEN = localStorage.getItem('token');
let USUARIO = null;
let currentModule = 'dashboard';
const SOPORTE_WA = 'https://w.app/rtz8lp';

// ================ VALIDACIONES EN TIEMPO REAL ================
const validators = {
  soloLetras: v => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ''),
  soloNumeros: v => v.replace(/\D/g, ''),
  telefono: v => v.replace(/\D/g, '').substring(0, 15),
  nit: v => {
    let cleaned = v.replace(/[^0-9\-]/g, '');
    cleaned = cleaned.replace(/-/g, '').substring(0, 15);
    if (cleaned.length > 9) cleaned = cleaned.substring(0, 9) + '-' + cleaned.substring(9, 10);
    return cleaned;
  },
  nombrePropio: v => v.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').substring(0, 60),
  email: v => {
    v = v.replace(/[^a-zA-Z0-9@._\-]/g, '').substring(0, 100);
    const at = v.indexOf('@');
    if (at > -1) v = v.substring(0, at + 1) + v.substring(at + 1).replace(/[^a-zA-Z0-9._\-]/g, '');
    return v;
  }
};

function validarHoy(campo, mensajeAlerta = 'Este producto esta proximo a vencer') {
  const val = document.getElementById(campo)?.value;
  if (!val) return true;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const fecha = new Date(val + 'T23:59:59');
  if (fecha < hoy) { Swal.fire({ icon: 'error', title: 'Fecha invalida', text: 'No puedes agregar productos con fecha de vencimiento anterior a hoy' }); return false; }
  const diff = Math.ceil((fecha - hoy) / 86400000);
  if (diff <= 30) Swal.fire({ icon: 'warning', title: 'Alerta de Caducidad', text: `${mensajeAlerta}. Vence en ${diff} dias.`, timer: 3000, showConfirmButton: false });
  return true;
}

function bindValidation(id, validator) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => { el.value = validator(el.value); });
}

// ================ INICIALIZACION ================
document.addEventListener('DOMContentLoaded', () => {
  if (TOKEN) verificarToken().then(valido => {
    if (valido) { mostrarApp(); cargarModulo('dashboard'); }
    else { mostrarLanding(); }
  }).catch(() => mostrarLanding());
  else mostrarLanding();
  iniciarReloj();
  loadLandingData();
  bindValidation('loginEmail', validators.email);
  bindValidation('regNombre', validators.nombrePropio);
  bindValidation('regEmail', validators.email);
  bindValidation('regTelefono', validators.telefono);
  bindValidation('regPassword', v => v);
  bindValidation('regPassword2', v => v);
});
async function request(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const res = await fetch(API + url, { ...opts, headers });
  const data = await res.json();
  if (!res.ok && res.status === 401) { TOKEN = null; localStorage.removeItem('token'); mostrarLanding(); throw new Error(data.error); }
  if (!res.ok) {
    if (data.error && (data.error.includes('expirado') || data.error.includes('expirada') || data.error.includes('suscripcion') || data.error.includes('suscripción') || data.codigo === 'TRIAL_EXPIRADO')) {
      Swal.fire({
        icon: 'warning',
        title: 'Periodo de prueba finalizado',
        text: 'Tu periodo de prueba o suscripción ha terminado. Por favor, selecciona un paquete de suscripción para seguir disfrutando del servicio.',
        confirmButtonText: 'Ver Planes y Precios',
        allowOutsideClick: false,
        allowEscapeKey: false
      }).then(() => {
        cerrarSesionExpirada();
      });
    }
    throw new Error(data.error || 'Error del servidor');
  }
  return data;
}

function cerrarSesionExpirada() {
  TOKEN = null;
  USUARIO = null;
  localStorage.removeItem('token');
  document.getElementById('appLayout').classList.remove('active');
  mostrarLanding();
  setTimeout(() => {
    document.getElementById('pricingSection')?.scrollIntoView({ behavior: 'smooth' });
  }, 500);
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Ingresando...';
  try {
    const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    TOKEN = data.token; USUARIO = data.usuario;
    localStorage.setItem('token', TOKEN);
    cerrarAuth();
    mostrarApp();
    cargarModulo('dashboard');
    Swal.fire({ icon: 'success', title: 'Bienvenido', text: `Hola ${USUARIO.nombre}`, timer: 1500, showConfirmButton: false });
  } catch (err) {
    if (err.message.includes('TRIAL_EXPIRADO') || err.message.includes('SUSCRIPCION_EXPIRADA')) {
      Swal.fire({ icon: 'warning', title: 'Acceso Denegado', text: err.message, confirmButtonColor: '#25D366', confirmButtonText: '<i class="fab fa-whatsapp"></i> Contactar Soporte', footer: `<a href="${SOPORTE_WA}?text=Soporte%20TuTienda" target="_blank">Escribenos a WhatsApp</a>` });
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: err.message });
    }
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesion'; }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('regNombre').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;
  if (!nombre || nombre.length < 3) return Swal.fire({ icon: 'error', title: 'El nombre debe tener al menos 3 caracteres' });
  if (password !== password2) return Swal.fire({ icon: 'error', title: 'Las contrasenas no coinciden' });
  if (password.length < 6) return Swal.fire({ icon: 'error', title: 'La contrasena debe tener al menos 6 caracteres' });
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner animate-spin"></i> Creando cuenta...';
  try {
    const data = await request('/public/registro', { method: 'POST', body: JSON.stringify({ nombre, email, telefono, password }) });
    Swal.fire({ icon: 'success', title: 'Cuenta Creada!', text: data.mensaje, confirmButtonColor: '#6C5CE7', confirmButtonText: 'Iniciar Sesion' }).then(() => {
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPassword').value = password;
      cambiarAuthTab('login');
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rocket"></i> Crear Cuenta y Empezar'; }
});

// ================ LANDING PAGE ================
function mostrarLanding() {
  document.getElementById('landingPage').classList.add('active');
  document.getElementById('appLayout').classList.remove('active');
  document.getElementById('authOverlay').classList.remove('active');
}

function abrirAuth(tab = 'login') {
  document.getElementById('authOverlay').classList.add('active');
  cambiarAuthTab(tab);
}
function cerrarAuth() {
  document.getElementById('authOverlay').classList.remove('active');
}
document.getElementById('authOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) cerrarAuth();
});
document.querySelector('.auth-modal')?.addEventListener('touchstart', e => e.stopPropagation());

function cambiarAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(tab === 'login' ? 'tabLogin' : 'tabRegister').classList.add('active');
  document.getElementById(tab === 'login' ? 'loginForm' : 'registerForm').classList.add('active');
}

async function loadLandingData() {
  try {
    const [ofertas, preview] = await Promise.all([
      request('/public/ofertas'),
      request('/public/dashboard-preview')
    ]);
    const featuresGrid = document.getElementById('featuresGrid');
    if (featuresGrid) {
      featuresGrid.innerHTML = preview.caracteristicas.map(f => `
        <div class="feature-card">
          <div class="feat-icon" style="background:rgba(108,92,231,0.15);color:var(--primary)"><i class="fas ${f.icono}"></i></div>
          <h3>${f.titulo}</h3>
          <p>${f.descripcion}</p>
        </div>
      `).join('');
    }
    const pricingGrid = document.getElementById('pricingGrid');
    if (pricingGrid) {
      pricingGrid.innerHTML = ofertas.length ? ofertas.map((o, i) => {
        const modulos = JSON.parse(o.caracteristicas || '[]');
        return `
        <div class="pricing-card ${i === 1 ? 'featured' : ''}">
          <h3>${o.nombre}</h3>
          <div class="price">$${Number(o.precio).toLocaleString('es-CO')} <small>/ ${o.duracion_dias} dias</small></div>
          ${o.tipo_pago === 'unico' ? '<div class="price-desc" style="color:var(--success)"><i class="fas fa-check-circle"></i> Pago Unico - Sin mensualidad</div>' : `<div class="price-desc">+ $${Number(o.precio_mensual).toLocaleString('es-CO')}/mes <small>Cloud</small></div>`}
          <div class="price-desc">${o.descripcion || 'Plan completo para tu negocio'}</div>
          <ul>
            ${CARACTERISTICAS_DISPONIBLES.map(c => `
              <li class="${modulos.includes(c.id) ? '' : 'excluido'}">
                <i class="fas ${modulos.includes(c.id) ? 'fa-check-circle' : 'fa-times-circle'}" style="color:${modulos.includes(c.id) ? 'var(--success)' : 'var(--gray-300)'}"></i> ${c.label}
              </li>`).join('')}
          </ul>
          <button class="btn btn-primary" onclick="abrirAuth('register')"><i class="fas fa-rocket"></i> Empezar ahora</button>
        </div>`}).join('') : '<div class="text-center" style="grid-column:1/-1;padding:40px;color:rgba(255,255,255,0.5)"><h3>Proximamente</h3><p>Estamos preparando ofertas especiales para ti</p><button class="btn btn-primary mt-20" onclick="abrirAuth(\'register\')">Probar Gratis</button></div>';
    }
  } catch (err) { console.log('Landing data:', err.message); }
}

async function verificarToken() {
  try {
    const data = await request('/auth/verificar');
    USUARIO = data.usuario;
    return true;
  } catch { return false; }
}

function mostrarLogin() {
  mostrarLanding();
  abrirAuth('login');
}

function mostrarApp() {
  document.getElementById('landingPage').classList.remove('active');
  document.getElementById('appLayout').classList.add('active');
  document.getElementById('userName').textContent = USUARIO.nombre;
  document.getElementById('userRole').textContent = USUARIO.rol || USUARIO.tipo;
  document.getElementById('userAvatar').textContent = USUARIO.nombre.charAt(0).toUpperCase();
  document.getElementById('supportLink').href = SOPORTE_WA + '?text=Soporte%20TuTienda%20-%20' + encodeURIComponent(USUARIO.nombre);
  cargarSidebar();
  cargarConfig();
  verificarTrial();
}

function cerrarSesion() {
  Swal.fire({ title: 'Cerrar Sesion', text: 'Estas seguro?', icon: 'question', showCancelButton: true, confirmButtonText: 'Si, salir' }).then(r => {
    if (r.isConfirmed) { TOKEN = null; USUARIO = null; localStorage.removeItem('token'); document.getElementById('appLayout').classList.remove('active'); mostrarLanding(); }
  });
}

// ================ RELOJ BOGOTA ================
function iniciarReloj() {
  function actualizar() {
    const ahora = new Date();
    const opciones = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    document.getElementById('relojBogota').textContent = ahora.toLocaleTimeString('es-CO', opciones) + ' BOG';
  }
  actualizar();
  setInterval(actualizar, 1000);
}

// ================ SIDEBAR ================
function cargarSidebar() {
  const nav = document.getElementById('sidebarNav');
  const permisos = USUARIO.permisos || [];
  const esSuperAdmin = USUARIO.tipo === 'superadmin';
  const esCliente = USUARIO.tipo === 'cliente';
  const esEmpleado = USUARIO.tipo === 'empleado';
  const suscripcionModulos = USUARIO.suscripcion_modulos || [];
  const tienePermiso = (p) => permisos.includes('*') || permisos.includes(p);
  const modSuscripto = (mid) => esSuperAdmin || (suscripcionModulos && suscripcionModulos.includes(mid));

  const modulos = [
    { id: 'dashboard', icono: 'chart-pie', label: 'Dashboard', permiso: true },
    { id: 'inventario', icono: 'box', label: 'Inventario', permiso: modSuscripto('inventario') && (tienePermiso('inventario') || tienePermiso('inventario_ver')), seccion: 'Gestion' },
    { id: 'ventas', icono: 'shopping-cart', label: 'Ventas', permiso: modSuscripto('ventas') && (tienePermiso('ventas') || tienePermiso('ventas_ver')), seccion: 'Gestion' },
    { id: 'apertura', icono: 'cash-register', label: 'Apertura / Cierre', permiso: modSuscripto('apertura') && tienePermiso('apertura_cierre'), seccion: 'Gestion' },
    { id: 'empleados', icono: 'users', label: 'Empleados', permiso: modSuscripto('empleados') && tienePermiso('empleados'), seccion: 'Admin' },
    { id: 'proveedores', icono: 'truck', label: 'Proveedores', permiso: modSuscripto('proveedores') && tienePermiso('proveedores'), seccion: 'Admin' },
    { id: 'logs', icono: 'clipboard-list', label: 'Logs & Auditoria', permiso: modSuscripto('logs') && tienePermiso('logs'), seccion: 'Admin' },
    { id: 'config', icono: 'cog', label: 'Configuracion', permiso: modSuscripto('config') && tienePermiso('configuracion'), seccion: 'Admin' },
    { id: 'api', icono: 'plug', label: 'API Integracion', permiso: modSuscripto('api') && tienePermiso('api_integracion'), seccion: 'Desarrollo' },
  ];

  if (esSuperAdmin) {
    modulos.push({ id: 'superadmin', icono: 'crown', label: 'Super Admin', permiso: true, seccion: 'Admin' });
  }

  let html = '';
  let currentSection = '';
  modulos.forEach(m => {
    if (!m.permiso) return;
    if (m.seccion && m.seccion !== currentSection) {
      currentSection = m.seccion;
      html += `<div class="nav-section"><div class="nav-section-title">${currentSection}</div></div>`;
    }
    html += `<div class="nav-item ${m.id === currentModule ? 'active' : ''}" onclick="cargarModulo('${m.id}')">
      <span class="nav-icon"><i class="fas fa-${m.icono}"></i></span> ${m.label}
    </div>`;
  });
  nav.innerHTML = html;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (window.innerWidth <= 768) {
    const isOpen = sidebar.classList.toggle('open');
    if (backdrop) backdrop.style.display = isOpen ? 'block' : 'none';
  } else {
    sidebar.classList.toggle('collapsed');
    if (main) main.classList.toggle('expanded');
  }
}

async function cargarConfig() {
  try {
    const config = await request('/config');
    window._storeConfig = config;
    window.currentUser = window.currentUser || {};
    window.currentUser.storeName = config.tienda_nombre || '';
    if (config.tienda_nombre) {
      document.getElementById('sidebarStoreName').textContent = config.tienda_nombre;
      document.title = `${config.tienda_nombre} - TuTienda by ChrizDev`;
    }
    if (config.tienda_footer) {
      document.getElementById('appFooter').innerHTML = config.tienda_footer;
    }
  } catch {}
}

async function verificarTrial() {
  if (USUARIO.tipo !== 'cliente') return;
  const banner = document.getElementById('trialBanner');
  if (!banner) return;
  try {
    const session = await request('/auth/verificar');
    USUARIO = { ...USUARIO, ...session.usuario };
    const { tipo_cuenta, dias_restantes } = session.usuario;
    if (tipo_cuenta === 'pago' && dias_restantes > 0) {
      banner.style.display = 'none';
      return;
    }
    if (tipo_cuenta === 'trial' && dias_restantes > 0) {
      banner.style.display = 'flex';
      document.getElementById('trialText').textContent = dias_restantes <= 2
        ? `Tu periodo de prueba termina en ${dias_restantes} dia(s). Adquiere una licencia!`
        : `Periodo de prueba: ${dias_restantes} dias restantes`;
      const tb = document.querySelector('.trial-banner');
      if (dias_restantes <= 2) {
        tb.style.background = 'linear-gradient(135deg, var(--danger), #D63031)';
        tb.querySelector('p').style.color = 'white';
      } else {
        tb.style.background = '';
        tb.querySelector('p').style.color = '';
      }
    } else {
      banner.style.display = 'flex';
      document.getElementById('trialText').textContent = tipo_cuenta === 'expirado'
        ? 'Tu prueba ha expirado. Adquiere una licencia para continuar.'
        : 'Sin plan activo. Contacta al soporte.';
      
      Swal.fire({
        icon: 'warning',
        title: 'Periodo de prueba finalizado',
        text: 'Tu periodo de prueba o suscripción ha terminado. Por favor, selecciona un paquete de suscripción para seguir disfrutando del servicio.',
        confirmButtonText: 'Ver Planes y Precios',
        allowOutsideClick: false,
        allowEscapeKey: false
      }).then(() => {
        cerrarSesionExpirada();
      });
    }
  } catch {}
}

// ================ NAVEGACION DE MODULOS ================
async function cargarModulo(modulo, keepFilter = false) {
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('open');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (backdrop) backdrop.style.display = 'none';
  }
  if (!keepFilter) {
    window._invFilterType = null;
  }
  
  const titulos = { dashboard: 'Dashboard', inventario: 'Inventario', ventas: 'Ventas', empleados: 'Empleados & Roles', proveedores: 'Proveedores', apertura: 'Apertura / Cierre de Caja', logs: 'Logs & Auditoria', config: 'Configuracion', superadmin: 'Panel Super Admin', api: 'Integracion de APIs' };
  
  const permisos = USUARIO.permisos || [];
  const esSuperAdmin = USUARIO.tipo === 'superadmin';
  const suscripcionModulos = USUARIO.suscripcion_modulos || [];
  const tienePermiso = (p) => permisos.includes('*') || permisos.includes(p);
  const modSuscripto = (mid) => esSuperAdmin || (suscripcionModulos && suscripcionModulos.includes(mid));

  const moduloPermisos = {
    dashboard: true,
    superadmin: esSuperAdmin,
    inventario: modSuscripto('inventario') && (tienePermiso('inventario') || tienePermiso('inventario_ver')),
    ventas: modSuscripto('ventas') && (tienePermiso('ventas') || tienePermiso('ventas_ver')),
    apertura: modSuscripto('apertura') && tienePermiso('apertura_cierre'),
    empleados: modSuscripto('empleados') && tienePermiso('empleados'),
    proveedores: modSuscripto('proveedores') && tienePermiso('proveedores'),
    logs: modSuscripto('logs') && tienePermiso('logs'),
    config: modSuscripto('config') && tienePermiso('configuracion'),
    api: modSuscripto('api') && tienePermiso('api_integracion')
  };

  if (modulo !== 'dashboard' && !moduloPermisos[modulo]) {
    Swal.fire({
      icon: 'warning',
      title: 'Acceso Restringido',
      text: 'Tu plan contratado o tus permisos no incluyen el acceso al módulo de ' + (titulos[modulo] || modulo) + '.',
      confirmButtonText: 'Volver a Dashboard'
    }).then(() => {
      cargarModulo('dashboard');
    });
    return;
  }

  currentModule = modulo;
  document.querySelectorAll('.module-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[onclick*="'${modulo}'"]`)?.classList.add('active');

  document.getElementById('pageTitle').textContent = titulos[modulo] || modulo;

  const moduleMap = { dashboard:'moduleDashboard', inventario:'moduleInventario', ventas:'moduleVentas', empleados:'moduleEmpleados', proveedores:'moduleProveedores', apertura:'moduleApertura', logs:'moduleLogs', config:'moduleConfig', superadmin:'moduleSuperAdmin', api:'moduleApi' };
  document.getElementById(moduleMap[modulo] || `module${modulo.charAt(0).toUpperCase() + modulo.slice(1)}`).classList.add('active');

  switch (modulo) {
    case 'dashboard': renderDashboard(); break;
    case 'inventario': renderInventario(); break;
    case 'ventas': renderVentas(); break;
    case 'empleados': renderEmpleados(); break;
    case 'proveedores': renderProveedores(); break;
    case 'apertura': renderApertura(); break;
    case 'logs': renderLogs(); break;
    case 'config': renderConfig(); break;
    case 'superadmin': renderSuperAdmin(); break;
    case 'api': renderApi(); break;
  }
}

// ================ MODAL ================
function abrirModal(titulo, bodyHTML, footerHTML = '', modalClass = '') {
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modalFooter').innerHTML = footerHTML;
  const modal = document.getElementById('modalContent');
  modal.className = 'modal' + (modalClass ? ' ' + modalClass : '');
  document.getElementById('modalOverlay').classList.add('active');
}
function cerrarModal() { document.getElementById('modalOverlay').classList.remove('active'); }
document.getElementById('modalOverlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) cerrarModal(); });
document.getElementById('modalContent')?.addEventListener('touchstart', e => e.stopPropagation());

// ================ DASHBOARD ================
let chartInstances = {};

async function renderDashboard() {
  const container = document.getElementById('moduleDashboard');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando dashboard...</p></div>';
  try {
    const data = await request('/dashboard');
    actualizarNotificaciones(data);

    const formatPeso = n => '$' + Number(n).toLocaleString('es-CO');
    const formatNum = n => Number(n).toLocaleString('es-CO');

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card animate-slideInUp stagger-1" onclick="window._invFilterType = ${data.productosBajoStock > 0 ? "'bajo_stock'" : 'null'}; cargarModulo('inventario', true)">
          <div class="stat-icon" style="background:rgba(108,92,231,0.1);color:var(--primary)"><i class="fas fa-box"></i></div>
          <div class="stat-value">${formatNum(data.totalProductos)}</div>
          <div class="stat-label">Productos</div>
          ${data.productosBajoStock > 0 ? `<div class="stat-change down"><i class="fas fa-exclamation-triangle"></i> ${data.productosBajoStock} bajo stock</div>` : ''}
        </div>
        <div class="stat-card animate-slideInUp stagger-2" onclick="cargarModulo('ventas')">
          <div class="stat-icon" style="background:rgba(0,206,201,0.1);color:var(--secondary)"><i class="fas fa-shopping-cart"></i></div>
          <div class="stat-value">${formatNum(data.ventasHoy.total)}</div>
          <div class="stat-label">Ventas Hoy</div>
          <div class="stat-change up"><i class="fas fa-arrow-up"></i> ${formatPeso(data.ventasHoy.ingresos)}</div>
        </div>
        <div class="stat-card animate-slideInUp stagger-3" onclick="cargarModulo('ventas')">
          <div class="stat-icon" style="background:rgba(253,203,110,0.2);color:#B7950B"><i class="fas fa-chart-line"></i></div>
          <div class="stat-value">${formatPeso(data.ingresoTotal)}</div>
          <div class="stat-label">Ingresos Totales</div>
          <div class="stat-change ${data.margenGanancia > 0 ? 'up' : 'down'}"><i class="fas fa-percentage"></i> ${data.margenGanancia}% margen</div>
        </div>
        <div class="stat-card animate-slideInUp stagger-4" onclick="window._invFilterType = ${data.productosPorVencer > 0 ? "'por_vencer'" : 'null'}; cargarModulo('inventario', true)">
          <div class="stat-icon" style="background:rgba(225,112,85,0.1);color:var(--danger)"><i class="fas fa-clock"></i></div>
          <div class="stat-value">${data.productosPorVencer}</div>
          <div class="stat-label">Por Vencer (30 dias)</div>
          ${data.productosSinStock > 0 ? `<div class="stat-change down"><i class="fas fa-times-circle"></i> ${data.productosSinStock} sin stock</div>` : ''}
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-chart-bar" style="color:var(--primary)"></i> Ventas Ultimos 7 Dias</h3></div>
          <div class="card-body"><div class="chart-container"><canvas id="chartVentas"></canvas></div></div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-fire" style="color:var(--danger)"></i> Productos Mas Vendidos</h3></div>
          <div class="card-body" style="max-height:300px;overflow-y:auto">
            ${data.productosMasVendidos.length ? data.productosMasVendidos.map((p,i) => `
              <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-200)">
                <span style="font-weight:800;color:var(--primary);width:24px">#${i+1}</span>
                <div style="flex:1"><strong>${p.nombre}</strong><br><small class="text-muted">${formatNum(p.total_vendido)} vendidos - ${formatPeso(p.total_ingresos)}</small></div>
                <span class="status-badge ${p.stock <= 5 ? 'danger' : 'success'}">Stock: ${p.stock}</span>
              </div>
            `).join('') : '<div class="text-center text-muted" style="padding:30px">Aun no hay ventas registradas</div>'}
          </div>
        </div>
      </div>

      <div class="dashboard-grid-3">
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i> Productos por Agotarse</h3></div>
          <div class="card-body">
            ${data.productosAgotarse.length ? data.productosAgotarse.map(p => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-200)">
                <div style="flex:1"><strong>${p.nombre}</strong><br><small class="text-muted">Stock: ${p.stock} / Min: ${p.stock_minimo}</small></div>
                <span class="status-badge danger">${p.stock} uds</span>
              </div>
            `).join('') : '<div class="text-center text-muted" style="padding:20px">Todo en stock optimo</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-calendar-times" style="color:var(--danger)"></i> Proximos a Vencer</h3></div>
          <div class="card-body">
            ${data.productosVencimiento.length ? data.productosVencimiento.map(p => `
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-200)">
                <div style="flex:1"><strong>${p.nombre}</strong><br><small class="text-muted">Vence: ${p.fecha_vencimiento}</small></div>
                <span class="status-badge ${p.dias_restantes <= 7 ? 'danger' : 'warning'}">${p.dias_restantes} dias</span>
              </div>
            `).join('') : '<div class="text-center text-muted" style="padding:20px">Sin productos por vencer</div>'}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3><i class="fas fa-truck" style="color:var(--secondary)"></i> Proveedores</h3></div>
          <div class="card-body">
            <div style="font-size:32px;font-weight:800;color:var(--primary)">${formatNum(data.totalProveedores)}</div>
            <div class="text-muted">Proveedores registrados</div>
            <hr style="margin:15px 0;border-color:var(--gray-200)">
            <div><strong>Empleados activos:</strong> ${formatNum(data.totalEmpleados)}</div>
          </div>
        </div>
      </div>
    `;

    // Chart
    setTimeout(() => {
      const ctx = document.getElementById('chartVentas');
      if (ctx && data.ventasUltimos7.length) {
        if (chartInstances.ventas) chartInstances.ventas.destroy();
        chartInstances.ventas = new Chart(ctx, {
          type: 'line', data: {
            labels: data.ventasUltimos7.map(v => v.fecha?.split(' ')[0]?.substring(5) || ''),
            datasets: [
              { label: 'Ingresos', data: data.ventasUltimos7.map(v => v.ingresos), borderColor: '#6C5CE7', backgroundColor: 'rgba(108,92,231,0.1)', fill: true, tension: 0.4 },
              { label: 'Ventas', data: data.ventasUltimos7.map(v => v.total_ventas), borderColor: '#00CEC9', backgroundColor: 'rgba(0,206,201,0.1)', fill: true, tension: 0.4, yAxisID: 'y1' }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } } } }
        });
      }
    }, 100);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-exclamation-circle"></i></div><h3>Error al cargar</h3><p>${err.message}</p></div>`;
  }
}

// ================ INVENTARIO ================
async function renderInventario() {
  const container = document.getElementById('moduleInventario');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando inventario...</p></div>';
  try {
    const [productos, categorias, proveedores] = await Promise.all([
      request('/inventario'), request('/categorias'), request('/proveedores')
    ]);
    window._invProductos = productos;
    window._invCategorias = categorias;
    window._invProveedores = proveedores;

    if (!window._activeInventarioTab) window._activeInventarioTab = 'productos';

    renderInventarioTabsStructure();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function renderInventarioTabsStructure() {
  const container = document.getElementById('moduleInventario');
  const activeTab = window._activeInventarioTab;
  
  container.innerHTML = `
    <div class="auth-tabs" style="margin-bottom: 20px; display: flex; gap: 4px; background: rgba(0,0,0,0.05); padding: 4px; border-radius: var(--radius-md);">
      <button class="auth-tab ${activeTab === 'productos' ? 'active' : ''}" style="flex:1" onclick="cambiarTabInventario('productos')">
        <i class="fas fa-box"></i> Productos
      </button>
      <button class="auth-tab ${activeTab === 'devoluciones' ? 'active' : ''}" style="flex:1" onclick="cambiarTabInventario('devoluciones')">
        <i class="fas fa-undo"></i> Devoluciones Proveedor
      </button>
      <button class="auth-tab ${activeTab === 'calendario' ? 'active' : ''}" style="flex:1" onclick="cambiarTabInventario('calendario')">
        <i class="fas fa-calendar-alt"></i> Calendario de Visitas
      </button>
    </div>
    <div id="inventarioSubView"></div>
  `;

  if (activeTab === 'productos') {
    renderTabProductos();
  } else if (activeTab === 'devoluciones') {
    renderTabDevoluciones();
  } else if (activeTab === 'calendario') {
    renderTabCalendario();
  }
}

function cambiarTabInventario(tab) {
  window._activeInventarioTab = tab;
  renderInventarioTabsStructure();
}

function renderTabProductos() {
  const subView = document.getElementById('inventarioSubView');
  const categorias = window._invCategorias || [];
  const proveedores = window._invProveedores || [];
  
  subView.innerHTML = `
    <div class="search-bar" style="margin-bottom:16px">
      <input type="text" id="searchInventario" placeholder="Buscar producto..." oninput="filtrarInventario()">
      <select id="filtroCategoria" onchange="filtrarInventario()"><option value="">Todas las categorias</option>
        ${categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
      </select>
      <select id="filtroProveedor" onchange="filtrarInventario()"><option value="">Todos los proveedores</option>
        ${proveedores.map(p => `<option value="${p.id}">${p.nombre_empresa}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="mostrarFormProducto()"><i class="fas fa-plus"></i> Producto</button>
      <button class="btn btn-secondary" onclick="mostrarFormCategoria()"><i class="fas fa-tag"></i> Categoria</button>
    </div>
    <div class="card animate-fadeIn">
      <div class="card-body" style="padding:0">
        <div class="table-container">
          <table>
            <thead><tr>
              <th>Codigo</th><th>Producto</th><th>Categoria</th><th>Proveedor</th><th>P. Compra</th><th>P. Venta</th><th>Stock</th><th>Min</th><th>Vencimiento</th><th>Acciones</th>
            </tr></thead>
            <tbody id="tablaInventario"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  filtrarInventario();
}

async function renderTabDevoluciones() {
  const subView = document.getElementById('inventarioSubView');
  subView.innerHTML = '<div class="text-center" style="padding:30px;"><div class="loader-ripple"><div></div><div></div></div><p>Cargando devoluciones...</p></div>';
  try {
    const devoluciones = await request('/inventario/devoluciones');
    subView.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary" onclick="mostrarFormDevolucion()"><i class="fas fa-plus"></i> Registrar Devolución</button>
      </div>
      <div class="card animate-fadeIn">
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Producto</th><th>Proveedor</th><th>Cantidad</th><th>Precio Compra</th><th>Total</th><th>Motivo</th><th>Estado</th><th>Acciones</th>
              </tr></thead>
              <tbody>${devoluciones.length ? devoluciones.map(d => `<tr>
                <td>${d.created_at}</td>
                <td><strong>${d.producto_nombre}</strong><br><small class="text-muted">${d.codigo_barras || ''}</small></td>
                <td>${d.proveedor_nombre}</td>
                <td><strong>${d.cantidad}</strong></td>
                <td>$${Number(d.precio_compra).toLocaleString('es-CO')}</td>
                <td><strong>$${Number(d.cantidad * d.precio_compra).toLocaleString('es-CO')}</strong></td>
                <td><span style="font-size:11px;background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px">${d.motivo}</span></td>
                <td><span class="status-badge ${d.estado === 'pendiente' ? 'warning' : 'success'}">${d.estado}</span></td>
                <td>
                  ${d.estado === 'pendiente' ? `
                    <button class="btn btn-sm btn-success" onclick="completarDevolucion(${d.id})" title="Marcar como Devuelto"><i class="fas fa-check"></i> Completar</button>
                  ` : '-'}
                </td>
              </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted" style="padding:40px">No hay devoluciones registradas</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    subView.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function mostrarFormDevolucion() {
  const productos = window._invProductos || [];
  const proveedores = window._invProveedores || [];
  
  abrirModal('Registrar Devolución a Proveedor', `
    <form id="formDevolucion">
      <div class="form-group"><label>Producto *</label>
        <select id="devProductoId" onchange="actualizarStockDisponibleDevolucion(this.value)" required>
          <option value="">Seleccione un producto...</option>
          ${productos.map(p => `<option value="${p.id}">${p.nombre} (Stock: ${p.stock})</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Stock Disponible para Devolución</label>
        <input type="text" id="devStockDisp" readonly class="form-control" style="background:#f1f2f6" value="-">
      </div>
      <div class="form-group"><label>Proveedor *</label>
        <select id="devProveedorId" required>
          <option value="">Seleccione un proveedor...</option>
          ${proveedores.map(p => `<option value="${p.id}">${p.nombre_empresa}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Cantidad a Devolver *</label>
        <input type="number" id="devCantidad" min="1" required>
      </div>
      <div class="form-group"><label>Motivo de Devolución *</label>
        <input type="text" id="devMotivo" placeholder="Ej. Producto defectuoso, próximo a vencer..." required maxlength="200">
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarDevolucion()"><i class="fas fa-check"></i> Registrar</button>`);
}

function actualizarStockDisponibleDevolucion(prodId) {
  const prod = (window._invProductos || []).find(p => p.id == prodId);
  const input = document.getElementById('devStockDisp');
  const provSelect = document.getElementById('devProveedorId');
  if (prod) {
    input.value = prod.stock;
    if (prod.proveedor_id) {
      provSelect.value = prod.proveedor_id;
    }
  } else {
    input.value = '-';
  }
}

async function guardarDevolucion() {
  const producto_id = document.getElementById('devProductoId').value;
  const proveedor_id = document.getElementById('devProveedorId').value;
  const cantidad = parseInt(document.getElementById('devCantidad').value);
  const motivo = document.getElementById('devMotivo').value.trim();

  if (!producto_id || !proveedor_id || !cantidad || !motivo) {
    return Swal.fire({ icon: 'error', title: 'Campos requeridos', text: 'Por favor completa todos los campos obligatorios.' });
  }

  const prod = (window._invProductos || []).find(p => p.id == producto_id);
  if (!prod) return;
  if (cantidad > prod.stock) {
    return Swal.fire({ icon: 'error', title: 'Stock insuficiente', text: `No puedes devolver más de lo disponible (${prod.stock}).` });
  }

  try {
    await request('/inventario/devoluciones', {
      method: 'POST',
      body: JSON.stringify({ producto_id, proveedor_id, cantidad, motivo })
    });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Devolución registrada', timer: 1500, showConfirmButton: false });
    const updatedProductos = await request('/inventario');
    window._invProductos = updatedProductos;
    renderTabDevoluciones();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function completarDevolucion(id) {
  const result = await Swal.fire({
    title: '¿Confirmar devolución?',
    text: '¿Confirmas que el proveedor recibió la mercancía y la devolución ha sido completada?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#00cec9',
    confirmButtonText: 'Sí, Completar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;
  try {
    await request(`/inventario/devoluciones/${id}/estado`, {
      method: 'PUT',
      body: JSON.stringify({ estado: 'devuelto' })
    });
    Swal.fire({ icon: 'success', title: 'Devolución completada', timer: 1500, showConfirmButton: false });
    renderTabDevoluciones();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function renderTabCalendario() {
  const subView = document.getElementById('inventarioSubView');
  subView.innerHTML = '<div class="text-center" style="padding:30px;"><div class="loader-ripple"><div></div><div></div></div><p>Cargando agenda de visitas...</p></div>';
  try {
    const [visitas, devoluciones] = await Promise.all([
      request('/inventario/proveedores/visitas'),
      request('/inventario/devoluciones')
    ]);
    
    window._cachedVisitas = visitas;
    window._cachedDevoluciones = devoluciones;
    const proveedores = window._invProveedores || [];

    if (window._currentCalendarMonth === undefined) {
      const d = new Date();
      window._currentCalendarMonth = d.getMonth();
      window._currentCalendarYear = d.getFullYear();
    }

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const tempDate = new Date(window._currentCalendarYear, window._currentCalendarMonth, 1);
    
    let startDayOffset = tempDate.getDay() - 1; 
    if (startDayOffset < 0) startDayOffset = 6; 
    
    const totalDays = new Date(window._currentCalendarYear, window._currentCalendarMonth + 1, 0).getDate();

    // Recordatorios de visitas
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }); // YYYY-MM-DD
    const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });

    const visitsToday = visitas.filter(v => v.fecha_visita === todayStr);
    const visitsTomorrow = visitas.filter(v => v.fecha_visita === tomorrowStr);
    
    let reminderHtml = '';
    if (visitsToday.length > 0) {
      reminderHtml += `
        <div style="background:rgba(225,112,85,0.15);border:1px solid var(--danger);border-radius:10px;padding:12px;margin-bottom:15px;font-size:13px;color:var(--danger)">
          <i class="fas fa-exclamation-triangle" style="margin-right:8px"></i>
          <strong>¡Recordatorio para HOY!</strong> Tienes programada(s) ${visitsToday.length} visita(s): 
          ${visitsToday.map(v => `<strong>${v.proveedor_nombre}</strong>`).join(', ')}.
        </div>
      `;
    }
    if (visitsTomorrow.length > 0) {
      reminderHtml += `
        <div style="background:rgba(253,203,110,0.15);border:1px solid var(--warning);border-radius:10px;padding:12px;margin-bottom:15px;font-size:13px;color:var(--dark)">
          <i class="fas fa-bell" style="margin-right:8px;color:var(--warning)"></i>
          <strong>¡Recordatorio para Mañana!</strong> Visita programada de: 
          ${visitsTomorrow.map(v => `<strong>${v.proveedor_nombre}</strong>`).join(', ')}.
        </div>
      `;
    }
    if (visitsToday.length === 0 && visitsTomorrow.length === 0) {
      reminderHtml = `
        <div style="background:rgba(0,184,148,0.1);border:1px solid var(--success);border-radius:10px;padding:12px;margin-bottom:15px;font-size:13px;color:var(--success)">
          <i class="fas fa-check-circle" style="margin-right:8px"></i> No hay visitas programadas para hoy ni mañana.
        </div>
      `;
    }

    subView.innerHTML = `
      <div class="row" style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="flex:1.2;min-width:320px">
          <!-- RECORDATORIOS -->
          ${reminderHtml}

          <!-- CALENDARIO -->
          <div class="card" style="margin-bottom:20px">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
                <h4 style="margin:0;font-size:16px"><i class="fas fa-calendar-alt" style="color:var(--primary)"></i> Calendario de Visitas</h4>
                <div style="display:flex;gap:5px;align-items:center">
                  <button class="btn btn-sm btn-outline" onclick="cambiarMesCalendario(-1)" style="padding:4px 8px;border-color:var(--gray-200)"><i class="fas fa-chevron-left"></i></button>
                  <strong style="font-size:14px;min-width:110px;text-align:center">${monthNames[window._currentCalendarMonth]} ${window._currentCalendarYear}</strong>
                  <button class="btn btn-sm btn-outline" onclick="cambiarMesCalendario(1)" style="padding:4px 8px;border-color:var(--gray-200)"><i class="fas fa-chevron-right"></i></button>
                </div>
              </div>

              <div class="calendar-grid" style="display:grid;grid-template-columns:repeat(7, 1fr);gap:6px;text-align:center;font-size:12px">
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Lu</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Ma</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Mi</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Ju</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Vi</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Sá</div>
                <div style="font-weight:700;color:var(--gray-300);padding:5px 0">Do</div>
                
                ${Array(startDayOffset).fill(0).map(() => `<div style="padding:12px 0;opacity:0.25;color:var(--gray-300)">-</div>`).join('')}
                
                ${Array(totalDays).fill(0).map((_, i) => {
                  const dayNum = i + 1;
                  const dateStr = `${window._currentCalendarYear}-${String(window._currentCalendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayVisits = visitas.filter(v => v.fecha_visita === dateStr);
                  const isToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' }) === dateStr;
                  
                  let cellBg = 'transparent';
                  let border = '1px solid var(--gray-200)';
                  let color = 'inherit';
                  if (isToday) {
                    cellBg = 'rgba(0, 206, 201, 0.1)';
                    border = '2px solid var(--secondary)';
                  }
                  if (dayVisits.length > 0) {
                    cellBg = 'rgba(108, 92, 231, 0.05)';
                    border = isToday ? '2px solid var(--secondary)' : '1px solid var(--primary)';
                  }
                  
                  return `
                    <div onclick="seleccionarFechaCalendario('${dateStr}')" style="cursor:pointer;border-radius:8px;padding:10px 0;background:${cellBg};border:${border};color:${color};position:relative;transition:all 0.2s" class="calendar-day-cell" title="${dayVisits.length} visita(s)">
                      <strong>${dayNum}</strong>
                      ${dayVisits.length > 0 ? `
                        <div style="display:flex;justify-content:center;gap:2px;margin-top:2px">
                          ${dayVisits.map(() => `<div style="width:5px;height:5px;border-radius:50%;background:var(--primary)"></div>`).join('')}
                        </div>
                      ` : '<div style="height:7px"></div>'}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>

        <div style="flex:1;min-width:300px">
          <!-- FORMULARIO DE AGENDAMIENTO -->
          <div class="card" style="margin-bottom:20px">
            <div class="card-body">
              <h4 style="margin-top:0;margin-bottom:15px"><i class="fas fa-calendar-plus" style="color:var(--primary)"></i> Agendar Visita de Proveedor</h4>
              <form id="formAgendarVisita" onsubmit="event.preventDefault(); guardarVisitaProveedor();">
                <div class="form-group"><label>Proveedor *</label>
                  <select id="visitaProveedorId" required>
                    <option value="">Seleccione un proveedor...</option>
                    ${proveedores.map(p => `<option value="${p.id}">${p.nombre_empresa}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group"><label>Fecha de Visita *</label>
                  <input type="date" id="visitaFecha" required min="${new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' })}">
                </div>
                <div class="form-group"><label>Notas / Pedido Estimado</label>
                  <textarea id="visitaNotas" placeholder="Escribe notas sobre productos requeridos, condiciones..." style="height:60px;width:100%;padding:10px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-family:inherit;outline:none"></textarea>
                </div>
                <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-save"></i> Agendar Visita</button>
              </form>
            </div>
          </div>

          <!-- DETALLES DE VISITA -->
          <div id="visitaDetallePanel">
            <div class="card" style="height:100%;min-height:200px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--gray-200);background:rgba(0,0,0,0.02)">
              <div class="text-center" style="padding:20px;color:var(--gray-300)">
                <i class="fas fa-info-circle" style="font-size:32px;margin-bottom:10px"></i>
                <p>Selecciona una fecha en el calendario para ver las visitas programadas o programar una nueva.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const todaySelect = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
    if (visitas.some(v => v.fecha_visita === todaySelect)) {
      seleccionarFechaCalendario(todaySelect);
    }
  } catch (err) {
    subView.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function cambiarMesCalendario(offset) {
  window._currentCalendarMonth += offset;
  if (window._currentCalendarMonth < 0) {
    window._currentCalendarMonth = 11;
    window._currentCalendarYear -= 1;
  } else if (window._currentCalendarMonth > 11) {
    window._currentCalendarMonth = 0;
    window._currentCalendarYear += 1;
  }
  renderTabCalendario();
}

function seleccionarFechaCalendario(dateStr) {
  const input = document.getElementById('visitaFecha');
  if (input) {
    input.value = dateStr;
  }
  
  document.querySelectorAll('.calendar-day-cell').forEach(c => {
    c.style.boxShadow = 'none';
  });
  const cells = document.querySelectorAll('.calendar-day-cell');
  cells.forEach(c => {
    if (c.getAttribute('onclick')?.includes(dateStr)) {
      c.style.boxShadow = '0 0 0 2px var(--primary)';
    }
  });

  const panel = document.getElementById('visitaDetallePanel');
  const visitas = window._cachedVisitas || [];
  const dayVisits = visitas.filter(v => v.fecha_visita === dateStr);
  
  if (dayVisits.length > 0) {
    panel.innerHTML = `
      <div class="card animate-fadeIn" style="margin-top:10px">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 15px">
          <h4 style="margin:0;font-size:15px">Visitas del ${dateStr}</h4>
          <span class="status-badge info" style="font-size:11px">${dayVisits.length} visita(s)</span>
        </div>
        <div class="card-body" style="padding:15px">
          <div style="display:flex;flex-direction:column;gap:12px">
            ${dayVisits.map(v => `
              <div style="padding:12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);background:rgba(0,0,0,0.01);position:relative">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <strong style="color:var(--primary);font-size:14px">${v.proveedor_nombre}</strong>
                  <button class="btn btn-sm btn-danger" onclick="eliminarVisitaProveedor(${v.id})" style="padding:4px 8px" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
                <p style="margin:2px 0;font-size:12px"><strong>Contacto:</strong> ${v.contacto_nombre || 'N/A'} (${v.contacto_telefono || 'N/A'})</p>
                <p style="margin:6px 0 0 0;font-size:12px;background:rgba(108,92,231,0.04);padding:8px;border-radius:6px;color:var(--gray-700)">
                  <i class="fas fa-sticky-note" style="margin-right:6px"></i>${v.notas || 'Sin notas.'}
                </p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="card animate-fadeIn" style="height:100%;min-height:180px;display:flex;align-items:center;justify-content:center;border:2px dashed var(--gray-200);background:rgba(0,0,0,0.02)">
        <div class="text-center" style="padding:20px;color:var(--gray-300)">
          <i class="fas fa-calendar-plus" style="font-size:32px;margin-bottom:10px"></i>
          <p style="font-size:13px">No hay visitas agendadas para el <strong>${dateStr}</strong>.</p>
          <p style="font-size:11px;margin-top:4px">Puedes agendar una visita usando el formulario superior.</p>
        </div>
      </div>
    `;
  }
}

window.cambiarMesCalendario = cambiarMesCalendario;
window.seleccionarFechaCalendario = seleccionarFechaCalendario;

async function guardarVisitaProveedor() {
  const proveedor_id = document.getElementById('visitaProveedorId').value;
  const fecha_visita = document.getElementById('visitaFecha').value;
  const notas = document.getElementById('visitaNotas').value.trim();

  try {
    await request('/inventario/proveedores/visitas', {
      method: 'POST',
      body: JSON.stringify({ proveedor_id, fecha_visita, notas })
    });
    Swal.fire({ icon: 'success', title: 'Visita agendada', timer: 1500, showConfirmButton: false });
    renderTabCalendario();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

async function eliminarVisitaProveedor(id) {
  const result = await Swal.fire({
    title: '¿Eliminar visita?',
    text: '¿Estás seguro de que deseas cancelar y eliminar esta visita agendada?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;
  try {
    await request(`/inventario/proveedores/visitas/${id}`, { method: 'DELETE' });
    Swal.fire({ icon: 'success', title: 'Visita eliminada', timer: 1500, showConfirmButton: false });
    renderTabCalendario();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

function seleccionarVisita(id) {
  document.querySelectorAll('[id^="rowVisita_"]').forEach(r => r.style.background = '');
  const activeRow = document.getElementById(`rowVisita_${id}`);
  if (activeRow) activeRow.style.background = 'rgba(108,92,231,0.08)';

  const visit = (window._cachedVisitas || []).find(v => v.id === id);
  if (!visit) return;

  const productos = window._invProductos || [];
  const devoluciones = window._cachedDevoluciones || [];

  const bajoStock = productos.filter(p => p.proveedor_id === visit.proveedor_id && p.stock <= p.stock_minimo);
  const devPendientes = devoluciones.filter(d => d.proveedor_id === visit.proveedor_id && d.estado === 'pendiente');

  const detailPanel = document.getElementById('visitaDetallePanel');
  detailPanel.innerHTML = `
    <div class="card animate-fadeIn" style="border: 1px solid var(--primary);">
      <div class="card-body">
        <h3 style="margin-top:0;color:var(--primary);border-bottom:2px solid var(--gray-100);padding-bottom:10px">
          <i class="fas fa-truck"></i> ${visit.proveedor_nombre}
        </h3>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px;background:rgba(0,0,0,0.02);padding:10px;border-radius:8px">
          <div>
            <strong>Contacto:</strong><br>
            <span>${visit.contacto_nombre || 'No registrado'}</span>
          </div>
          <div>
            <strong>Teléfono:</strong><br>
            <span>${visit.contacto_telefono ? `<a href="tel:${visit.contacto_telefono}" class="text-primary">${visit.contacto_telefono}</a>` : 'No registrado'}</span>
          </div>
          <div style="grid-column: span 2">
            <strong>Fecha de Visita:</strong><br>
            <span><i class="fas fa-calendar-alt"></i> ${visit.fecha_visita}</span>
          </div>
        </div>

        <div style="margin-bottom:20px">
          <h4 style="margin:0 0 10px 0;display:flex;justify-content:between;align-items:center">
            <span><i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i> Productos Bajo Stock (${bajoStock.length})</span>
          </h4>
          ${bajoStock.length ? `
            <div style="max-height:120px;overflow-y:auto;border:1px solid var(--gray-100);border-radius:6px">
              <table style="font-size:12px;margin:0">
                <thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th></tr></thead>
                <tbody>${bajoStock.map(p => `
                  <tr>
                    <td><strong>${p.nombre}</strong></td>
                    <td><span class="status-badge danger">${p.stock}</span></td>
                    <td>${p.stock_minimo}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
          ` : '<p class="text-success" style="font-size:13px;margin:0"><i class="fas fa-check-circle"></i> Todos los productos tienen stock saludable.</p>'}
        </div>

        <div style="margin-bottom:20px">
          <h4 style="margin:0 0 10px 0;display:flex;justify-content:between;align-items:center">
            <span><i class="fas fa-undo" style="color:var(--danger)"></i> Devoluciones Pendientes (${devPendientes.length})</span>
          </h4>
          ${devPendientes.length ? `
            <div style="max-height:120px;overflow-y:auto;border:1px solid var(--gray-100);border-radius:6px">
              <table style="font-size:12px;margin:0">
                <thead><tr><th>Producto</th><th>Cant.</th><th>Motivo</th></tr></thead>
                <tbody>${devPendientes.map(d => `
                  <tr>
                    <td><strong>${d.producto_nombre}</strong></td>
                    <td><strong>${d.cantidad}</strong></td>
                    <td><small>${d.motivo}</small></td>
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
          ` : '<p class="text-muted" style="font-size:13px;margin:0">No hay devoluciones pendientes.</p>'}
        </div>

        <div style="background:#fffcf0;border-left:4px solid #f1c40f;padding:12px;border-radius:4px">
          <h4 style="margin:0 0 6px 0;color:#b7950b"><i class="fas fa-sticky-note"></i> Notas de la Visita</h4>
          <p style="margin:0;font-size:13px;white-space:pre-wrap">${visit.notas || 'Sin notas registradas.'}</p>
        </div>
      </div>
    </div>
  `;
}

function filtrarInventario() {
  const busqueda = (document.getElementById('searchInventario')?.value || '').toLowerCase();
  const catId = document.getElementById('filtroCategoria')?.value;
  const provId = document.getElementById('filtroProveedor')?.value;
  const productos = window._invProductos || [];

  const filterType = window._invFilterType;
  const searchBar = document.querySelector('#moduleInventario .search-bar');
  let filterAlert = document.getElementById('invFilterAlert');

  if (filterType && searchBar) {
    if (!filterAlert) {
      filterAlert = document.createElement('div');
      filterAlert.id = 'invFilterAlert';
      filterAlert.style.cssText = 'background:rgba(108,92,231,0.08);border:1px solid rgba(108,92,231,0.2);padding:10px 15px;border-radius:var(--radius-sm);margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;font-size:14px;width:100%';
      searchBar.parentNode.insertBefore(filterAlert, searchBar.nextSibling);
    }
    const label = filterType === 'bajo_stock' ? 'Bajo Stock' : 'Próximos a Vencer (30 días)';
    filterAlert.innerHTML = `
      <span><i class="fas fa-filter" style="color:var(--primary);margin-right:6px"></i> Mostrando solo productos con: <strong>${label}</strong></span>
      <button class="btn btn-sm btn-outline" style="padding:4px 10px;font-size:12px" onclick="limpiarFiltroInventario()"><i class="fas fa-times"></i> Quitar filtro</button>
    `;
  } else {
    if (filterAlert) filterAlert.remove();
  }

  const filtrados = productos.filter(p => {
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda) && !(p.codigo_barras || '').toLowerCase().includes(busqueda)) return false;
    if (catId && p.categoria_id != catId) return false;
    if (provId && p.proveedor_id != provId) return false;
    if (filterType === 'bajo_stock' && p.stock > p.stock_minimo) return false;
    if (filterType === 'por_vencer') {
      if (!p.fecha_vencimiento) return false;
      const diff = (new Date(p.fecha_vencimiento + 'T23:59:59') - new Date()) / 86400000;
      if (diff > 30 || diff < 0) return false;
    }
    return true;
  });

  document.getElementById('tablaInventario').innerHTML = filtrados.length ? filtrados.map(p => {
    const stockClass = p.stock === 0 ? 'danger' : p.stock <= p.stock_minimo ? 'warning' : 'success';
    const vencer = p.fecha_vencimiento ? new Date(p.fecha_vencimiento + 'T23:59:59') : null;
    const vencerClass = vencer && (vencer - new Date()) / 86400000 <= 30 ? 'danger' : '';
    return `<tr>
      <td><code>${p.codigo_barras || '-'}</code></td>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.categoria_nombre || '-'}</td>
      <td>${p.proveedor_nombre || '-'}</td>
      <td>$${Number(p.precio_compra).toLocaleString('es-CO')}</td>
      <td><strong>$${Number(p.precio_venta).toLocaleString('es-CO')}</strong></td>
      <td><span class="status-badge ${stockClass}">${p.stock}</span></td>
      <td>${p.stock_minimo}</td>
      <td class="${vencerClass}" style="font-weight:${vencerClass ? '700' : '400'}">${p.fecha_vencimiento || '-'}</td>
      <td>
        <button class="btn btn-sm btn-info" onclick="mostrarMovimientos(${p.id})" title="Movimientos"><i class="fas fa-history"></i></button>
        <button class="btn btn-sm btn-primary" onclick="mostrarFormProducto(${p.id})" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-warning" onclick="mostrarAjusteStock(${p.id})" title="Ajustar Stock"><i class="fas fa-balance-scale"></i></button>
        <button class="btn btn-sm btn-danger" onclick="eliminarProducto(${p.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="text-center text-muted" style="padding:30px">Sin productos que coincidan</td></tr>';
}

function limpiarFiltroInventario() {
  window._invFilterType = null;
  filtrarInventario();
}

function mostrarFormProducto(id = null) {
  const producto = id ? (window._invProductos || []).find(p => p.id === id) : null;
  const cats = window._invCategorias || [];
  const provs = window._invProveedores || [];
  abrirModal(producto ? 'Editar Producto' : 'Nuevo Producto', `
    <form id="formProducto">
      <div class="form-row">
        <div class="form-group"><label>Nombre *</label><input type="text" id="prodNombre" value="${producto?.nombre || ''}" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="100"></div>
        <div class="form-group">
          <label>Codigo Barras</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="prodCodigo" value="${producto?.codigo_barras || ''}">
            <button type="button" class="btn btn-secondary" onclick="escanearCodigo(code => { document.getElementById('prodCodigo').value = code; cerrarEscanner(); })" style="padding:0 12px;height:42px;display:flex;align-items:center;justify-content:center" title="Escanear con cámara"><i class="fas fa-camera"></i></button>
          </div>
        </div>
      </div>
      <div class="form-group"><label>Descripcion</label><textarea id="prodDescripcion">${producto?.descripcion || ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Categoria</label><select id="prodCategoria"><option value="">Sin categoria</option>${cats.map(c => `<option value="${c.id}" ${producto?.categoria_id == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select></div>
        <div class="form-group"><label>Proveedor</label><select id="prodProveedor"><option value="">Sin proveedor</option>${provs.map(p => `<option value="${p.id}" ${producto?.proveedor_id == p.id ? 'selected' : ''}>${p.nombre_empresa}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Precio Compra</label><input type="number" step="0.01" id="prodPCompra" value="${producto?.precio_compra || 0}"></div>
        <div class="form-group"><label>Precio Venta</label><input type="number" step="0.01" id="prodPVenta" value="${producto?.precio_venta || 0}"></div>
      </div>
      <div class="form-row-3">
        <div class="form-group"><label>Stock Inicial</label><input type="number" id="prodStock" value="${producto?.stock || 0}" ${producto ? 'readonly' : ''}></div>
        <div class="form-group"><label>Stock Minimo</label><input type="number" id="prodStockMin" value="${producto?.stock_minimo || 5}"></div>
        <div class="form-group"><label>Unidad</label><select id="prodUnidad"><option value="unidad" ${producto?.unidad === 'unidad' ? 'selected' : ''}>Unidad</option><option value="kg" ${producto?.unidad === 'kg' ? 'selected' : ''}>Kg</option><option value="lt" ${producto?.unidad === 'lt' ? 'selected' : ''}>Litro</option><option value="caja" ${producto?.unidad === 'caja' ? 'selected' : ''}>Caja</option><option value="pack" ${producto?.unidad === 'pack' ? 'selected' : ''}>Pack</option></select></div>
      </div>
      <div class="form-group"><label>Fecha Vencimiento</label><input type="date" id="prodVencimiento" value="${producto?.fecha_vencimiento || ''}" min="${new Date().toISOString().split('T')[0]}"></div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarProducto(${id || ''})"><i class="fas fa-save"></i> Guardar</button>`);
}

async function guardarProducto(id = null) {
  const fechaVenc = document.getElementById('prodVencimiento').value || null;
  if (fechaVenc && !validarHoy('prodVencimiento', 'Producto proximo a vencer')) return;
  const data = {
    nombre: document.getElementById('prodNombre').value.trim(),
    codigo_barras: document.getElementById('prodCodigo').value || null,
    descripcion: document.getElementById('prodDescripcion').value || null,
    categoria_id: document.getElementById('prodCategoria').value || null,
    proveedor_id: document.getElementById('prodProveedor').value || null,
    precio_compra: parseFloat(document.getElementById('prodPCompra').value) || 0,
    precio_venta: parseFloat(document.getElementById('prodPVenta').value) || 0,
    stock: parseInt(document.getElementById('prodStock').value) || 0,
    stock_minimo: parseInt(document.getElementById('prodStockMin').value) || 5,
    unidad: document.getElementById('prodUnidad').value,
    fecha_vencimiento: fechaVenc
  };
  try {
    if (id) { await request(`/inventario/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await request('/inventario', { method: 'POST', body: JSON.stringify(data) }); }
    cerrarModal();
    Swal.fire({ icon: 'success', title: id ? 'Producto actualizado' : 'Producto creado', timer: 1500, showConfirmButton: false });
    renderInventario();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarProducto(id) {
  const prod = (window._invProductos || []).find(p => p.id === id);
  const result = await Swal.fire({ title: 'Eliminar Producto', text: `Estas seguro de eliminar "${prod?.nombre}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#E17055', confirmButtonText: 'Si, eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/inventario/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false }); renderInventario(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

function toggleAjusteFields(tipo) {
  const ent = document.getElementById('ajusteEntradaFields');
  const sal = document.getElementById('ajusteSalidaFields');
  if (ent) ent.style.display = tipo === 'entrada' ? 'block' : 'none';
  if (sal) sal.style.display = tipo === 'salida' ? 'block' : 'none';
}

function mostrarAjusteStock(id) {
  const prod = (window._invProductos || []).find(p => p.id === id);
  abrirModal('Ajustar Stock', `
    <p><strong>${prod?.nombre}</strong> - Stock actual: <span class="status-badge info">${prod?.stock}</span></p>
    <form id="formAjuste">
      <div class="form-group"><label>Tipo de movimiento</label>
        <select id="ajusteTipo" onchange="toggleAjusteFields(this.value)">
          <option value="entrada">Entrada (+)</option>
          <option value="salida">Salida (-)</option>
          <option value="ajuste">Ajuste (fijar cantidad)</option>
        </select>
      </div>
      <div class="form-group"><label>Cantidad</label><input type="number" id="ajusteCantidad" min="1" required></div>
      
      <div id="ajusteEntradaFields">
        <div class="form-group"><label>Precio de Compra (Unidad)</label>
          <input type="number" step="0.01" id="ajustePrecioCompra" value="${prod?.precio_compra || 0}">
        </div>
        <div class="form-group"><label>Proveedor</label>
          <select id="ajusteProveedor">
            <option value="">Seleccione un proveedor...</option>
            ${(window._invProveedores || []).map(pv => `<option value="${pv.id}" ${prod?.proveedor_id == pv.id ? 'selected' : ''}>${pv.nombre_empresa}</option>`).join('')}
          </select>
        </div>
      </div>

      <div id="ajusteSalidaFields" style="display:none">
        <div class="form-group"><label>Motivo de Salida</label>
          <select id="ajusteMotivoSalida">
            <option value="vencido">Producto Vencido</option>
            <option value="defectuoso">Producto Defectuoso</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div class="form-group"><label>Observaciones / Detalles</label>
        <textarea id="ajusteMotivo" placeholder="Notas adicionales del movimiento..."></textarea>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarAjuste(${id})"><i class="fas fa-check"></i> Confirmar</button>`);
}

async function guardarAjuste(id) {
  const tipo = document.getElementById('ajusteTipo').value;
  const cantidad = parseInt(document.getElementById('ajusteCantidad').value);
  let motivo = document.getElementById('ajusteMotivo').value.trim();
  
  let precio_compra = null;
  let proveedor_id = null;

  if (tipo === 'entrada') {
    precio_compra = parseFloat(document.getElementById('ajustePrecioCompra').value) || 0;
    proveedor_id = document.getElementById('ajusteProveedor').value || null;
    if (!proveedor_id) return Swal.fire({ icon: 'error', title: 'Proveedor requerido', text: 'Para una entrada de stock honesta y regulada, debes seleccionar el proveedor.' });
    motivo = motivo ? `Compra a proveedor. Notas: ${motivo}` : 'Compra a proveedor';
  } else if (tipo === 'salida') {
    const motivoSalida = document.getElementById('ajusteMotivoSalida').value;
    motivo = motivo ? `${motivoSalida.toUpperCase()}: ${motivo}` : motivoSalida.toUpperCase();
  }

  if (!cantidad || cantidad < 1) return Swal.fire({ icon: 'error', title: 'Cantidad invalida' });
  try {
    await request(`/inventario/${id}/ajustar-stock`, {
      method: 'POST',
      body: JSON.stringify({ tipo, cantidad, motivo, precio_compra, proveedor_id })
    });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Stock actualizado', timer: 1500, showConfirmButton: false });
    renderInventario();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function mostrarMovimientos(id) {
  try {
    const mov = await request(`/inventario/${id}/movimientos`);
    const prod = (window._invProductos || []).find(p => p.id === id);
    abrirModal(`Movimientos: ${prod?.nombre}`, `
      <div class="table-container">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Stock Anterior</th><th>Stock Nuevo</th><th>Motivo</th><th>Usuario</th></tr></thead>
          <tbody>${mov.length ? mov.map(m => `<tr>
            <td>${m.created_at}</td>
            <td><span class="status-badge ${m.tipo === 'entrada' ? 'success' : m.tipo === 'salida' ? 'danger' : 'warning'}">${m.tipo}</span></td>
            <td><strong>${m.cantidad}</strong></td>
            <td>${m.stock_anterior}</td>
            <td>${m.stock_nuevo}</td>
            <td>${m.motivo || '-'}</td>
            <td>${m.usuario_nombre || '-'}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-center text-muted">Sin movimientos registrados</td></tr>'}</tbody>
        </table>
      </div>
    `, '');
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

function mostrarFormCategoria() {
  abrirModal('Nueva Categoria', `
    <form id="formCategoria">
      <div class="form-group"><label>Nombre *</label><input type="text" id="catNombre" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="60"></div>
      <div class="form-group"><label>Descripcion</label><textarea id="catDescripcion"></textarea></div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarCategoria()"><i class="fas fa-save"></i> Guardar</button>`);
}

async function guardarCategoria() {
  try {
    await request('/categorias', { method: 'POST', body: JSON.stringify({ nombre: document.getElementById('catNombre').value, descripcion: document.getElementById('catDescripcion').value }) });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Categoria creada', timer: 1500, showConfirmButton: false });
    renderInventario();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ VENTAS ================
async function renderVentas() {
  const container = document.getElementById('moduleVentas');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando ventas...</p></div>';
  try {
    const [ventas, productos] = await Promise.all([request('/ventas'), request('/inventario')]);
    window._ventasProductos = productos;
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-success" onclick="mostrarNuevaVenta()"><i class="fas fa-plus"></i> Nueva Venta</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>#</th><th>Fecha</th><th>Usuario</th><th>Metodo Pago</th><th>Total</th><th>Acciones</th></tr></thead>
              <tbody>${ventas.length ? ventas.map(v => `<tr>
                <td><strong>#${v.id}</strong></td>
                <td>${v.created_at}</td>
                <td>${v.usuario_nombre || '-'}</td>
                <td><span class="status-badge info">${v.metodo_pago}</span></td>
                <td><strong>$${Number(v.total).toLocaleString('es-CO')}</strong></td>
                <td><button class="btn btn-sm btn-info" onclick="verDetalleVenta(${v.id})"><i class="fas fa-eye"></i></button></td>
              </tr>`) : '<tr><td colspan="6" class="text-center text-muted" style="padding:40px">No hay ventas registradas</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

async function mostrarNuevaVenta() {
  try {
    const estado = await request('/apertura/estado');
    if (!estado.abierto) {
      Swal.fire({
        icon: 'warning',
        title: 'Caja Cerrada',
        text: 'Debes realizar la apertura de caja antes de registrar ventas.',
        showCancelButton: true,
        confirmButtonColor: '#00cec9',
        confirmButtonText: '<i class="fas fa-cash-register"></i> Ir a Caja',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (result.isConfirmed) {
          cargarModulo('apertura');
        }
      });
      return;
    }

    const productos = window._ventasProductos || [];
    const disponibles = productos.filter(p => p.stock > 0);
    let items = [];
    abrirModal('Nueva Venta', `
      <div style="margin-bottom:15px">
        <div class="form-group" style="margin-bottom:12px">
          <label>Escanear Código de Barras (Pistola USB / Cámara)</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="ventaBarcodeScan" placeholder="Enfoque aquí y use el lector o digite el código..." style="flex:1" onkeydown="handleVentaBarcodeKey(event)">
            <button type="button" class="btn btn-secondary" onclick="escanearCodigo(code => { agregarProductoPorCodigo(code); cerrarEscanner(); })" style="padding:0 12px;height:42px;display:flex;align-items:center;justify-content:center" title="Escanear con cámara"><i class="fas fa-camera"></i></button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>O Seleccionar Manualmente</label>
            <select id="ventaProductoSelect" onchange="agregarItemVenta()">
              <option value="">Seleccione un producto...</option>
              ${disponibles.map(p => `<option value="${p.id}" data-precio="${p.precio_venta}" data-stock="${p.stock}" data-nombre="${p.nombre}">${p.nombre} - $${Number(p.precio_venta).toLocaleString('es-CO')} (Stock: ${p.stock})</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Cantidad</label><input type="number" id="ventaCantidad" value="1" min="1"></div>
        </div>
        <div id="ventaItemsList" style="margin-top:10px"></div>
        <div style="text-align:right;font-size:20px;font-weight:800;margin-top:15px;padding-top:15px;border-top:2px solid var(--gray-200)">
          Total: $<span id="ventaTotal">0</span>
        </div>
      </div>
    `, `<button class="btn btn-success" onclick="procesarVenta()"><i class="fas fa-check-circle"></i> Cobrar $<span id="ventaTotalFooter">0</span></button>`);
    window._ventaItems = [];
    actualizarTotalVenta();
    setTimeout(() => {
      const scanInput = document.getElementById('ventaBarcodeScan');
      if (scanInput) scanInput.focus();
    }, 150);
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error de Caja', text: err.message }); }
}

function agregarItemVenta() {
  const select = document.getElementById('ventaProductoSelect');
  const cantidad = parseInt(document.getElementById('ventaCantidad').value) || 1;
  if (!select.value) return;
  const option = select.selectedOptions[0];
  const id = parseInt(select.value);
  const existente = window._ventaItems.find(i => i.id === id);
  if (existente) {
    if (existente.cantidad + cantidad > parseInt(option.dataset.stock)) return Swal.fire({ icon: 'error', title: 'Stock insuficiente' });
    existente.cantidad += cantidad;
  } else {
    window._ventaItems.push({ id, nombre: option.dataset.nombre, precio: parseFloat(option.dataset.precio), cantidad, stock: parseInt(option.dataset.stock) });
  }
  select.value = '';
  document.getElementById('ventaCantidad').value = 1;
  actualizarTotalVenta();
}

function quitarItemVenta(index) {
  window._ventaItems.splice(index, 1);
  actualizarTotalVenta();
}

function actualizarTotalVenta() {
  const items = window._ventaItems || [];
  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
  document.getElementById('ventaItemsList').innerHTML = items.length ? items.map((i, idx) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--gray-200)">
      <span style="flex:1"><strong>${i.nombre}</strong> x ${i.cantidad}</span>
      <span style="font-weight:600">$${(i.precio * i.cantidad).toLocaleString('es-CO')}</span>
      <button class="btn btn-sm btn-danger" onclick="quitarItemVenta(${idx})"><i class="fas fa-times"></i></button>
    </div>
  `).join('') : '<div class="text-center text-muted" style="padding:20px">Agregue productos a la venta</div>';
  document.getElementById('ventaTotal').textContent = total.toLocaleString('es-CO');
  const footer = document.getElementById('ventaTotalFooter');
  if (footer) footer.textContent = total.toLocaleString('es-CO');
}

async function procesarVenta() {
  const items = window._ventaItems;
  if (!items.length) return Swal.fire({ icon: 'warning', title: 'Agregue al menos un producto' });
  try {
    const data = await request('/ventas', { method: 'POST', body: JSON.stringify({ items: items.map(i => ({ producto_id: i.id, cantidad: i.cantidad })) }) });
    cerrarModal();
    const result = await Swal.fire({
      icon: 'success', title: 'Venta registrada',
      text: `Total: $${Number(data.total).toLocaleString('es-CO')}`,
      showCancelButton: true,
      confirmButtonText: '<i class="fas fa-print"></i> Imprimir Comprobante',
      cancelButtonText: 'Cerrar'
    });
    if (result.isConfirmed) {
      const venta = await request(`/ventas/${data.id}`);
      if (typeof imprimirComprobante === 'function') {
        imprimirComprobante(venta);
      } else {
        window.open(`/api/ventas/${data.id}/print`, '_blank');
      }
    }
    renderVentas();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function verDetalleVenta(id) {
  try {
    const venta = await request(`/ventas/${id}`);
    abrirModal(`Venta #${venta.id}`, `
      <div class="form-row"><div class="form-group"><label>Fecha</label><p>${venta.created_at}</p></div>
      <div class="form-group"><label>Usuario</label><p>${venta.usuario_nombre}</p></div></div>
      <div class="form-row"><div class="form-group"><label>Metodo Pago</label><p>${venta.metodo_pago}</p></div>
      <div class="form-group"><label>Total</label><p style="font-size:24px;font-weight:800;color:var(--primary)">$${Number(venta.total).toLocaleString('es-CO')}</p></div></div>
      <hr style="margin:15px 0">
      <h4>Detalle</h4>
      <div class="table-container"><table>
        <thead><tr><th>Producto</th><th>Cant</th><th>P. Unit</th><th>Subtotal</th></tr></thead>
        <tbody>${venta.detalle.map(d => `<tr><td>${d.producto_nombre}</td><td>${d.cantidad}</td><td>$${Number(d.precio_unitario).toLocaleString('es-CO')}</td><td>$${Number(d.subtotal).toLocaleString('es-CO')}</td></tr>`).join('')}</tbody>
      </table></div>
    `, `<button class="btn btn-primary" onclick="imprimirVenta(${venta.id})"><i class="fas fa-print"></i> Imprimir</button>`);
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function imprimirVenta(id) {
  cerrarModal();
  try {
    const venta = await request(`/ventas/${id}`);
    if (typeof imprimirComprobante === 'function') imprimirComprobante(venta);
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ EMPLEADOS ================
async function renderEmpleados() {
  const container = document.getElementById('moduleEmpleados');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando empleados...</p></div>';
  try {
    const [empleados, roles] = await Promise.all([request('/empleados'), request('/empleados/roles')]);
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary" onclick="mostrarFormEmpleado()"><i class="fas fa-user-plus"></i> Empleado</button>
        <button class="btn btn-secondary" onclick="mostrarFormRol()" style="margin-left:8px"><i class="fas fa-shield-alt"></i> Nuevo Rol</button>
      </div>
      <div style="margin-bottom:20px">
        <h3 style="margin-bottom:10px"><i class="fas fa-shield-alt" style="color:var(--primary)"></i> Roles y Permisos</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px">
          ${roles.map(r => {
            const perms = JSON.parse(r.permisos || '[]');
            return `<div class="card" style="cursor:pointer" onclick="editarRol(${r.id})">
              <div class="card-body">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong style="font-size:16px">${r.nombre}</strong>
                  ${r.nombre !== 'superadmin' ? `<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();eliminarRol(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
                  ${perms.includes('*') ? '<span class="status-badge info">Acceso Total</span>' : perms.map(p => `<span class="status-badge secondary">${p}</span>`).join('')}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>Nombre</th><th>Email</th><th>Telefono</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>${empleados.length ? empleados.map(e => `<tr>
                <td><strong>${e.nombre}</strong></td>
                <td>${e.email}</td>
                <td>${e.telefono || '-'}</td>
                <td><span class="status-badge info">${e.rol_nombre}</span></td>
                <td><span class="status-badge ${e.activo ? 'success' : 'danger'}">${e.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="mostrarFormEmpleado(${e.id})"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger" onclick="eliminarEmpleado(${e.id})"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`) : '<tr><td colspan="6" class="text-center text-muted">Sin empleados registrados</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    window._empRoles = roles;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

function mostrarFormEmpleado(id = null) {
  const roles = window._empRoles || [];
  abrirModal(id ? 'Editar Empleado' : 'Nuevo Empleado', `
    <form id="formEmpleado">
      <div class="form-row">
        <div class="form-group"><label>Nombre *</label><input type="text" id="empNombre" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="60"></div>
        <div class="form-group"><label>Email *</label><input type="email" id="empEmail" required oninput="this.value=validators.email(this.value)"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Telefono</label><input type="text" id="empTelefono" oninput="this.value=validators.telefono(this.value)"></div>
        <div class="form-group"><label>Rol *</label><select id="empRol">${roles.map(r => `<option value="${r.id}">${r.nombre}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label>Contrasena ${id ? '(dejar vacio para mantener)' : '*'} </label><input type="password" id="empPassword" ${!id ? 'required' : ''} minlength="6"></div>
      <div class="trial-note"><i class="fas fa-info-circle"></i> El empleado podra iniciar sesion con su email y esta contrasena</div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarEmpleado(${id || ''})"><i class="fas fa-save"></i> Guardar</button>`);
}

async function guardarEmpleado(id = null) {
  try {
    const pwd = document.getElementById('empPassword').value;
    const data = { nombre: document.getElementById('empNombre').value.trim(), email: document.getElementById('empEmail').value.trim(), telefono: document.getElementById('empTelefono').value, rol_id: parseInt(document.getElementById('empRol').value) };
    if (!id) { if (!pwd || pwd.length < 6) return Swal.fire({ icon: 'error', title: 'La contrasena debe tener al menos 6 caracteres' }); data.password = pwd; }
    else { if (pwd) { if (pwd.length < 6) return Swal.fire({ icon: 'error', title: 'La contrasena debe tener al menos 6 caracteres' }); data.password = pwd; } }
    if (id) { await request(`/empleados/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await request('/empleados', { method: 'POST', body: JSON.stringify(data) }); }
    cerrarModal();
    Swal.fire({ icon: 'success', title: id ? 'Empleado actualizado' : 'Empleado creado', timer: 1500, showConfirmButton: false });
    renderEmpleados();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarEmpleado(id) {
  const result = await Swal.fire({ title: 'Eliminar Empleado', text: 'Estas seguro?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/empleados/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false }); renderEmpleados(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

function mostrarFormRol() {
  const modulosDisponibles = ['dashboard', 'inventario', 'inventario_ver', 'ventas', 'ventas_ver', 'empleados', 'proveedores', 'logs', 'configuracion', 'apertura_cierre', 'api_integracion'];
  abrirModal('Nuevo Rol', `
    <form id="formRol">
      <div class="form-group"><label>Nombre del Rol *</label><input type="text" id="rolNombre" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="40"></div>
      <div class="form-group"><label>Permisos</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${modulosDisponibles.map(m => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--gray-100);border-radius:6px;cursor:pointer">
            <input type="checkbox" name="rolPermiso" value="${m}"> ${m.replace(/_/g, ' ')}
          </label>`).join('')}
        </div>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarRol()"><i class="fas fa-save"></i> Guardar Rol</button>`);
}

async function guardarRol() {
  const checkboxes = document.querySelectorAll('input[name="rolPermiso"]:checked');
  const permisos = Array.from(checkboxes).map(c => c.value);
  try {
    await request('/empleados/roles', { method: 'POST', body: JSON.stringify({ nombre: document.getElementById('rolNombre').value, permisos }) });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Rol creado', timer: 1500, showConfirmButton: false });
    renderEmpleados();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function editarRol(id) {
  try {
    const roles = window._empRoles || [];
    const rol = roles.find(r => r.id === id);
    if (!rol) return;
    const permisosActuales = JSON.parse(rol.permisos || '[]');
    const modulosDisponibles = ['dashboard', 'inventario', 'inventario_ver', 'ventas', 'ventas_ver', 'empleados', 'proveedores', 'logs', 'configuracion', 'apertura_cierre', 'api_integracion'];
    abrirModal('Editar Rol', `
      <form id="formRol">
        <div class="form-group"><label>Nombre</label><input type="text" id="rolNombre" value="${rol.nombre}" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="40"></div>
        <div class="form-group"><label>Permisos</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${modulosDisponibles.map(m => `
            <label style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--gray-100);border-radius:6px;cursor:pointer">
              <input type="checkbox" name="rolPermiso" value="${m}" ${permisosActuales.includes(m) ? 'checked' : ''}> ${m.replace(/_/g, ' ')}
            </label>`).join('')}
          </div>
        </div>
      </form>
    `, `<button class="btn btn-primary" onclick="actualizarRol(${id})"><i class="fas fa-save"></i> Actualizar</button>`);
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function actualizarRol(id) {
  const checkboxes = document.querySelectorAll('input[name="rolPermiso"]:checked');
  const permisos = Array.from(checkboxes).map(c => c.value);
  try {
    await request(`/empleados/roles/${id}`, { method: 'PUT', body: JSON.stringify({ nombre: document.getElementById('rolNombre').value, permisos }) });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Rol actualizado', timer: 1500, showConfirmButton: false });
    renderEmpleados();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarRol(id) {
  const result = await Swal.fire({ title: 'Eliminar Rol', text: 'Estas seguro? Los empleados con este rol se quedaran sin rol asignado.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/empleados/roles/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false }); renderEmpleados(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ PROVEEDORES ================
async function renderProveedores() {
  const container = document.getElementById('moduleProveedores');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando proveedores...</p></div>';
  try {
    const proveedores = await request('/proveedores');
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary" onclick="mostrarFormProveedor()"><i class="fas fa-plus"></i> Proveedor</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>Empresa</th><th>NIT</th><th>Contacto</th><th>Telefono</th><th>Productos</th><th>Acciones</th></tr></thead>
              <tbody>${proveedores.length ? proveedores.map(p => `<tr>
                <td><strong>${p.nombre_empresa}</strong></td>
                <td><code>${p.nit}</code></td>
                <td>${p.contacto_nombre || '-'}</td>
                <td>${p.contacto_telefono || '-'}</td>
                <td><span class="status-badge info">${p.total_productos} productos</span></td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="mostrarFormProveedor(${p.id})"><i class="fas fa-edit"></i></button>
                  <button class="btn btn-sm btn-danger" onclick="eliminarProveedor(${p.id})"><i class="fas fa-trash"></i></button>
                </td>
              </tr>`) : '<tr><td colspan="6" class="text-center text-muted">Sin proveedores registrados</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    window._provData = proveedores;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

function mostrarFormProveedor(id = null) {
  const prov = id ? (window._provData || []).find(p => p.id === id) : null;
  abrirModal(prov ? 'Editar Proveedor' : 'Nuevo Proveedor', `
    <form id="formProveedor">
      <div class="form-row">
        <div class="form-group"><label>Nombre Empresa *</label><input type="text" id="provEmpresa" value="${prov?.nombre_empresa || ''}" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="80"></div>
        <div class="form-group"><label>NIT *</label><input type="text" id="provNit" value="${prov?.nit || ''}" required oninput="this.value=validators.nit(this.value)" placeholder="123456789-0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Nombre Contacto</label><input type="text" id="provContacto" value="${prov?.contacto_nombre || ''}" oninput="this.value=validators.soloLetras(this.value)"></div>
        <div class="form-group"><label>Telefono Contacto</label><input type="text" id="provTelefono" value="${prov?.contacto_telefono || ''}" oninput="this.value=validators.telefono(this.value)"></div>
      </div>
      <div class="form-group"><label>Direccion</label><input type="text" id="provDireccion" value="${prov?.direccion || ''}"></div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarProveedor(${id || ''})"><i class="fas fa-save"></i> Guardar</button>`);
}

async function guardarProveedor(id = null) {
  const nombre_empresa = document.getElementById('provEmpresa').value.trim();
  const nit = document.getElementById('provNit').value.trim();
  if (!nombre_empresa || nombre_empresa.length < 2) return Swal.fire({ icon: 'error', title: 'Nombre de empresa invalido' });
  if (!nit || nit.length < 5) return Swal.fire({ icon: 'error', title: 'NIT invalido. Formato: 123456789-0' });
  const data = { nombre_empresa, nit,
    contacto_nombre: document.getElementById('provContacto').value.trim(),
    contacto_telefono: document.getElementById('provTelefono').value.trim(),
    direccion: document.getElementById('provDireccion').value.trim()
  };
  try {
    if (id) { await request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await request('/proveedores', { method: 'POST', body: JSON.stringify(data) }); }
    cerrarModal();
    Swal.fire({ icon: 'success', title: id ? 'Proveedor actualizado' : 'Proveedor creado', timer: 1500, showConfirmButton: false });
    renderProveedores();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarProveedor(id) {
  const prov = (window._provData || []).find(p => p.id === id);
  const result = await Swal.fire({ title: 'Eliminar Proveedor', text: `Eliminar a ${prov?.nombre_empresa}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/proveedores/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false }); renderProveedores(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ APERTURA / CIERRE ================
async function renderApertura() {
  const container = document.getElementById('moduleApertura');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando apertura y cierres...</p></div>';
  try {
    const estado = await request('/apertura/estado');
    const historial = await request('/apertura/historial');
    container.innerHTML = `
      <div class="pos-status ${estado.abierto ? 'abierto' : 'cerrado'}">
        <div class="pos-indicator ${estado.abierto ? 'open' : 'closed'}"></div>
        <div style="flex:1">
          <h3 style="font-size:20px">${estado.abierto ? 'Caja Abierta' : 'Caja Cerrada'}</h3>
          ${estado.abierto ? `<p>Caja aperturada con $${Number(estado.apertura.monto_inicial).toLocaleString('es-CO')} - Ventas hoy: ${estado.ventas_hoy?.total_ventas || 0} ($${Number(estado.ventas_hoy?.total_ingresos || 0).toLocaleString('es-CO')})</p>` : `<p>Ultimo cierre: ${estado.ultimo_cierre?.created_at || 'N/A'}</p>`}
        </div>
        ${estado.abierto
          ? `<button class="btn btn-danger" onclick="cerrarCaja()"><i class="fas fa-door-closed"></i> Cerrar Caja</button>`
          : `<button class="btn btn-success" onclick="abrirCaja()"><i class="fas fa-door-open"></i> Abrir Caja</button>`}
      </div>
      <div class="card">
        <div class="card-header"><h3>Historial de Aperturas y Cierres</h3></div>
        <div class="card-body" style="padding:0">
          <div class="table-container"><table>
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Tipo</th><th>Monto Inicial</th><th>Monto Final</th><th>Observaciones</th></tr></thead>
            <tbody>${historial.length ? historial.map(h => `<tr>
              <td>${h.created_at}</td>
              <td>${h.usuario_nombre || '-'}</td>
              <td><span class="status-badge ${h.tipo === 'apertura' ? 'success' : 'danger'}">${h.tipo}</span></td>
              <td>$${Number(h.monto_inicial || 0).toLocaleString('es-CO')}</td>
              <td>$${Number(h.monto_final || 0).toLocaleString('es-CO')}</td>
              <td>${h.observaciones || '-'}</td>
            </tr>`) : '<tr><td colspan="6" class="text-center text-muted">Sin registros</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>
    `;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

async function abrirCaja() {
  const { value: monto } = await Swal.fire({ title: 'Apertura de Caja', html: '<label style="display:block;text-align:left;margin-bottom:8px;font-weight:600">Monto Inicial</label><input id="montoInicial" class="swal2-input" type="number" value="0" step="0.01">', confirmButtonText: 'Abrir Caja', preConfirm: () => document.getElementById('montoInicial').value });
  if (monto === undefined) return;
  try {
    const data = await request('/apertura/apertura', { method: 'POST', body: JSON.stringify({ monto_inicial: parseFloat(monto) || 0 }) });
    Swal.fire({ icon: 'success', title: 'Caja Abierta', text: data.hora, timer: 2000, showConfirmButton: false });
    renderApertura();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function cerrarCaja() {
  const result = await Swal.fire({ title: 'Cerrar Caja', text: 'Estas seguro de cerrar la caja?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#E17055', confirmButtonText: 'Cerrar Caja' });
  if (!result.isConfirmed) return;
  try {
    const data = await request('/apertura/cierre', { method: 'POST', body: JSON.stringify({ observaciones: 'Cierre manual' }) });
    Swal.fire({ icon: 'success', title: 'Caja Cerrada', text: `Total ventas: $${Number(data.resumen?.total_ingresos || 0).toLocaleString('es-CO')}`, timer: 2500, showConfirmButton: false });
    renderApertura();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ LOGS ================
async function renderLogs() {
  const container = document.getElementById('moduleLogs');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando logs de auditoria...</p></div>';
  try {
    const data = await request('/logs');
    const resumen = await request('/logs/resumen');
    
    window._logsResumen = resumen;
    window._logsFiltros = data.filtros;
    window._logsData = data.logs;

    if (!window._activeLogsTab) window._activeLogsTab = 'acciones';

    renderLogsTabsStructure();
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function renderLogsTabsStructure() {
  const container = document.getElementById('moduleLogs');
  const activeTab = window._activeLogsTab;

  container.innerHTML = `
    <div class="auth-tabs" style="margin-bottom: 20px; display: flex; gap: 4px; background: rgba(0,0,0,0.05); padding: 4px; border-radius: var(--radius-md);">
      <button class="auth-tab ${activeTab === 'acciones' ? 'active' : ''}" style="flex:1" onclick="cambiarTabLogs('acciones')">
        <i class="fas fa-clipboard-list"></i> Acciones del Sistema
      </button>
      <button class="auth-tab ${activeTab === 'sesiones' ? 'active' : ''}" style="flex:1" onclick="cambiarTabLogs('sesiones')">
        <i class="fas fa-cash-register"></i> Sesiones de Caja
      </button>
      <button class="auth-tab ${activeTab === 'reportes' ? 'active' : ''}" style="flex:1" onclick="cambiarTabLogs('reportes')">
        <i class="fas fa-chart-line"></i> Reportes Financieros
      </button>
    </div>
    <div id="logsSubView"></div>
  `;

  if (activeTab === 'acciones') {
    renderTabAcciones();
  } else if (activeTab === 'sesiones') {
    renderTabSesiones();
  } else if (activeTab === 'reportes') {
    renderTabReportes();
  }
}

function cambiarTabLogs(tab) {
  window._activeLogsTab = tab;
  renderLogsTabsStructure();
}

function renderTabAcciones() {
  const subView = document.getElementById('logsSubView');
  const filtros = window._logsFiltros || { modulos: [] };
  const resumen = window._logsResumen || { totalLogs: 0, logsHoy: 0 };

  subView.innerHTML = `
    <div class="search-bar" style="margin-bottom:16px">
      <select id="logModulo" onchange="filtrarLogs()"><option value="">Todos los modulos</option>
        ${filtros.modulos.map(m => `<option value="${m.modulo}">${m.modulo}</option>`).join('')}
      </select>
      <input type="text" id="logBusqueda" placeholder="Buscar accion..." oninput="filtrarLogs()">
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:15px">
      <div class="stat-card"><div class="stat-value">${resumen.totalLogs}</div><div class="stat-label">Total Registros</div></div>
      <div class="stat-card"><div class="stat-value">${resumen.logsHoy}</div><div class="stat-label">Hoy</div></div>
    </div>
    <div class="card animate-fadeIn">
      <div class="card-body" style="padding:0">
        <div class="table-container"><table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Modulo</th><th>Detalle</th></tr></thead>
          <tbody id="tablaLogs"></tbody>
        </table></div>
      </div>
    </div>
  `;
  filtrarLogs();
}

async function renderTabSesiones() {
  const subView = document.getElementById('logsSubView');
  subView.innerHTML = '<div class="text-center" style="padding:30px;"><div class="loader-ripple"><div></div><div></div></div><p>Cargando historial de sesiones de caja...</p></div>';
  try {
    const data = await request('/apertura/historial');
    const fmt = n => '$' + Number(n).toLocaleString('es-CO');
    
    subView.innerHTML = `
      <div class="card animate-fadeIn">
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Monto Inicial</th>
                  <th>Monto Final</th>
                  <th>Diferencia</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                ${data.length ? data.map(s => {
                  const isApertura = s.tipo === 'apertura';
                  const statusLabel = s.monto_final !== null ? 'Cerrada' : 'Abierta';
                  const diff = s.monto_final !== null ? (s.monto_final - s.monto_inicial) : 0;
                  return `
                    <tr>
                      <td>${s.created_at}</td>
                      <td><strong>${s.usuario_nombre}</strong></td>
                      <td>${fmt(s.monto_inicial)}</td>
                      <td>${s.monto_final !== null ? fmt(s.monto_final) : '-'}</td>
                      <td>${s.monto_final !== null ? fmt(diff) : '-'}</td>
                      <td><span class="status-badge ${s.monto_final !== null ? 'success' : 'danger'}">${statusLabel.toUpperCase()}</span></td>
                      <td>
                        <button class="btn btn-sm btn-info" onclick="imprimirDetalleSesion(${s.id})" title="Imprimir Detalle de Caja"><i class="fas fa-print"></i> Historial</button>
                      </td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">No hay sesiones registradas</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    subView.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

function renderTabReportes() {
  const subView = document.getElementById('logsSubView');
  subView.innerHTML = `
    <div class="card animate-fadeIn" style="margin-bottom:20px">
      <div class="card-body">
        <h4 style="margin-top:0;margin-bottom:15px"><i class="fas fa-filter" style="color:var(--primary)"></i> Generar Reporte de Ingresos y Gastos</h4>
        <div class="form-row" style="display:flex;gap:15px;flex-wrap:wrap">
          <div class="form-group" style="flex:1;min-width:200px">
            <label>Período de Agrupación</label>
            <select id="repPeriodo">
              <option value="dia">Día Seleccionado</option>
              <option value="semana">Semana (Últimos 7 días)</option>
              <option value="mes" selected>Mes Completo</option>
              <option value="trimestre">Trimestre (Últimos 3 meses)</option>
              <option value="semestre">Semestre (Últimos 6 meses)</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;min-width:200px">
            <label>Fecha de Referencia</label>
            <input type="date" id="repFecha" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <button class="btn btn-primary" onclick="generarReporteFinanciero()"><i class="fas fa-sync"></i> Generar Reporte</button>
      </div>
    </div>
    <div id="reporteFinancieroResultBox"></div>
  `;
}

function filtrarLogs() {
  const modulo = document.getElementById('logModulo')?.value || '';
  const busqueda = (document.getElementById('logBusqueda')?.value || '').toLowerCase();
  const logs = window._logsData || [];
  const filtrados = logs.filter(l => {
    if (modulo && l.modulo !== modulo) return false;
    if (busqueda && !l.accion.toLowerCase().includes(busqueda) && !l.usuario_nombre?.toLowerCase().includes(busqueda)) return false;
    return true;
  });
  document.getElementById('tablaLogs').innerHTML = filtrados.length ? filtrados.map(l => `<tr>
    <td style="white-space:nowrap">${l.created_at}</td>
    <td><strong>${l.usuario_nombre || 'Sistema'}</strong></td>
    <td>${l.accion}</td>
    <td><span class="status-badge info">${l.modulo}</span></td>
    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;font-size:12px;color:var(--gray-300)">${l.detalle ? l.detalle.substring(0, 100) : '-'}</td>
  </tr>`) : '<tr><td colspan="5" class="text-center text-muted" style="padding:30px">Sin registros</td></tr>';
}

// ================ CONFIGURACION ================
async function renderConfig() {
  const container = document.getElementById('moduleConfig');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando configuracion...</p></div>';
  try {
    const config = await request('/config');
    container.innerHTML = `
      <div class="card">
        <div class="card-header"><h3><i class="fas fa-store" style="color:var(--primary)"></i> Informacion de la Tienda</h3></div>
        <div class="card-body">
          <form id="formConfig">
            <div class="form-row" style="display:flex;gap:15px;margin-bottom:15px;flex-wrap:wrap">
              <div class="form-group" style="flex:1;min-width:200px;margin-bottom:0"><label>Nombre de la Tienda</label>
                <input type="text" id="cfgNombre" value="${config.tienda_nombre || ''}" class="form-input" style="width:100%;padding:14px 16px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:15px;font-family:inherit;outline:none">
              </div>
              <div class="form-group" style="flex:1;min-width:200px;margin-bottom:0"><label>NIT de la Tienda</label>
                <input type="text" id="cfgNit" value="${config.tienda_nit || ''}" class="form-input" style="width:100%;padding:14px 16px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:15px;font-family:inherit;outline:none" placeholder="e.g. 123456789-0">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>Moneda</label>
                <select id="cfgMoneda" style="width:100%;padding:14px 16px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:15px;font-family:inherit;outline:none">
                  <option value="COP" ${config.moneda === 'COP' ? 'selected' : ''}>COP - Peso Colombiano</option>
                  <option value="USD" ${config.moneda === 'USD' ? 'selected' : ''}>USD - Dolar</option>
                  <option value="EUR" ${config.moneda === 'EUR' ? 'selected' : ''}>EUR - Euro</option>
                </select>
              </div>
              <div class="form-group"><label>Impuesto (%)</label>
                <input type="number" id="cfgImpuesto" value="${config.impuesto || 19}" style="width:100%;padding:14px 16px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:15px;font-family:inherit;outline:none">
              </div>
            </div>
            <button type="button" class="btn btn-primary" onclick="guardarConfig()"><i class="fas fa-save"></i> Guardar Configuracion</button>
          </form>
        </div>
      </div>
    `;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

async function guardarConfig() {
  try {
    await request('/config', { method: 'PUT', body: JSON.stringify({
      tienda_nombre: document.getElementById('cfgNombre').value,
      tienda_nit: document.getElementById('cfgNit').value,
      moneda: document.getElementById('cfgMoneda').value,
      impuesto: document.getElementById('cfgImpuesto').value
    })});
    Swal.fire({ icon: 'success', title: 'Configuracion guardada', timer: 1500, showConfirmButton: false });
    cargarConfig();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ SUPER ADMIN ================
async function renderSuperAdmin() {
  const container = document.getElementById('moduleSuperAdmin');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando panel de super administracion...</p></div>';
  try {
    const [ofertas, suscripciones, clientes, estadisticas, pagos] = await Promise.all([
      request('/superadmin/ofertas'), request('/superadmin/suscripciones'),
      request('/superadmin/clientes'), request('/superadmin/estadisticas'),
      request('/superadmin/pagos')
    ]);
    window._saOfertas = ofertas;
    window._saClientes = clientes;
    container.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-primary" onclick="mostrarFormOferta()"><i class="fas fa-tag"></i> Nueva Oferta</button>
        <button class="btn btn-success" onclick="mostrarPago()"><i class="fas fa-dollar-sign"></i> Registrar Pago</button>
        <button class="btn btn-danger" onclick="cambiarSaTab('mantenimiento',document.querySelector('.sa-tab:last-child'))"><i class="fas fa-trash-alt"></i> Reset BD</button>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
        <div class="stat-card"><div class="stat-value">${estadisticas.totalClientes}</div><div class="stat-label">Total Clientes</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${estadisticas.clientesActivos}</div><div class="stat-label">Suscripciones Activas</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--warning)">${estadisticas.clientesPrueba}</div><div class="stat-label">En Prueba</div></div>
        <div class="stat-card"><div class="stat-value">$${Number(estadisticas.ingresosSoftware).toLocaleString('es-CO')}</div><div class="stat-label">Ingresos Software</div></div>
      </div>

      <!-- TABS -->
      <div style="display:flex;gap:4px;margin-bottom:15px;flex-wrap:wrap">
        <button class="btn btn-sm sa-tab active" onclick="cambiarSaTab('clientes',this)" style="background:var(--primary);color:white">Clientes</button>
        <button class="btn btn-sm sa-tab" onclick="cambiarSaTab('ofertas',this)" style="background:var(--gray-200)">Ofertas</button>
        <button class="btn btn-sm sa-tab" onclick="cambiarSaTab('pagos',this)" style="background:var(--gray-200)">Pagos</button>
        <button class="btn btn-sm sa-tab" onclick="cambiarSaTab('suscripciones',this)" style="background:var(--gray-200)">Suscripciones</button>
        <button class="btn btn-sm sa-tab" onclick="cambiarSaTab('mantenimiento',this)" style="background:var(--gray-200)">Mantenimiento</button>
      </div>
      <div id="saTabContent"></div>
    `;
    renderSaClientes(clientes, ofertas);
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

function cambiarSaTab(tab, btn) {
  document.querySelectorAll('.sa-tab').forEach(t => { t.style.background = 'var(--gray-200)'; t.style.color = 'var(--dark)'; });
  if (btn) { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; }
  const ofertas = window._saOfertas || [];
  if (tab === 'clientes') renderSaClientes(window._saClientes, ofertas);
  else if (tab === 'ofertas') renderSaOfertas(ofertas);
  else if (tab === 'pagos') renderSaPagos();
  else if (tab === 'suscripciones') renderSaSuscripciones();
  else if (tab === 'mantenimiento') renderSaMantenimiento();
}

function renderSaClientes(clientes, ofertas) {
  const cont = document.getElementById('saTabContent');
  cont.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Clientes Registrados</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="text" id="saClienteBusqueda" placeholder="Buscar nombre o email..." style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:13px" oninput="filtrarSaClientes()">
          <input type="number" id="saClienteDias" placeholder="Dias demo..." style="padding:8px 12px;border:1px solid var(--gray-200);border-radius:var(--radius-sm);font-size:13px;width:100px" oninput="filtrarSaClientes()">
          <button class="btn btn-sm btn-success" onclick="mostrarAsignarSuscripcion()"><i class="fas fa-plus"></i> Asignar</button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-container"><table>
          <thead><tr><th>Cliente</th><th>Email</th><th>Telefono</th><th>Trial</th><th>Dias Demo</th><th>Suscripcion</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody id="saClientesTbody">${clientes.map(c => renderSaClienteRow(c)).join('')}</tbody>
        </table></div>
      </div>
    </div>
  `;
  window._saClientesData = clientes;
}

function renderSaClienteRow(c) {
  const diasDemo = c.trial_end ? Math.ceil((new Date(c.trial_end + 'Z') - new Date()) / 86400000) : null;
  const activo = c.activo !== 0;
  return `<tr class="sa-cliente-row" data-nombre="${(c.nombre||'').toLowerCase()}" data-email="${(c.email||'').toLowerCase()}" data-dias="${diasDemo !== null ? diasDemo : ''}">
    <td><strong>${c.nombre}</strong></td>
    <td>${c.email}</td>
    <td>${c.telefono || '-'}</td>
    <td>${c.trial_end ? `<span class="status-badge warning">${c.trial_end}</span>` : '-'}</td>
    <td>${diasDemo !== null ? (diasDemo > 0 ? `<span class="status-badge warning">${diasDemo} dias</span>` : '<span class="status-badge danger">Expirado</span>') : '-'}</td>
    <td>${c.estado_suscripcion || 'Sin suscripcion'}</td>
    <td><span class="status-badge ${activo ? (c.estado_suscripcion === 'activa' ? 'success' : diasDemo !== null && diasDemo > 0 ? 'warning' : 'secondary') : 'danger'}">${!activo ? 'inactivo' : c.estado_suscripcion === 'activa' ? 'activo' : diasDemo !== null && diasDemo > 0 ? 'en prueba' : 'sin plan'}</span></td>
    <td style="white-space:nowrap">
      <button class="btn btn-sm ${activo ? 'btn-warning' : 'btn-success'}" onclick="toggleCliente(${c.id}, ${activo})" title="${activo ? 'Desactivar' : 'Activar'} cuenta"><i class="fas fa-${activo ? 'ban' : 'check'}"></i></button>
      <button class="btn btn-sm btn-info" onclick="verDetalleCliente(${c.id})" title="Ver detalle"><i class="fas fa-eye"></i></button>
      <button class="btn btn-sm btn-primary" onclick="extenderDemo(${c.id})" title="Extender demo"><i class="fas fa-clock"></i></button>
      <button class="btn btn-sm btn-secondary" onclick="cambiarPlanCliente(${c.id})" title="Cambiar plan"><i class="fas fa-exchange-alt"></i></button>
    </td>
  </tr>`;
}

function filtrarSaClientes() {
  const q = (document.getElementById('saClienteBusqueda')?.value || '').toLowerCase();
  const dias = document.getElementById('saClienteDias')?.value;
  const rows = document.querySelectorAll('.sa-cliente-row');
  rows.forEach(r => {
    const matchNombre = r.dataset.nombre.includes(q) || r.dataset.email.includes(q);
    const matchDias = !dias || r.dataset.dias === dias || (dias === '0' && r.dataset.dias === '');
    r.style.display = (matchNombre && matchDias) ? '' : 'none';
  });
}

function renderSaOfertas(ofertas) {
  document.getElementById('saTabContent').innerHTML = `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
        <h3><i class="fas fa-tags"></i> Ofertas del Software</h3>
        <button class="btn btn-sm btn-primary" onclick="mostrarFormOferta()"><i class="fas fa-plus"></i> Nueva</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px">
        ${ofertas.map(o => {
          const caracts = JSON.parse(o.caracteristicas || '[]');
          return `<div class="card" style="border:2px solid ${o.activo ? 'var(--primary)' : 'var(--gray-200)'}">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:start">
                <h4 style="font-size:18px">${o.nombre} ${o.activo ? '<span class="status-badge success">Activo</span>' : '<span class="status-badge secondary">Inactivo</span>'}</h4>
                <div><button class="btn btn-sm btn-primary" onclick="mostrarFormOferta(${o.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="eliminarOferta(${o.id})"><i class="fas fa-trash"></i></button></div>
              </div>
              <p class="text-muted" style="margin:8px 0">${o.descripcion || 'Sin descripcion'}</p>
              <div style="font-size:22px;font-weight:800;color:var(--primary)">$${Number(o.precio).toLocaleString('es-CO')}</div>
              ${o.tipo_pago === 'unico' ? '<div class="text-muted"><i class="fas fa-check-circle" style="color:var(--success)"></i> Pago Unico (Offline)</div>' : `<div class="text-muted">+ $${Number(o.precio_mensual).toLocaleString('es-CO')}/mes (Cloud)</div>`}
              <div class="text-muted">Duracion: ${o.duracion_dias} dias</div>
              ${caracts.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">${caracts.map(c => `<span class="status-badge info" style="font-size:10px">${CARACTERISTICAS_DISPONIBLES.find(x=>x.id===c)?.label || c}</span>`).join('')}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderSaPagos() {
  const cont = document.getElementById('saTabContent');
  request('/superadmin/pagos').then(pagos => {
    cont.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>Registro de Pagos</h3>
          <button class="btn btn-sm btn-success" onclick="mostrarPago()"><i class="fas fa-plus"></i> Registrar Pago</button>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-container"><table>
            <thead><tr><th>Cliente</th><th>Monto</th><th>Metodo</th><th>Concepto</th><th>Referencia</th><th>Estado</th><th>Accion</th></tr></thead>
            <tbody>${pagos.length ? pagos.map(p => `<tr>
              <td><strong>${p.usuario_nombre || '-'}</strong><br><small class="text-muted">${p.usuario_email || ''}</small></td>
              <td><strong>$${Number(p.monto).toLocaleString('es-CO')}</strong></td>
              <td><span class="status-badge info">${p.metodo}</span></td>
              <td>${p.concepto || '-'}</td>
              <td><code>${p.referencia || '-'}</code></td>
              <td><span class="status-badge ${p.estado === 'aprobado' ? 'success' : p.estado === 'pendiente' ? 'warning' : 'danger'}">${p.estado}</span></td>
              <td>${p.estado === 'pendiente' ? `<button class="btn btn-sm btn-success" onclick="aprobarPago(${p.id})"><i class="fas fa-check"></i></button>` : '-'}</td>
            </tr>`) : '<tr><td colspan="7" class="text-center text-muted">Sin pagos registrados</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>
    `;
  }).catch(() => { cont.innerHTML = '<div class="empty-state"><h3>Error al cargar pagos</h3></div>'; });
}

function renderSaSuscripciones() {
  const cont = document.getElementById('saTabContent');
  request('/superadmin/suscripciones').then(suscripciones => {
    cont.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Historial de Suscripciones</h3></div>
        <div class="card-body" style="padding:0">
          <div class="table-container"><table>
            <thead><tr><th>Cliente</th><th>Oferta</th><th>Inicio</th><th>Fin</th><th>Estado</th></tr></thead>
            <tbody>${suscripciones.length ? suscripciones.map(s => `<tr>
              <td><strong>${s.usuario_nombre}</strong><br><small class="text-muted">${s.usuario_email}</small></td>
              <td>${s.oferta_nombre || '-'}</td>
              <td>${s.fecha_inicio}</td>
              <td>${s.fecha_fin}</td>
              <td><span class="status-badge ${s.estado === 'activa' ? 'success' : s.estado === 'expirada' ? 'danger' : 'warning'}">${s.estado}</span></td>
            </tr>`) : '<tr><td colspan="5" class="text-center text-muted">Sin suscripciones registradas</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>
    `;
  }).catch(() => { cont.innerHTML = '<div class="empty-state"><h3>Error</h3></div>'; });
}

function renderSaMantenimiento() {
  document.getElementById('saTabContent').innerHTML = `
    <div class="card">
      <div class="card-header"><h3><i class="fas fa-tools"></i> Mantenimiento de Base de Datos</h3></div>
      <div class="card-body">
        <p class="text-muted">Selecciona el modulo que deseas reiniciar. Esta accion <strong>NO SE PUEDE DESHACER</strong>.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:15px">
          ${['productos','categorias','proveedores','ventas','empleados','logs','movimientos','aperturas','api','config','suscripciones','pagos'].map(m => `
            <button class="btn btn-outline" onclick="resetModulo('${m}')" style="color:var(--danger);border-color:var(--danger)"><i class="fas fa-trash-alt"></i> ${m.charAt(0).toUpperCase() + m.slice(1)}</button>
          `).join('')}
        </div>
        <hr style="margin:20px 0">
        <button class="btn btn-danger btn-lg btn-block" onclick="resetModulo('todo')"><i class="fas fa-exclamation-triangle"></i> REINICIAR TODO (Eliminar todos los datos de clientes)</button>
        <div style="margin-top:10px;font-size:12px;color:var(--gray-300)"><i class="fas fa-info-circle"></i> Las ofertas y pagos registrados no se eliminan con el reset total.</div>
      </div>
    </div>
  `;
}

async function aprobarPago(id) {
  try {
    await request(`/superadmin/pagos/${id}`, { method: 'PUT', body: JSON.stringify({ estado: 'aprobado' }) });
    Swal.fire({ icon: 'success', title: 'Pago aprobado', text: 'Suscripcion activada automaticamente', timer: 2000, showConfirmButton: false });
    renderSaPagos();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

function mostrarPago() {
  const clientes = window._saClientes || [];
  abrirModal('Registrar Pago', `
    <form id="formPago">
      <div class="form-group"><label>Cliente *</label>
        <select id="pagoCliente">${clientes.map(c => `<option value="${c.id}">${c.nombre} - ${c.email}</option>`).join('')}</select>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Monto *</label><input type="number" step="0.01" id="pagoMonto" required></div>
        <div class="form-group"><label>Metodo</label><select id="pagoMetodo"><option value="transferencia">Transferencia</option><option value="nequi">Nequi</option><option value="daviplata">Daviplata</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Concepto</label><input type="text" id="pagoConcepto" placeholder="Ej: Licencia anual"></div>
        <div class="form-group"><label>Referencia</label><input type="text" id="pagoReferencia" placeholder="Numero de transaccion"></div>
      </div>
    </form>
  `, `<button class="btn btn-success" onclick="guardarPago()"><i class="fas fa-save"></i> Registrar</button>`);
}

async function guardarPago() {
  try {
    await request('/superadmin/pagos', { method: 'POST', body: JSON.stringify({
      usuario_id: parseInt(document.getElementById('pagoCliente').value),
      monto: parseFloat(document.getElementById('pagoMonto').value),
      metodo: document.getElementById('pagoMetodo').value,
      concepto: document.getElementById('pagoConcepto').value,
      referencia: document.getElementById('pagoReferencia').value
    })});
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Pago registrado', timer: 1500, showConfirmButton: false });
    renderSaPagos();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function resetModulo(modulo) {
  const nom = modulo === 'todo' ? 'TODA LA BASE DE DATOS' : modulo;
  const result = await Swal.fire({ title: `Resetear ${nom}`, text: `Estas seguro? Esta accion NO se puede deshacer.`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#E17055', confirmButtonText: 'Si, resetear', cancelButtonText: 'Cancelar' });
  if (!result.isConfirmed) return;
  const pwd = await Swal.fire({ title: 'Confirmacion', input: 'password', html: 'Escribe <strong>CONFIRMAR</strong> para proceder', inputPlaceholder: 'Escribe CONFIRMAR', confirmButtonText: 'Resetear', showCancelButton: true, preConfirm: v => { if (v !== 'CONFIRMAR') { Swal.showValidationMessage('Debes escribir CONFIRMAR'); } } });
  if (!pwd.isConfirmed) return;
  try {
    await request(`/superadmin/reset/${modulo}`, { method: 'POST' });
    Swal.fire({ icon: 'success', title: `${nom} reiniciado`, timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

const CARACTERISTICAS_DISPONIBLES = [
  { id: 'inventario', label: 'Inventario completo', icono: 'fa-box' },
  { id: 'ventas', label: 'Ventas ilimitadas', icono: 'fa-shopping-cart' },
  { id: 'empleados', label: 'Gestion de empleados', icono: 'fa-users' },
  { id: 'dashboard', label: 'Dashboard analitico', icono: 'fa-chart-line' },
  { id: 'proveedores', label: 'Proveedores', icono: 'fa-truck' },
  { id: 'apertura', label: 'Apertura y cierre de caja', icono: 'fa-cash-register' },
  { id: 'logs', label: 'Auditoria y logs', icono: 'fa-clipboard-list' },
  { id: 'api', label: 'Integracion de APIs', icono: 'fa-plug' },
  { id: 'soporte', label: 'Soporte prioritario 24/7', icono: 'fa-headset' },
  { id: 'multi_tienda', label: 'Multi-tienda', icono: 'fa-store-alt' },
  { id: 'capacitacion', label: 'Capacitacion incluida', icono: 'fa-graduation-cap' },
  { id: 'personalizacion', label: 'Personalizacion de marca', icono: 'fa-paint-brush' }
];

function mostrarFormOferta(id = null) {
  const ofertas = window._saOfertas || [];
  const oferta = id ? ofertas.find(o => o.id === id) : null;
  const caracts = oferta ? JSON.parse(oferta.caracteristicas || '[]') : CARACTERISTICAS_DISPONIBLES.map(c => c.id);
  abrirModal(id ? 'Editar Oferta' : 'Nueva Oferta de Software', `
    <form id="formOferta">
      <div class="form-group"><label>Nombre de la Oferta *</label><input type="text" id="ofertaNombre" value="${oferta?.nombre || ''}" required oninput="this.value=validators.nombrePropio(this.value)" maxlength="80"></div>
      <div class="form-group"><label>Descripcion</label><textarea id="ofertaDescripcion" style="resize:vertical">${oferta?.descripcion || ''}</textarea></div>
      <div class="form-row">
        <div class="form-group"><label>Precio Software *</label><input type="number" step="0.01" id="ofertaPrecio" value="${oferta?.precio || ''}" required></div>
        <div class="form-group"><label id="labelPrecioMensual">Precio Mensual (Cloud)</label>
          <input type="number" step="0.01" id="ofertaPrecioMensual" value="${oferta?.precio_mensual || 0}" placeholder="0 = solo pago unico"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Tipo de Pago *</label>
          <select id="ofertaTipoPago" onchange="cambioTipoPago()">
            <option value="unico" ${oferta?.tipo_pago === 'unico' ? 'selected' : ''}>Pago Unico (Offline) - Sin mensualidad</option>
            <option value="mensual" ${oferta?.tipo_pago === 'mensual' ? 'selected' : ''}>Mensual (Online) - Software + Cloud</option>
            <option value="anual" ${oferta?.tipo_pago === 'anual' ? 'selected' : ''}>Anual (Online) - Software + Cloud</option>
          </select>
        </div>
        <div class="form-group"><label>Duracion (dias) *</label><input type="number" id="ofertaDuracion" min="1" value="${oferta?.duracion_dias || 365}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Activo</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px">
            <input type="checkbox" id="ofertaActivo" ${oferta?.activo !== 0 ? 'checked' : ''}> Oferta disponible para asignar
          </label>
        </div>
        <div class="form-group"><label>Mostrar en Landing</label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin-top:6px">
            <input type="checkbox" id="ofertaLanding" ${oferta ? (oferta.mostrar_landing !== 0 ? 'checked' : '') : ''}> Incluir en pagina publica
          </label>
        </div>
      </div>
      <div class="form-group"><label>Caracteristicas incluidas</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${CARACTERISTICAS_DISPONIBLES.map(c => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--gray-100);border-radius:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" name="ofertaCaracteristica" value="${c.id}" ${caracts.includes(c.id) ? 'checked' : ''}> <i class="fas ${c.icono}" style="color:var(--primary);width:16px"></i> ${c.label}
          </label>`).join('')}
        </div>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarOferta(${id || ''})"><i class="fas fa-save"></i> Guardar Oferta</button>`);
  cambioTipoPago();
}

function cambioTipoPago() {
  const tipo = document.getElementById('ofertaTipoPago')?.value;
  const pmInput = document.getElementById('ofertaPrecioMensual');
  const labelPm = document.getElementById('labelPrecioMensual');
  if (tipo === 'unico') {
    pmInput.disabled = true;
    pmInput.value = 0;
    pmInput.style.opacity = 0.4;
    if (labelPm) labelPm.style.opacity = 0.4;
  } else {
    pmInput.disabled = false;
    pmInput.style.opacity = 1;
    if (labelPm) labelPm.style.opacity = 1;
  }
}

async function guardarOferta(id = null) {
  const caracts = Array.from(document.querySelectorAll('input[name="ofertaCaracteristica"]:checked')).map(c => c.value);
  const data = {
    nombre: document.getElementById('ofertaNombre').value,
    descripcion: document.getElementById('ofertaDescripcion').value,
    precio: parseFloat(document.getElementById('ofertaPrecio').value),
    precio_mensual: parseFloat(document.getElementById('ofertaPrecioMensual').value) || 0,
    duracion_dias: parseInt(document.getElementById('ofertaDuracion').value),
    tipo_pago: document.getElementById('ofertaTipoPago').value,
    caracteristicas: caracts,
    activo: document.getElementById('ofertaActivo').checked ? 1 : 0,
    mostrar_landing: document.getElementById('ofertaLanding').checked ? 1 : 0
  };
  try {
    if (id) { await request(`/superadmin/ofertas/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await request('/superadmin/ofertas', { method: 'POST', body: JSON.stringify(data) }); }
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Oferta guardada', timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarOferta(id) {
  const result = await Swal.fire({ title: 'Eliminar Oferta', text: 'Estas seguro?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/superadmin/ofertas/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1500, showConfirmButton: false }); renderSuperAdmin(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function mostrarAsignarSuscripcion() {
  try {
    const [ofertas, clientes] = await Promise.all([request('/superadmin/ofertas'), request('/superadmin/clientes')]);
    const activas = ofertas.filter(o => o.activo);
    abrirModal('Asignar Suscripcion', `
      <form id="formSuscripcion">
        <div class="form-group"><label>Cliente</label>
          <select id="suscCliente">${clientes.map(c => `<option value="${c.id}">${c.nombre} - ${c.email}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>Oferta</label>
          <select id="suscOferta">${activas.map(o => `<option value="${o.id}">${o.nombre} - $${Number(o.precio).toLocaleString('es-CO')} (${o.duracion_dias} dias)</option>`).join('')}</select>
        </div>
      </form>
    `, `<button class="btn btn-success" onclick="asignarSuscripcion()"><i class="fas fa-check"></i> Asignar</button>`);
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function asignarSuscripcion() {
  try {
    await request('/superadmin/suscripciones', { method: 'POST', body: JSON.stringify({ usuario_id: parseInt(document.getElementById('suscCliente').value), oferta_id: parseInt(document.getElementById('suscOferta').value) }) });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Suscripcion asignada', timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ API INTEGRACION ================
async function renderApi() {
  const container = document.getElementById('moduleApi');
  container.innerHTML = '<div class="text-center" style="padding:60px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="loader-ripple"><div></div><div></div></div><p class="mt-20 text-muted">Cargando integraciones de API...</p></div>';
  try {
    const [apis, tipos] = await Promise.all([request('/api-integracion'), request('/api-integracion/tipos')]);
    container.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
        <button class="btn btn-primary" onclick="mostrarFormApi()"><i class="fas fa-plus"></i> Nueva Integracion</button>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h3><i class="fas fa-camera"></i> Escaner de Codigo de Barras</h3></div>
        <div class="card-body text-center">
          <div style="font-size:48px;color:var(--primary);margin-bottom:10px"><i class="fas fa-barcode"></i></div>
          <p style="color:var(--gray-300);margin-bottom:15px;font-size:14px">Escanea codigos de barras de productos usando la camara de tu dispositivo. Compatible con EAN-13, EAN-8 y Code 128.</p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-lg" onclick="iniciarScanner()"><i class="fas fa-camera"></i> Iniciar Escaner</button>
          </div>
          <div id="scannerResult" style="margin-top:15px;display:none">
            <div class="status-badge success" style="font-size:14px;padding:8px 20px">
              <i class="fas fa-check-circle"></i> Codigo: <strong id="scannerCodigo">-</strong>
            </div>
            <div id="scannerProductoInfo" style="margin-top:10px"></div>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:15px;margin-bottom:20px">
        ${tipos.map(t => `
          <div class="card" style="cursor:pointer;border:1px dashed var(--gray-200)" onclick="mostrarFormApi('${t.id}')">
            <div class="card-body text-center" style="padding:25px">
              <div style="font-size:40px;margin-bottom:10px;color:var(--primary)"><i class="fas fa-${t.icono}"></i></div>
              <h4>${t.nombre}</h4>
              <p class="text-muted" style="font-size:12px;margin-top:5px">${t.descripcion}</p>
              <button class="btn btn-sm btn-primary mt-10"><i class="fas fa-plus"></i> Configurar</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <div class="card-header"><h3>Integraciones Configuradas</h3></div>
        <div class="card-body" style="padding:0">
          <div class="table-container"><table>
            <thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
            <tbody>${apis.length ? apis.map(a => `<tr>
              <td><strong>${a.nombre}</strong></td>
              <td><span class="status-badge info">${a.tipo}</span></td>
              <td><span class="status-badge ${a.activo ? 'success' : 'danger'}">${a.activo ? 'Activo' : 'Inactivo'}</span></td>
              <td>${a.created_at}</td>
              <td>
                <button class="btn btn-sm btn-info" onclick="probarApi(${a.id})"><i class="fas fa-plug"></i></button>
                <button class="btn btn-sm btn-primary" onclick="mostrarFormApi('${a.tipo}', ${a.id})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="eliminarApi(${a.id})"><i class="fas fa-trash"></i></button>
              </td>
            </tr>`) : '<tr><td colspan="5" class="text-center text-muted">Sin integraciones configuradas</td></tr>'}</tbody>
          </table></div>
        </div>
      </div>
    `;
  } catch (err) { container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`; }
}

function iniciarScanner() {
  escanearCodigo(async (codigo) => {
    document.getElementById('scannerResult').style.display = 'block';
    document.getElementById('scannerCodigo').textContent = codigo;
    document.getElementById('scannerProductoInfo').innerHTML = '<p class="text-muted"><i class="fas fa-spinner animate-spin"></i> Buscando producto...</p>';
    try {
      const productos = await request('/inventario');
      const prod = productos.find(p => p.codigo_barras === codigo);
      if (prod) {
        document.getElementById('scannerProductoInfo').innerHTML = `
          <div class="card" style="margin-top:10px;text-align:left">
            <div class="card-body" style="display:flex;align-items:center;gap:15px">
              <div style="font-size:40px;color:var(--success)"><i class="fas fa-check-circle"></i></div>
              <div>
                <strong style="font-size:18px">${prod.nombre}</strong><br>
                <span class="text-muted">Stock: ${prod.stock} | Precio: $${Number(prod.precio_venta).toLocaleString('es-CO')}</span>
              </div>
            </div>
          </div>
        `;
      } else {
        document.getElementById('scannerProductoInfo').innerHTML = `
          <div class="card" style="margin-top:10px;background:rgba(225,112,85,0.05);text-align:center;padding:15px">
            <p><i class="fas fa-exclamation-circle" style="color:var(--danger)"></i> Producto no encontrado en el inventario</p>
            <button class="btn btn-sm btn-primary mt-10" onclick="cargarModulo('inventario')"><i class="fas fa-plus"></i> Agregar producto</button>
          </div>
        `;
      }
    } catch {
      document.getElementById('scannerProductoInfo').innerHTML = '<p class="text-muted">Error al buscar producto</p>';
    }
  });
}

function mostrarFormApi(tipoPreseleccionado = '', id = null) {
  abrirModal(id ? 'Editar Integracion' : 'Nueva Integracion API', `
    <form id="formApi">
      <div class="form-group"><label>Nombre *</label><input type="text" id="apiNombre" required></div>
      <div class="form-group"><label>Tipo de Integracion</label>
        <select id="apiTipo"><option value="barcode">Escaner Codigo Barras</option><option value="pago">Pasarela de Pago</option><option value="facturacion">Facturacion Electronica</option><option value="ecommerce">E-commerce</option><option value="inventario_externo">Inventario Externo</option></select>
      </div>
      <div class="form-group"><label>Configuracion (JSON)</label>
        <textarea id="apiConfig" style="resize:vertical;font-family:monospace;min-height:100px">${id ? '{}' : '{\n  "api_key": "",\n  "endpoint": "",\n  "webhook": ""\n}'}</textarea>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarApi(${id || ''})"><i class="fas fa-save"></i> Guardar</button>`);
  if (tipoPreseleccionado) document.getElementById('apiTipo').value = tipoPreseleccionado;
}

async function guardarApi(id = null) {
  try {
    let config = {};
    try { config = JSON.parse(document.getElementById('apiConfig').value); } catch { return Swal.fire({ icon: 'error', title: 'JSON invalido' }); }
    const data = {
      nombre: document.getElementById('apiNombre').value,
      tipo: document.getElementById('apiTipo').value,
      configuracion: config
    };
    if (id) { await request(`/api-integracion/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await request('/api-integracion', { method: 'POST', body: JSON.stringify(data) }); }
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'API configurada', timer: 1500, showConfirmButton: false });
    renderApi();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function probarApi(id) {
  try {
    const data = await request(`/api-integracion/probar/${id}`, { method: 'POST' });
    Swal.fire({ icon: 'success', title: 'Conexion Exitosa', text: data.mensaje });
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error de Conexion', text: err.message }); }
}

async function eliminarApi(id) {
  const result = await Swal.fire({ title: 'Eliminar Integracion', text: 'Estas seguro?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar' });
  if (!result.isConfirmed) return;
  try { await request(`/api-integracion/${id}`, { method: 'DELETE' }); Swal.fire({ icon: 'success', title: 'Eliminada', timer: 1500, showConfirmButton: false }); renderApi(); }
  catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ GESTION CLIENTES SUPER ADMIN ================
async function toggleCliente(id, activo) {
  const action = activo ? 'desactivar' : 'activar';
  const result = await Swal.fire({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} cliente`, text: `Estas seguro de ${action} este cliente?`, icon: 'warning', showCancelButton: true, confirmButtonText: `Si, ${action}` });
  if (!result.isConfirmed) return;
  try {
    await request(`/superadmin/clientes/${id}/toggle`, { method: 'PUT' });
    Swal.fire({ icon: 'success', title: `Cliente ${activo ? 'desactivado' : 'activado'}`, timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function verDetalleCliente(id) {
  try {
    const c = await request(`/superadmin/clientes/${id}`);
    const activo = c.activo !== 0;
    const diasDemo = c.trial_end ? Math.ceil((new Date(c.trial_end + 'Z') - new Date()) / 86400000) : null;
    const formatPeso = n => '$' + Number(n).toLocaleString('es-CO');
    Swal.fire({
      title: c.nombre,
      html: `
        <div style="text-align:left;font-size:14px">
          <div class="form-row" style="margin-bottom:10px">
            <div><strong>Email:</strong> ${c.email}</div>
            <div><strong>Telefono:</strong> ${c.telefono || '-'}</div>
          </div>
          <div class="form-row" style="margin-bottom:10px">
            <div><strong>Estado:</strong> <span class="status-badge ${activo ? 'success' : 'danger'}">${activo ? 'Activo' : 'Inactivo'}</span></div>
            <div><strong>Rol:</strong> ${c.rol_nombre || '-'}</div>
          </div>
          <hr style="margin:10px 0">
          <div class="form-row" style="margin-bottom:10px">
            <div><strong>Plan actual:</strong> ${c.plan_actual || 'Sin plan'}</div>
            <div><strong>Suscripcion:</strong> <span class="status-badge ${c.estado_suscripcion === 'activa' ? 'success' : 'warning'}">${c.estado_suscripcion || 'inactiva'}</span></div>
          </div>
          <div class="form-row" style="margin-bottom:10px">
            <div><strong>Inicio susc:</strong> ${c.suscripcion_inicio || '-'}</div>
            <div><strong>Fin susc:</strong> ${c.suscripcion_fin || '-'}</div>
          </div>
          <div class="form-row" style="margin-bottom:10px">
            <div><strong>Trial ends:</strong> ${c.trial_end || '-'}</div>
            <div><strong>Dias demo rest:</strong> ${diasDemo !== null ? (diasDemo > 0 ? `${diasDemo} dias` : 'Expirado') : '-'}</div>
          </div>
          <hr style="margin:10px 0">
          <div class="form-row">
            <div><strong>Productos:</strong> ${c.total_productos || 0}</div>
            <div><strong>Ventas:</strong> ${c.total_ventas || 0}</div>
          </div>
          <div><strong>Total ingresos:</strong> ${formatPeso(c.total_ingresos || 0)}</div>
        </div>
      `,
      width: 600,
      confirmButtonText: 'Cerrar'
    });
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function extenderDemo(id) {
  const { value: dias } = await Swal.fire({
    title: 'Extender Periodo Demo',
    input: 'number',
    inputLabel: 'Dias a agregar',
    inputValue: 15,
    inputAttributes: { min: 1, max: 365, step: 1 },
    showCancelButton: true,
    confirmButtonText: 'Extender',
    cancelButtonText: 'Cancelar'
  });
  if (!dias) return;
  try {
    await request(`/superadmin/clientes/${id}/demo`, { method: 'PUT', body: JSON.stringify({ dias: parseInt(dias) }) });
    Swal.fire({ icon: 'success', title: 'Demo extendido', text: `${dias} dias agregados`, timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function cambiarPlanCliente(id) {
  try {
    const ofertas = await request('/superadmin/ofertas');
    const activas = ofertas.filter(o => o.activo === 1);
    if (!activas.length) return Swal.fire({ icon: 'error', title: 'Sin ofertas', text: 'No hay ofertas activas disponibles.' });
    const { value: ofertaId } = await Swal.fire({
      title: 'Asignar Plan',
      input: 'select',
      inputOptions: Object.fromEntries(activas.map(o => [o.id, `${o.nombre} - $${Number(o.precio).toLocaleString('es-CO')}`])),
      inputPlaceholder: 'Selecciona un plan',
      showCancelButton: true,
      confirmButtonText: 'Asignar',
      cancelButtonText: 'Cancelar'
    });
    if (!ofertaId) return;
    await request(`/superadmin/clientes/${id}/suscripcion`, { method: 'PUT', body: JSON.stringify({ oferta_id: parseInt(ofertaId) }) });
    Swal.fire({ icon: 'success', title: 'Plan asignado', timer: 1500, showConfirmButton: false });
    renderSuperAdmin();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ INICIALIZACION LOTTIE ================
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof lottie !== 'undefined') {
      lottie.loadAnimation({
        container: document.getElementById('loginLottie'),
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'https://assets10.lottiefiles.com/packages/lf20_touohxv0.json'
      });
    }
  } catch {}
});

// ================ AUTOMATIZACION DE ESCANER Y NOTIFICACIONES ================
function toggleNotifications(event) {
  if (event) event.stopPropagation();
  const dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  const isHidden = dropdown.style.display === 'none';
  dropdown.style.display = isHidden ? 'block' : 'none';
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('notificationDropdown');
  const bell = document.getElementById('notifBell');
  if (dropdown && dropdown.style.display !== 'none') {
    if (!dropdown.contains(e.target) && (!bell || !bell.contains(e.target))) {
      dropdown.style.display = 'none';
    }
  }
});

function actualizarNotificaciones(data) {
  window._lastNotifData = data;
  const badge = document.getElementById('notificationBadge');
  const countSpan = document.getElementById('notificationCount');
  const listContainer = document.getElementById('notificationList');
  if (!badge || !listContainer) return;

  const lowStockList = data.productosAgotarse || [];
  const expiringList = data.productosVencimiento || [];

  let unseenCount = 0;
  lowStockList.forEach(p => {
    const seenStock = localStorage.getItem(`seen_stock_${p.id}`);
    if (seenStock !== String(p.stock)) {
      unseenCount++;
    }
  });
  expiringList.forEach(p => {
    const seenVenc = localStorage.getItem(`seen_venc_${p.id}`);
    if (seenVenc !== String(p.fecha_vencimiento)) {
      unseenCount++;
    }
  });

  if (unseenCount > 0) {
    badge.textContent = unseenCount;
    badge.style.display = 'flex';
    if (countSpan) countSpan.textContent = unseenCount;
  } else {
    badge.style.display = 'none';
    if (countSpan) countSpan.textContent = '0';
  }

  let html = '';

  const totalNotifications = lowStockList.length + expiringList.length;

  if (totalNotifications === 0) {
    html = `
      <div style="padding:15px;text-align:center;color:var(--gray-300);font-size:13px">
        <i class="fas fa-bell-slash" style="font-size:24px;margin-bottom:8px;display:block"></i>
        No tienes notificaciones pendientes
      </div>
    `;
  } else {
    if (unseenCount > 0) {
      html += `
        <div style="display:flex;justify-content:flex-end;padding:4px 8px;border-bottom:1px solid var(--gray-100)">
          <button class="btn btn-sm btn-outline" onclick="marcarNotificacionesLeidas()" style="padding:2px 8px;font-size:11px"><i class="fas fa-check"></i> Marcar como leídas</button>
        </div>
      `;
    }

    lowStockList.forEach(p => {
      const isOut = p.stock === 0;
      const isSeen = localStorage.getItem(`seen_stock_${p.id}`) === String(p.stock);
      const bgOpacity = isSeen ? '0.01' : '0.04';
      const textStyle = isSeen ? 'color:var(--gray-300);font-weight:400' : 'font-weight:700;color:var(--dark)';
      html += `
        <div class="notification-item" onclick="window._invFilterType = 'bajo_stock'; cargarModulo('inventario', true); toggleNotifications()" style="padding:8px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;font-size:12px;border-bottom:1px solid var(--gray-100);background:rgba(108,92,231,${bgOpacity})">
          <div style="background:${isOut ? 'rgba(225,112,85,0.1)' : 'rgba(253,203,110,0.2)'};color:${isOut ? 'var(--danger)' : '#B7950B'};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas ${isOut ? 'fa-ban' : 'fa-exclamation-triangle'}"></i>
          </div>
          <div style="flex:1">
            <div style="${textStyle}">${p.nombre}</div>
            <div style="color:var(--gray-300);margin-top:2px">${isOut ? '¡Sin stock disponible!' : `Stock mínimo: ${p.stock}/${p.stock_minimo}`}</div>
          </div>
        </div>
      `;
    });

    expiringList.forEach(p => {
      const isUrgent = p.dias_restantes <= 7;
      const isSeen = localStorage.getItem(`seen_venc_${p.id}`) === String(p.fecha_vencimiento);
      const bgOpacity = isSeen ? '0.01' : '0.04';
      const textStyle = isSeen ? 'color:var(--gray-300);font-weight:400' : 'font-weight:700;color:var(--dark)';
      html += `
        <div class="notification-item" onclick="window._invFilterType = 'por_vencer'; cargarModulo('inventario', true); toggleNotifications()" style="padding:8px;cursor:pointer;display:flex;align-items:flex-start;gap:10px;font-size:12px;border-bottom:1px solid var(--gray-100);background:rgba(108,92,231,${bgOpacity})">
          <div style="background:${isUrgent ? 'rgba(225,112,85,0.1)' : 'rgba(108,92,231,0.1)'};color:${isUrgent ? 'var(--danger)' : 'var(--primary)'};border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fas fa-calendar-times"></i>
          </div>
          <div style="flex:1">
            <div style="${textStyle}">${p.nombre}</div>
            <div style="color:var(--gray-300);margin-top:2px">${p.dias_restantes <= 0 ? '¡Vencido!' : `Pronto a vencer: ${p.dias_restantes} días (${p.fecha_vencimiento})`}</div>
          </div>
        </div>
      `;
    });
  }

  listContainer.innerHTML = html;
}

function marcarNotificacionesLeidas() {
  const data = window._lastNotifData;
  if (!data) return;
  const lowStockList = data.productosAgotarse || [];
  const expiringList = data.productosVencimiento || [];
  lowStockList.forEach(p => {
    localStorage.setItem(`seen_stock_${p.id}`, String(p.stock));
  });
  expiringList.forEach(p => {
    localStorage.setItem(`seen_venc_${p.id}`, String(p.fecha_vencimiento));
  });
  actualizarNotificaciones(data);
}

function handleVentaBarcodeKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const barcode = event.target.value.trim();
    if (barcode) {
      agregarProductoPorCodigo(barcode);
    }
  }
}

function agregarProductoPorCodigo(code) {
  const productos = window._ventasProductos || [];
  const prod = productos.find(p => p.codigo_barras === code);
  if (!prod) {
    Swal.fire({ icon: 'error', title: 'Producto no encontrado', text: `No existe un producto con el código de barras: ${code}`, timer: 2000, showConfirmButton: false });
    return;
  }
  if (prod.stock <= 0) {
    Swal.fire({ icon: 'error', title: 'Stock insuficiente', text: `El producto "${prod.nombre}" no tiene stock disponible.`, timer: 2000, showConfirmButton: false });
    return;
  }
  
  const existente = window._ventaItems.find(i => i.id === prod.id);
  if (existente) {
    if (existente.cantidad + 1 > prod.stock) {
      Swal.fire({ icon: 'error', title: 'Stock insuficiente', text: `No puedes agregar más de ${prod.stock} unidades de "${prod.nombre}".`, timer: 2000, showConfirmButton: false });
      return;
    }
    existente.cantidad += 1;
  } else {
    window._ventaItems.push({
      id: prod.id,
      nombre: prod.nombre,
      precio: parseFloat(prod.precio_venta),
      cantidad: 1,
      stock: prod.stock
    });
  }
  
  // Reproducir un pitido rápido para feedback de escaneo
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.error('Audio beep failed', e);
  }

  actualizarTotalVenta();
  
  // Limpiar y re-enfocar la entrada
  setTimeout(() => {
    const input = document.getElementById('ventaBarcodeScan');
    if (input) {
      input.value = '';
      input.focus();
    }
  }, 50);
}

// ================ INVENTARIO TABS (DEVOLUCIONES & CALENDARIO) ================
function switchInventarioTab(tabName) {
  const btns = document.querySelectorAll('#moduleInventario .tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  
  document.getElementById('inventarioProductosView').style.display = 'none';
  document.getElementById('inventarioDevolucionesView').style.display = 'none';
  document.getElementById('inventarioCalendarioView').style.display = 'none';
  
  if (tabName === 'productos') {
    document.getElementById('tabInvProductos').classList.add('active');
    document.getElementById('inventarioProductosView').style.display = 'block';
  } else if (tabName === 'devoluciones') {
    document.getElementById('tabInvDevoluciones').classList.add('active');
    document.getElementById('inventarioDevolucionesView').style.display = 'block';
    cargarDevoluciones();
  } else if (tabName === 'calendario') {
    document.getElementById('tabInvCalendario').classList.add('active');
    document.getElementById('inventarioCalendarioView').style.display = 'block';
    cargarCalendarioProveedores();
  }
}

async function cargarDevoluciones() {
  const tbody = document.getElementById('tablaDevoluciones');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">Cargando devoluciones...</td></tr>';
  try {
    const data = await request('/inventario/devoluciones');
    const fmt = n => '$' + Number(n).toLocaleString('es-CO');
    tbody.innerHTML = data.length ? data.map(d => {
      const isPendiente = d.estado === 'pendiente';
      return `
        <tr>
          <td>${d.created_at}</td>
          <td><code>${d.codigo_barras || '-'}</code></td>
          <td><strong>${d.producto_nombre}</strong></td>
          <td>${d.proveedor_nombre}</td>
          <td>${d.cantidad}</td>
          <td>${fmt(d.precio_compra)}</td>
          <td><span class="status-badge warning">${d.motivo.toUpperCase()}</span></td>
          <td><span class="status-badge ${isPendiente ? 'danger' : 'success'}">${d.estado.toUpperCase()}</span></td>
          <td>
            ${isPendiente ? `
              <button class="btn btn-sm btn-success" onclick="marcarDevolucionEstado(${d.id}, 'devuelto')" title="Completar Devolución"><i class="fas fa-check"></i> Entregado</button>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">No hay devoluciones registradas</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger" style="padding:20px">Error: ${err.message}</td></tr>`; }
}

function mostrarFormDevolucion() {
  const prods = window._invProductos || [];
  const provs = window._invProveedores || [];
  abrirModal('Registrar Devolución a Proveedor', `
    <form id="formDevolucion">
      <div class="form-group">
        <label>Seleccionar Producto</label>
        <select id="devProductoId" onchange="actualizarMaxDevolucion(this.value)">
          <option value="">Seleccione un producto...</option>
          ${prods.map(p => `<option value="${p.id}" data-stock="${p.stock}">${p.nombre} (Stock: ${p.stock})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad a Devolver (Máximo disponible: <span id="devMaxStock">0</span>)</label>
        <input type="number" id="devCantidad" min="1" value="1" required>
      </div>
      <div class="form-group">
        <label>Proveedor</label>
        <select id="devProveedorId">
          <option value="">Seleccione un proveedor...</option>
          ${provs.map(p => `<option value="${p.id}">${p.nombre_empresa}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Motivo de Devolución</label>
        <select id="devMotivo">
          <option value="vencido">Producto Vencido</option>
          <option value="defectuoso">Defecto de Fábrica / Avería</option>
          <option value="otro">Otro motivo</option>
        </select>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarDevolucion()"><i class="fas fa-save"></i> Registrar Devolución</button>`);
}

function actualizarMaxDevolucion(prodId) {
  const select = document.getElementById('devProductoId');
  if (!select.value) {
    document.getElementById('devMaxStock').textContent = '0';
    return;
  }
  const option = select.selectedOptions[0];
  const stock = option.dataset.stock;
  document.getElementById('devMaxStock').textContent = stock;
  document.getElementById('devCantidad').max = stock;
}

async function guardarDevolucion() {
  const producto_id = parseInt(document.getElementById('devProductoId').value);
  const proveedor_id = parseInt(document.getElementById('devProveedorId').value);
  const cantidad = parseInt(document.getElementById('devCantidad').value);
  const motivo = document.getElementById('devMotivo').value;

  if (!producto_id || !proveedor_id || !cantidad || !motivo) {
    return Swal.fire({ icon: 'error', title: 'Campos requeridos', text: 'Por favor completa todos los campos del formulario.' });
  }

  const maxStock = parseInt(document.getElementById('devMaxStock').textContent);
  if (cantidad > maxStock) {
    return Swal.fire({ icon: 'error', title: 'Cantidad inválida', text: `No puedes devolver más productos de los disponibles en stock (${maxStock}).` });
  }

  try {
    await request('/inventario/devoluciones', {
      method: 'POST',
      body: JSON.stringify({ producto_id, proveedor_id, cantidad, motivo })
    });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Devolución registrada', text: 'El stock fue descontado y auditado.', timer: 2000, showConfirmButton: false });
    
    const [p] = await Promise.all([request('/inventario')]);
    window._invProductos = p;
    cargarDevoluciones();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function marcarDevolucionEstado(id, estado) {
  try {
    await request(`/inventario/devoluciones/${id}/estado`, {
      method: 'PUT',
      body: JSON.stringify({ estado })
    });
    Swal.fire({ icon: 'success', title: 'Estado actualizado', timer: 1500, showConfirmButton: false });
    cargarDevoluciones();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function cargarCalendarioProveedores() {
  const container = document.getElementById('calendarioVisitasList');
  if (!container) return;
  container.innerHTML = '<p class="text-center text-muted">Cargando agenda de visitas...</p>';
  try {
    const [visitas, devoluciones] = await Promise.all([
      request('/inventario/proveedores/visitas'),
      request('/inventario/devoluciones')
    ]);

    const prods = window._invProductos || [];

    container.innerHTML = visitas.length ? visitas.map(v => {
      const lowStockProds = prods.filter(p => p.proveedor_id === v.proveedor_id && p.stock <= p.stock_minimo);
      const pendingReturns = devoluciones.filter(d => d.proveedor_id === v.proveedor_id && d.estado === 'pendiente');

      let alertHtml = '';
      if (lowStockProds.length > 0 || pendingReturns.length > 0) {
        alertHtml = `
          <div style="background:rgba(253,203,110,0.15);border:1px solid rgba(253,203,110,0.4);border-radius:var(--radius-sm);padding:12px;margin-top:10px;font-size:13px">
            <strong style="color:#B7950B"><i class="fas fa-exclamation-circle"></i> Información relevante para la visita:</strong>
            <ul style="margin:5px 0 0 15px;padding:0;line-height:1.5">
              ${lowStockProds.length ? `<li style="color:#B7950B"><strong>Falta stock:</strong> Se deben comprar ${lowStockProds.length} productos con stock crítico: <em>${lowStockProds.map(p => `${p.nombre} (${p.stock}/${p.stock_minimo})`).join(', ')}</em></li>` : ''}
              ${pendingReturns.length ? `<li style="color:var(--danger)"><strong>Devoluciones pendientes:</strong> Hay ${pendingReturns.length} devoluciones por entregar: <em>${pendingReturns.map(d => `${d.producto_nombre} (x${d.cantidad})`).join(', ')}</em></li>` : ''}
            </ul>
          </div>
        `;
      }

      return `
        <div class="card" style="border:1px solid var(--gray-200);box-shadow:none;transition:var(--transition)">
          <div class="card-body" style="padding:15px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <h5 style="margin:0;font-size:15px;font-weight:700">${v.proveedor_nombre}</h5>
                <p style="font-size:12px;color:var(--gray-300);margin:2px 0 0 0">
                  <i class="fas fa-calendar-day"></i> Fecha agendada: <strong>${v.fecha_visita}</strong>
                </p>
              </div>
              <button class="btn btn-sm btn-danger" onclick="eliminarVisita(${v.id})" title="Eliminar visita"><i class="fas fa-trash"></i></button>
            </div>
            
            ${v.notes ? `<p style="font-size:13px;background:var(--gray-100);padding:8px 10px;border-radius:4px;margin:5px 0"><strong>Notas de visita:</strong> ${v.notes}</p>` : ''}
            
            <div style="font-size:12px;color:var(--gray-300);display:flex;gap:15px;margin-top:2px">
              <span><i class="fas fa-user"></i> Contacto: ${v.contacto_nombre || '-'}</span>
              <span><i class="fas fa-phone"></i> Tel: <a href="tel:${v.contacto_telefono}" style="color:inherit;text-decoration:none">${v.contacto_telefono || '-'}</a></span>
            </div>

            ${alertHtml}
          </div>
        </div>
      `;
    }).join('') : '<div class="text-center text-muted" style="padding:30px">No hay visitas de proveedores agendadas</div>';
  } catch (err) { container.innerHTML = `<p class="text-center text-danger">Error: ${err.message}</p>`; }
}

function mostrarFormVisita() {
  const provs = window._invProveedores || [];
  abrirModal('Agendar Visita de Proveedor', `
    <form id="formVisita">
      <div class="form-group">
        <label>Seleccionar Proveedor</label>
        <select id="visProveedorId">
          <option value="">Seleccione un proveedor...</option>
          ${provs.map(p => `<option value="${p.id}">${p.nombre_empresa}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Fecha de Visita</label>
        <input type="date" id="visFecha" min="${new Date().toISOString().split('T')[0]}" required>
      </div>
      <div class="form-group">
        <label>Notas / Recordatorios</label>
        <textarea id="visNotas" placeholder="Ej: Negociar descuento, verificar facturas pendientes..."></textarea>
      </div>
    </form>
  `, `<button class="btn btn-primary" onclick="guardarVisita()"><i class="fas fa-save"></i> Agendar Visita</button>`);
}

async function guardarVisita() {
  const proveedor_id = parseInt(document.getElementById('visProveedorId').value);
  const fecha_visita = document.getElementById('visFecha').value;
  const notas = document.getElementById('visNotas').value.trim();

  if (!proveedor_id || !fecha_visita) {
    return Swal.fire({ icon: 'error', title: 'Campos requeridos', text: 'Proveedor y fecha son campos obligatorios.' });
  }

  try {
    await request('/inventario/proveedores/visitas', {
      method: 'POST',
      body: JSON.stringify({ proveedor_id, fecha_visita, notas })
    });
    cerrarModal();
    Swal.fire({ icon: 'success', title: 'Visita agendada', timer: 1500, showConfirmButton: false });
    cargarCalendarioProveedores();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

async function eliminarVisita(id) {
  const result = await Swal.fire({
    title: '¿Eliminar Visita?',
    text: 'Esta acción no se puede deshacer.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;
  try {
    await request(`/inventario/proveedores/visitas/${id}`, { method: 'DELETE' });
    Swal.fire({ icon: 'success', title: 'Visita eliminada', timer: 1500, showConfirmButton: false });
    cargarCalendarioProveedores();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: err.message }); }
}

// ================ AUDITORIA TABS (SESIONES CAJA & REPORTES FINANCIEROS) ================
function switchLogsTab(tabName) {
  const btns = document.querySelectorAll('#moduleLogs .tab-btn');
  btns.forEach(b => b.classList.remove('active'));

  document.getElementById('logsAccionesView').style.display = 'none';
  document.getElementById('logsSesionesView').style.display = 'none';
  document.getElementById('logsReportesView').style.display = 'none';

  if (tabName === 'logs') {
    document.getElementById('tabLogsAcciones').classList.add('active');
    document.getElementById('logsAccionesView').style.display = 'block';
  } else if (tabName === 'sesiones') {
    document.getElementById('tabLogsSesiones').classList.add('active');
    document.getElementById('logsSesionesView').style.display = 'block';
    cargarSesionesCaja();
  } else if (tabName === 'reportes') {
    document.getElementById('tabLogsReportes').classList.add('active');
    document.getElementById('logsReportesView').style.display = 'block';
  }
}

async function cargarSesionesCaja() {
  const tbody = document.getElementById('tablaSesionesCaja');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">Cargando sesiones de caja...</td></tr>';
  try {
    const data = await request('/apertura/historial');
    const fmt = n => '$' + Number(n).toLocaleString('es-CO');
    tbody.innerHTML = data.length ? data.map(s => {
      const isApertura = s.tipo === 'apertura';
      const statusLabel = s.monto_final !== null ? 'Cerrada' : 'Abierta';
      const diff = s.monto_final !== null ? (s.monto_final - s.monto_inicial) : 0;
      return `
        <tr>
          <td>${s.created_at}</td>
          <td><strong>${s.usuario_nombre}</strong></td>
          <td>${fmt(s.monto_inicial)}</td>
          <td>${s.monto_final !== null ? fmt(s.monto_final) : '-'}</td>
          <td>${s.monto_final !== null ? fmt(diff) : '-'}</td>
          <td><span class="status-badge ${s.monto_final !== null ? 'success' : 'danger'}">${statusLabel.toUpperCase()}</span></td>
          <td>
            <button class="btn btn-sm btn-info" onclick="imprimirDetalleSesion(${s.id})" title="Imprimir Detalle de Caja"><i class="fas fa-print"></i> Historial</button>
          </td>
        </tr>
      `;
    }).join('') : '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">No hay sesiones registradas</td></tr>';
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger" style="padding:20px">Error: ${err.message}</td></tr>`; }
}

async function imprimirDetalleSesion(id) {
  try {
    const data = await request(`/logs/historial-sesion/${id}`);
    const s = data.session;
    const sales = data.sales || [];
    const salesDetails = data.salesDetails || [];
    const logs = data.logs || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) return Swal.fire({ icon: 'error', title: 'Bloqueador de ventanas emergentes activo', text: 'Por favor permite ventanas emergentes para imprimir.' });

    const fmt = n => '$' + Number(n).toLocaleString('es-CO');

    let itemsHtml = '';
    salesDetails.forEach(item => {
      itemsHtml += `
        <tr>
          <td>${item.codigo_barras || '-'}</td>
          <td>${item.producto_nombre}</td>
          <td>${item.cantidad}</td>
          <td>${fmt(item.precio_unitario)}</td>
          <td>${fmt(item.subtotal)}</td>
        </tr>
      `;
    });

    let salesHtml = '';
    sales.forEach(sale => {
      salesHtml += `
        <tr>
          <td>#${sale.id}</td>
          <td>${sale.created_at}</td>
          <td>${sale.metodo_pago.toUpperCase()}</td>
          <td>${fmt(sale.total)}</td>
        </tr>
      `;
    });

    let logsHtml = '';
    logs.forEach(log => {
      logsHtml += `
        <li>[${log.created_at}] <strong>${log.accion}</strong>: ${log.detalle || ''}</li>
      `;
    });

    const diff = s.monto_final !== null ? (s.monto_final - (s.monto_inicial + sales.reduce((sum, v) => sum + v.total, 0))) : 0;
    const diffText = diff === 0 ? 'Caja Cuadrada' : diff > 0 ? `Sobrante: ${fmt(diff)}` : `Faltante: ${fmt(Math.abs(diff))}`;

    printWindow.document.write(`
      <html>
      <head>
        <title>Auditoría de Caja - Sesión #${s.id}</title>
        <style>
          body { font-family: 'Outfit', 'Inter', sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          h2 { margin: 5px 0; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .totals { font-size: 14px; font-weight: bold; margin-top: 10px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>AUDITORÍA DE CAJA - SESIÓN #${s.id}</h2>
          <p><strong>Tienda:</strong> ${window._storeConfig?.tienda_nombre || 'TuTienda'}</p>
          <p><strong>Cajero responsable:</strong> ${s.usuario_nombre}</p>
        </div>

        <div class="section">
          <div class="section-title">Resumen Financiero de Sesión</div>
          <table>
            <tr><th>Monto Inicial</th><td>${fmt(s.monto_inicial)}</td></tr>
            <tr><th>Ingresos por Ventas</th><td>${fmt(sales.reduce((sum, v) => sum + v.total, 0))}</td></tr>
            <tr><th>Monto Final Reportado</th><td>${s.monto_final !== null ? fmt(s.monto_final) : 'Caja Aún Abierta'}</td></tr>
            <tr><th>Estado / Desfase</th><td><strong>${diffText}</strong></td></tr>
          </table>
          <p><strong>Observaciones:</strong> ${s.observaciones || 'Sin observaciones'}</p>
        </div>

        <div class="section">
          <div class="section-title">Ventas Registradas (${sales.length})</div>
          <table>
            <thead>
              <tr><th>Venta ID</th><th>Fecha</th><th>Método de Pago</th><th>Total</th></tr>
            </thead>
            <tbody>
              ${salesHtml || '<tr><td colspan="4">No se registraron ventas en esta sesión</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Productos Vendidos (Desglose)</div>
          <table>
            <thead>
              <tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Precio Unitario</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="5">No se vendieron productos en esta sesión</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">Bitácora de Auditoría (Logs de Sesión)</div>
          <ul style="font-size: 12px; line-height: 1.6; padding-left: 20px;">
            ${logsHtml || '<li>No hay logs registrados para este usuario en este rango de tiempo</li>'}
          </ul>
        </div>

        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  } catch (err) { Swal.fire({ icon: 'error', title: 'Error al generar impresión', text: err.message }); }
}

async function generarReporteFinanciero() {
  const periodo = document.getElementById('repPeriodo').value;
  const fecha = document.getElementById('repFecha').value;
  const resultBox = document.getElementById('reporteFinancieroResultBox');
  if (!fecha) return;

  resultBox.innerHTML = '<div class="text-center" style="padding:30px"><div class="loader-ripple"><div></div><div></div></div><p class="mt-10 text-muted">Generando reporte financiero...</p></div>';
  try {
    const estado = await request('/apertura/estado');
    if (estado.abierto) {
      Swal.fire({
        icon: 'warning',
        title: 'Caja Abierta',
        text: 'No se pueden generar reportes mientras la caja esté abierta. Por favor, realice el cierre de caja primero.'
      });
      resultBox.innerHTML = '<div class="alert alert-warning"><i class="fas fa-exclamation-triangle"></i> Debe cerrar la caja para generar reportes.</div>';
      return;
    }
    const data = await request(`/logs/reporte-financiero?periodo=${periodo}&fecha=${fecha}`);
    window._lastReportData = data;

    const fmt = n => '$' + Number(n).toLocaleString('es-CO');

    resultBox.innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:15px">
        <button class="btn btn-secondary" onclick="imprimirReporteFinanciero()"><i class="fas fa-print"></i> Imprimir Reporte</button>
      </div>
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));margin-bottom:20px">
        <div class="stat-card" style="border-left:4px solid var(--secondary)">
          <div class="stat-value" style="color:var(--secondary)">${fmt(data.ingresosVentas)}</div>
          <div class="stat-label">Ingresos por Ventas</div>
        </div>
        <div class="stat-card" style="border-left:4px solid var(--danger)">
          <div class="stat-value" style="color:var(--danger)">${fmt(data.totalGastos)}</div>
          <div class="stat-label">Gastos Totales</div>
          <div style="font-size:11px;color:var(--gray-300);margin-top:4px">
            Costo Ventas: ${fmt(data.costoMercanciaVendida)}<br>
            Pérdidas: ${fmt(data.perdidasSalidas)}<br>
            Compras: ${fmt(data.comprasEntradas)}
          </div>
        </div>
        <div class="stat-card" style="border-left:4px solid ${data.utilidadNeta >= 0 ? 'var(--success)' : 'var(--danger)'}">
          <div class="stat-value" style="color:${data.utilidadNeta >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmt(data.utilidadNeta)}</div>
          <div class="stat-label">Utilidad Neta</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h4>Desglose de Ventas (Ingresos)</h4></div>
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>ID</th><th>Fecha</th><th>Vendedor</th><th>Método de Pago</th><th>Total</th></tr></thead>
              <tbody>
                ${data.sales.length ? data.sales.map(v => `
                  <tr>
                    <td>#${v.id}</td>
                    <td>${v.created_at}</td>
                    <td>${v.vendedor}</td>
                    <td>${v.metodo_pago.toUpperCase()}</td>
                    <td><strong>${fmt(v.total)}</strong></td>
                  </tr>
                `).join('') : '<tr><td colspan="5" class="text-center text-muted" style="padding:20px">No hay ventas en este período</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card-header"><h4>Mercancía Vendida (Detalle)</h4></div>
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Precio Venta</th><th>Costo Compra</th><th>Utilidad</th></tr></thead>
              <tbody>
                ${data.salesDetails.length ? data.salesDetails.map(d => `
                  <tr>
                    <td>${d.created_at}</td>
                    <td><strong>${d.nombre}</strong></td>
                    <td>${d.cantidad}</td>
                    <td>${fmt(d.precio_unitario)}</td>
                    <td>${fmt(d.precio_compra)} (Gasto)</td>
                    <td style="color:var(--success)"><strong>${fmt(d.subtotal - (d.cantidad * d.precio_compra))}</strong></td>
                  </tr>
                `).join('') : '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">No hay productos vendidos en este período</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h4>Movimientos y Ajustes de Inventario (Compras / Salidas)</h4></div>
        <div class="card-body" style="padding:0">
          <div class="table-container">
            <table>
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Motivo</th></tr></thead>
              <tbody>
                ${data.movements.length ? data.movements.map(m => {
                  const isSale = m.motivo.startsWith('Venta #');
                  if (isSale) return '';
                  const isEntrada = m.tipo === 'entrada';
                  const valor = isEntrada ? (m.precio_compra || m.prod_precio_compra) : m.prod_precio_compra;
                  return `
                    <tr>
                      <td>${m.created_at}</td>
                      <td><strong>${m.producto_nombre}</strong></td>
                      <td><span class="status-badge ${isEntrada ? 'success' : 'danger'}">${m.tipo.toUpperCase()}</span></td>
                      <td>${m.cantidad}</td>
                      <td>${fmt(valor)}</td>
                      <td><strong>${fmt(m.cantidad * valor)}</strong></td>
                      <td style="font-size:11px;color:var(--gray-300)">${m.motivo || '-'}</td>
                    </tr>
                  `;
                }).join('') : '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">No hay movimientos de inventario en este período</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) { resultBox.innerHTML = `<div class="alert alert-danger">${err.message}</div>`; }
}

function imprimirReporteFinanciero() {
  const data = window._lastReportData;
  if (!data) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return Swal.fire({ icon: 'error', title: 'Bloqueador de ventanas emergentes activo', text: 'Por favor permite ventanas emergentes para imprimir.' });

  const fmt = n => '$' + Number(n).toLocaleString('es-CO');

  let salesHtml = '';
  data.sales.forEach(v => {
    salesHtml += `
      <tr>
        <td>#${v.id}</td>
        <td>${v.created_at}</td>
        <td>${v.vendedor}</td>
        <td>${v.metodo_pago.toUpperCase()}</td>
        <td>${fmt(v.total)}</td>
      </tr>
    `;
  });

  let detailsHtml = '';
  data.salesDetails.forEach(d => {
    detailsHtml += `
      <tr>
        <td>${d.created_at}</td>
        <td>${d.nombre}</td>
        <td>${d.cantidad}</td>
        <td>${fmt(d.precio_unitario)}</td>
        <td>${fmt(d.precio_compra)}</td>
        <td>${fmt(d.subtotal - (d.cantidad * d.precio_compra))}</td>
      </tr>
    `;
  });

  let movementsHtml = '';
  data.movements.forEach(m => {
    if (m.motivo.startsWith('Venta #')) return;
    const isEntrada = m.tipo === 'entrada';
    const valor = isEntrada ? (m.precio_compra || m.prod_precio_compra) : m.prod_precio_compra;
    movementsHtml += `
      <tr>
        <td>${m.created_at}</td>
        <td>${m.producto_nombre}</td>
        <td>${m.tipo.toUpperCase()}</td>
        <td>${m.cantidad}</td>
        <td>${fmt(valor)}</td>
        <td>${fmt(m.cantidad * valor)}</td>
        <td>${m.motivo || '-'}</td>
      </tr>
    `;
  });

  printWindow.document.write(`
    <html>
    <head>
      <title>Reporte Financiero de Ingresos y Gastos</title>
      <style>
        body { font-family: 'Outfit', 'Inter', sans-serif; padding: 20px; color: #333; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        h2 { margin: 5px 0; }
        .section { margin-bottom: 20px; }
        .section-title { font-weight: bold; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
        th { background-color: #f5f5f5; }
        .summary-box { display: flex; gap: 15px; margin-bottom: 20px; }
        .summary-card { flex: 1; border: 1px solid #ddd; border-radius: 4px; padding: 12px; text-align: center; }
        .summary-card .value { font-size: 18px; font-weight: bold; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>REPORTE FINANCIERO DE INGRESOS Y GASTOS</h2>
        <p><strong>Tienda:</strong> ${window._storeConfig?.tienda_nombre || 'TuTienda'}</p>
        <p><strong>Periodo:</strong> ${data.periodo.toUpperCase()} (Ref: ${data.fecha})</p>
        <p><strong>Rango:</strong> ${data.startDate} al ${data.endDate}</p>
      </div>

      <div class="summary-box">
        <div class="summary-card">
          <div>Ingresos por Ventas</div>
          <div class="value" style="color:#00cec9">${fmt(data.ingresosVentas)}</div>
        </div>
        <div class="summary-card">
          <div>Gastos Totales</div>
          <div class="value" style="color:#d63031">${fmt(data.totalGastos)}</div>
          <div style="font-size:10px;color:#777;margin-top:4px">
            Costo Ventas: ${fmt(data.costoMercanciaVendida)} | 
            Pérdidas: ${fmt(data.perdidasSalidas)} | 
            Compras: ${fmt(data.comprasEntradas)}
          </div>
        </div>
        <div class="summary-card">
          <div>Utilidad Neta</div>
          <div class="value" style="color:${data.utilidadNeta >= 0 ? '#2ecc71' : '#d63031'}">${fmt(data.utilidadNeta)}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Desglose de Ventas (Ingresos)</div>
        <table>
          <thead><tr><th>ID</th><th>Fecha</th><th>Vendedor</th><th>Método de Pago</th><th>Total</th></tr></thead>
          <tbody>${salesHtml || '<tr><td colspan="5">No se registraron ventas en este período</td></tr>'}</tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Detalle de Mercancía Vendida (Gastos de Mercancía)</div>
        <table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Precio Venta</th><th>Costo Compra</th><th>Utilidad</th></tr></thead>
          <tbody>${detailsHtml || '<tr><td colspan="6">No hay mercancía vendida en este período</td></tr>'}</tbody>
        </table>
      </div>

      <div class="section">
        <div class="section-title">Movimientos y Ajustes de Inventario (Pérdidas y Compras)</div>
        <table>
          <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cantidad</th><th>Costo unitario</th><th>Total</th><th>Motivo</th></tr></thead>
          <tbody>${movementsHtml || '<tr><td colspan="7">No se registraron movimientos en este período</td></tr>'}</tbody>
        </table>
      </div>

      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
