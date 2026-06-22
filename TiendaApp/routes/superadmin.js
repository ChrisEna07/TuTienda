const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { verificarToken, soloSuperAdmin } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/verificar', verificarToken, (req, res) => {
  res.json({ esSuperAdmin: req.usuario.tipo === 'superadmin' });
});

router.get('/ofertas', verificarToken, soloSuperAdmin, (req, res) => {
  const ofertas = db.prepare("SELECT * FROM ofertas_software ORDER BY created_at DESC").all();
  res.json(ofertas);
});

router.post('/ofertas', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { nombre, descripcion, precio, precio_mensual, duracion_dias, tipo_pago, caracteristicas, activo, mostrar_landing } = req.body;
    if (!nombre || !precio || !duracion_dias) return res.status(400).json({ error: 'Campos requeridos' });
    const result = db.prepare("INSERT INTO ofertas_software (nombre, descripcion, precio, precio_mensual, duracion_dias, tipo_pago, caracteristicas, activo, mostrar_landing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(nombre, descripcion, precio, precio_mensual || 0, duracion_dias, tipo_pago || 'unico', JSON.stringify(caracteristicas || []), activo ?? 1, mostrar_landing ?? 0);
    logAction(req.usuario.id, req.usuario.nombre, 'Crear oferta software', 'superadmin', `Oferta: ${nombre}, Precio: $${precio}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Oferta creada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/ofertas/:id', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { nombre, descripcion, precio, precio_mensual, duracion_dias, tipo_pago, caracteristicas, activo, mostrar_landing } = req.body;
    db.prepare("UPDATE ofertas_software SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion), precio = COALESCE(?, precio), precio_mensual = COALESCE(?, precio_mensual), duracion_dias = COALESCE(?, duracion_dias), tipo_pago = COALESCE(?, tipo_pago), caracteristicas = COALESCE(?, caracteristicas), activo = COALESCE(?, activo), mostrar_landing = COALESCE(?, mostrar_landing) WHERE id = ?")
      .run(nombre, descripcion, precio, precio_mensual, duracion_dias, tipo_pago, caracteristicas ? JSON.stringify(caracteristicas) : null, activo, mostrar_landing, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar oferta', 'superadmin', `Oferta ID: ${req.params.id}`);
    res.json({ mensaje: 'Oferta actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/ofertas/:id', verificarToken, soloSuperAdmin, (req, res) => {
  db.prepare("DELETE FROM ofertas_software WHERE id = ?").run(req.params.id);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar oferta', 'superadmin', `Oferta ID: ${req.params.id}`);
  res.json({ mensaje: 'Oferta eliminada' });
});

router.get('/suscripciones', verificarToken, soloSuperAdmin, (req, res) => {
  const suscripciones = db.prepare(`
    SELECT s.*, u.nombre as usuario_nombre, u.email as usuario_email, o.nombre as oferta_nombre
    FROM suscripciones s
    LEFT JOIN usuarios u ON s.usuario_id = u.id
    LEFT JOIN ofertas_software o ON s.oferta_id = o.id
    ORDER BY s.created_at DESC
  `).all();
  res.json(suscripciones);
});

router.post('/suscripciones', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { usuario_id, oferta_id } = req.body;
    if (!usuario_id || !oferta_id) return res.status(400).json({ error: 'Usuario y oferta requeridos' });
    const oferta = db.prepare("SELECT * FROM ofertas_software WHERE id = ? AND activo = 1").get(oferta_id);
    if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });
    const fechaInicio = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const fechaFin = new Date(Date.now() + oferta.duracion_dias * 86400000).toISOString().replace('T', ' ').substring(0, 19);
    db.prepare("UPDATE suscripciones SET estado = 'expirada' WHERE usuario_id = ? AND estado = 'activa'").run(usuario_id);
    const result = db.prepare("INSERT INTO suscripciones (usuario_id, oferta_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)").run(usuario_id, oferta_id, fechaInicio, fechaFin);
    logAction(req.usuario.id, req.usuario.nombre, 'Asignar suscripción', 'superadmin', `Usuario ID: ${usuario_id}, Oferta: ${oferta.nombre}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Suscripción asignada correctamente', fecha_fin: fechaFin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes', verificarToken, soloSuperAdmin, (req, res) => {
  const clientes = db.prepare(`
    SELECT u.*, r.nombre as rol_nombre,
      (SELECT s.estado FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as estado_suscripcion,
      (SELECT s.fecha_fin FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as fecha_fin_suscripcion
    FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id
    WHERE u.tipo = 'cliente'
    ORDER BY u.created_at DESC
  `).all();
  res.json(clientes);
});

router.get('/estadisticas', verificarToken, soloSuperAdmin, (req, res) => {
  const totalClientes = db.prepare("SELECT COUNT(*) as total FROM usuarios WHERE tipo = 'cliente'").get().total;
  const clientesActivos = db.prepare("SELECT COUNT(*) as total FROM usuarios u WHERE u.tipo = 'cliente' AND EXISTS (SELECT 1 FROM suscripciones s WHERE s.usuario_id = u.id AND s.estado = 'activa')").get().total;
  const clientesPrueba = db.prepare("SELECT COUNT(*) as total FROM usuarios WHERE tipo = 'cliente' AND trial_end IS NOT NULL AND trial_end > datetime('now', '-5 hours')").get().total;
  const suscripcionesActivas = db.prepare("SELECT COUNT(*) as total FROM suscripciones WHERE estado = 'activa'").get().total;
  const ingresosSoftware = db.prepare("SELECT COALESCE(SUM(o.precio), 0) as total FROM suscripciones s JOIN ofertas_software o ON s.oferta_id = o.id WHERE s.estado = 'activa'").get().total;

  res.json({ totalClientes, clientesActivos, clientesPrueba, suscripcionesActivas, ingresosSoftware });
});

// ================ GESTION DE CLIENTES ================
router.put('/clientes/:id/toggle', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const usuario = db.prepare('SELECT activo FROM usuarios WHERE id = ? AND tipo = ?').get(req.params.id, 'cliente');
    if (!usuario) return res.status(404).json({ error: 'Cliente no encontrado' });
    const nuevoEstado = usuario.activo ? 0 : 1;
    db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(nuevoEstado, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, nuevoEstado ? 'Activar cliente' : 'Desactivar cliente', 'superadmin', `Cliente ID: ${req.params.id}`);
    res.json({ activo: nuevoEstado, mensaje: `Cliente ${nuevoEstado ? 'activado' : 'desactivado'} correctamente` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes/:id', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const cliente = db.prepare(`
      SELECT u.*, r.nombre as rol_nombre,
        (SELECT COUNT(*) FROM suscripciones WHERE usuario_id = u.id) as total_suscripciones,
        (SELECT COUNT(*) FROM productos WHERE usuario_id = u.id) as total_productos,
        (SELECT COUNT(*) FROM ventas WHERE usuario_id = u.id) as total_ventas,
        (SELECT COALESCE(SUM(total), 0) FROM ventas WHERE usuario_id = u.id) as total_ingresos,
        (SELECT s.estado FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as estado_suscripcion,
        (SELECT o.nombre FROM suscripciones s JOIN ofertas_software o ON s.oferta_id = o.id WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as plan_actual,
        (SELECT s.fecha_inicio FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as suscripcion_inicio,
        (SELECT s.fecha_fin FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as suscripcion_fin
      FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.id = ? AND u.tipo = 'cliente'
    `).get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    res.json(cliente);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clientes/:id/demo', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { dias } = req.body;
    if (!dias || dias < 1 || dias > 365) return res.status(400).json({ error: 'Dias debe ser entre 1 y 365' });
    const usuario = db.prepare('SELECT trial_end, trial_start FROM usuarios WHERE id = ? AND tipo = ?').get(req.params.id, 'cliente');
    if (!usuario) return res.status(404).json({ error: 'Cliente no encontrado' });
    const fechaFin = new Date(Date.now() + dias * 86400000).toISOString().replace('T', ' ').substring(0, 19);
    db.prepare("UPDATE usuarios SET trial_start = COALESCE(trial_start, datetime('now', '-5 hours')), trial_end = ? WHERE id = ?").run(fechaFin, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Extender demo', 'superadmin', `Cliente ID: ${req.params.id}, Dias: ${dias}`);
    res.json({ mensaje: `Demo extendido a ${dias} dias`, trial_end: fechaFin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/clientes/:id/suscripcion', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { oferta_id } = req.body;
    if (!oferta_id) return res.status(400).json({ error: 'Oferta requerida' });
    const oferta = db.prepare("SELECT * FROM ofertas_software WHERE id = ? AND activo = 1").get(oferta_id);
    if (!oferta) return res.status(404).json({ error: 'Oferta no encontrada' });

    const activeSub = db.prepare("SELECT * FROM suscripciones WHERE usuario_id = ? AND estado = 'activa' ORDER BY id DESC LIMIT 1").get(req.params.id);
    let fechaInicio;
    let fechaFin;

    if (activeSub && activeSub.oferta_id === parseInt(oferta_id)) {
      // Extend existing subscription
      fechaInicio = activeSub.fecha_inicio;
      const currentFin = new Date(activeSub.fecha_fin.replace(' ', 'T') + 'Z');
      const now = new Date();
      const startBase = currentFin > now ? currentFin : now;
      fechaFin = new Date(startBase.getTime() + oferta.duracion_dias * 86400000).toISOString().replace('T', ' ').substring(0, 19);
      
      db.prepare("UPDATE suscripciones SET fecha_fin = ? WHERE id = ?").run(fechaFin, activeSub.id);
      logAction(req.usuario.id, req.usuario.nombre, 'Extender plan suscripcion', 'superadmin', `Cliente ID: ${req.params.id}, Oferta: ${oferta.nombre}, Nuevo Fin: ${fechaFin}`);
      
      res.json({ id: activeSub.id, mensaje: `Suscripcion de ${oferta.nombre} extendida correctamente`, fecha_fin: fechaFin });
    } else {
      // Create new subscription / Change plan
      fechaInicio = new Date().toISOString().replace('T', ' ').substring(0, 19);
      fechaFin = new Date(Date.now() + oferta.duracion_dias * 86400000).toISOString().replace('T', ' ').substring(0, 19);
      
      db.prepare("UPDATE suscripciones SET estado = 'expirada' WHERE usuario_id = ? AND estado = 'activa'").run(req.params.id);
      const result = db.prepare("INSERT INTO suscripciones (usuario_id, oferta_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)").run(req.params.id, oferta_id, fechaInicio, fechaFin);
      logAction(req.usuario.id, req.usuario.nombre, 'Cambiar plan suscripcion', 'superadmin', `Cliente ID: ${req.params.id}, Oferta: ${oferta.nombre}`);
      
      res.json({ id: result.lastInsertRowid, mensaje: `Plan cambiado a ${oferta.nombre}`, fecha_fin: fechaFin });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================ CLIENTES CON BUSQUEDA ================
router.get('/clientes/buscar', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { q, desde, hasta, dias_demo } = req.query;
    let sql = `
      SELECT u.*, r.nombre as rol_nombre,
        (SELECT s.estado FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as estado_suscripcion,
        (SELECT s.fecha_fin FROM suscripciones s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) as fecha_fin_suscripcion,
        CASE WHEN u.trial_end IS NOT NULL THEN CAST(julianday(u.trial_end) - julianday('now', '-5 hours') AS INTEGER) ELSE NULL END as dias_demo_restantes
      FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id
      WHERE u.tipo = 'cliente'
    `;
    const params = [];
    if (q) { sql += ' AND (u.nombre LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    if (desde) { sql += ' AND u.created_at >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND u.created_at <= ?'; params.push(hasta); }
    if (dias_demo !== undefined && dias_demo !== '') {
      if (dias_demo === '0') { sql += " AND (u.trial_end IS NULL OR u.trial_end < datetime('now', '-5 hours'))"; }
      else { sql += " AND u.trial_end IS NOT NULL AND CAST(julianday(u.trial_end) - julianday('now', '-5 hours') AS INTEGER) = ?"; params.push(parseInt(dias_demo)); }
    }
    sql += ' ORDER BY u.created_at DESC';
    const clientes = db.prepare(sql).all(...params);
    res.json(clientes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================ PAGOS ================
router.get('/pagos', verificarToken, soloSuperAdmin, (req, res) => {
  const pagos = db.prepare(`
    SELECT p.*, u.nombre as usuario_nombre, u.email as usuario_email
    FROM pagos p LEFT JOIN usuarios u ON p.usuario_id = u.id
    ORDER BY p.created_at DESC LIMIT 100
  `).all();
  res.json(pagos);
});

router.post('/pagos', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { usuario_id, monto, metodo, concepto, referencia } = req.body;
    if (!usuario_id || !monto) return res.status(400).json({ error: 'Usuario y monto requeridos' });
    const result = db.prepare("INSERT INTO pagos (usuario_id, monto, metodo, concepto, referencia, estado) VALUES (?, ?, ?, ?, ?, 'pendiente')").run(usuario_id, monto, metodo || 'transferencia', concepto, referencia);
    logAction(req.usuario.id, req.usuario.nombre, 'Registrar pago', 'superadmin', `Usuario ID: ${usuario_id}, Monto: $${monto}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Pago registrado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/pagos/:id', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { estado } = req.body;
    db.prepare("UPDATE pagos SET estado = ? WHERE id = ?").run(estado, req.params.id);
    if (estado === 'aprobado') {
      const pago = db.prepare("SELECT * FROM pagos WHERE id = ?").get(req.params.id);
      const usuario = db.prepare("SELECT * FROM usuarios WHERE id = ?").get(pago.usuario_id);
      if (usuario) {
        const ofertaDefault = db.prepare("SELECT * FROM ofertas_software WHERE activo = 1 ORDER BY precio ASC LIMIT 1").get();
        if (ofertaDefault) {
          const fechaInicio = new Date().toISOString().replace('T', ' ').substring(0, 19);
          const fechaFin = new Date(Date.now() + ofertaDefault.duracion_dias * 86400000).toISOString().replace('T', ' ').substring(0, 19);
          db.prepare("UPDATE suscripciones SET estado = 'expirada' WHERE usuario_id = ? AND estado = 'activa'").run(pago.usuario_id);
          db.prepare("INSERT INTO suscripciones (usuario_id, oferta_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)").run(pago.usuario_id, ofertaDefault.id, fechaInicio, fechaFin);
        }
      }
    }
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar pago', 'superadmin', `Pago ID: ${req.params.id}, Estado: ${estado}`);
    res.json({ mensaje: 'Pago actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================ RESET BASE DE DATOS ================
router.post('/reset/:modulo', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { modulo } = req.params;
    const tablaMap = {
      productos: 'productos', categorias: 'categorias', proveedores: 'proveedores',
      ventas: 'ventas', empleados: 'empleados', logs: 'logs',
      movimientos: 'movimientos_inventario', aperturas: 'aperturas_cierre',
      api: 'api_config', config: 'configuracion', suscripciones: 'suscripciones',
      ofertas: 'ofertas_software', pagos: 'pagos'
    };
    if (modulo === 'todo') {
      db.exec("PRAGMA foreign_keys = OFF");
      const orden = ['ventas_detalle','ventas','movimientos_inventario','productos','categorias','proveedores','aperturas_cierre','empleados','api_config','configuracion','suscripciones','pagos','logs'];
      const transaction = db.transaction(() => {
        orden.forEach(t => { db.exec(`DELETE FROM ${t}`); });
        db.exec("DELETE FROM usuarios WHERE id != 1");
        db.exec("DELETE FROM sqlite_sequence");
      });
      transaction();
      db.exec("PRAGMA foreign_keys = ON");
      logAction(req.usuario.id, req.usuario.nombre, 'Reset total BD', 'superadmin', 'Base de datos reiniciada completamente');
      return res.json({ mensaje: 'Base de datos reiniciada completamente. Se han eliminado todos los datos de clientes.' });
    }
    if (!tablaMap[modulo]) return res.status(400).json({ error: 'Modulo no valido' });
    const ordenDelete = {
      productos: ['movimientos_inventario', 'ventas_detalle', 'productos'],
      categorias: ['productos', 'categorias'],
      proveedores: ['productos', 'proveedores'],
      ventas: ['ventas_detalle', 'ventas'],
      empleados: ['empleados'],
      logs: ['logs'],
      movimientos: ['movimientos_inventario'],
      aperturas: ['ventas', 'aperturas_cierre'],
      api: ['api_config'],
      config: ['configuracion'],
      suscripciones: ['suscripciones'],
      pagos: ['pagos']
    };
    const tablas = ordenDelete[modulo] || [tablaMap[modulo]];
    const transaction = db.transaction(() => {
      tablas.forEach(t => { db.exec(`DELETE FROM ${t}`); });
    });
    transaction();
    logAction(req.usuario.id, req.usuario.nombre, 'Reset modulo', 'superadmin', `Modulo: ${modulo}`);
    res.json({ mensaje: `Datos del modulo ${modulo} eliminados correctamente` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
