const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/estado', verificarToken, requiereModulo('apertura'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const aperturaActiva = db.prepare(`SELECT * FROM aperturas_cierre WHERE tipo = 'apertura' AND monto_final IS NULL AND date(created_at) = date('now', '-5 hours') ${!isSuper ? 'AND (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''} ORDER BY created_at DESC LIMIT 1`).get(...(!isSuper ? [req.usuario.owner_id, req.usuario.owner_id] : []));
  if (aperturaActiva) {
    const ventasHoy = db.prepare(`SELECT COUNT(*) as total_ventas, COALESCE(SUM(total),0) as total_ingresos FROM ventas WHERE date(created_at) = date('now', '-5 hours') AND (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))`).get(req.usuario.owner_id, req.usuario.owner_id);
    return res.json({ abierto: true, apertura: aperturaActiva, ventas_hoy: ventasHoy });
  }
  const ultimoCierre = db.prepare(`SELECT * FROM aperturas_cierre WHERE tipo = 'cierre' ${!isSuper ? 'AND (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''} ORDER BY created_at DESC LIMIT 1`).get(...(!isSuper ? [req.usuario.owner_id, req.usuario.owner_id] : []));
  res.json({ abierto: false, ultimo_cierre: ultimoCierre });
});

router.post('/apertura', verificarToken, requiereModulo('apertura'), verificarPermiso('apertura_cierre'), (req, res) => {
  try {
    const { monto_inicial = 0 } = req.body;
    const abierto = db.prepare("SELECT id FROM aperturas_cierre WHERE (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)) AND tipo = 'apertura' AND monto_final IS NULL AND date(created_at) = date('now', '-5 hours') LIMIT 1").get(req.usuario.owner_id, req.usuario.owner_id);
    if (abierto) return res.status(400).json({ error: 'Ya hay una apertura activa para hoy' });
    const result = db.prepare("INSERT INTO aperturas_cierre (usuario_id, usuario_nombre, tipo, monto_inicial) VALUES (?, ?, 'apertura', ?)").run(req.usuario.id, req.usuario.nombre, monto_inicial);
    logAction(req.usuario.id, req.usuario.nombre, 'Apertura de caja', 'apertura_cierre', `Monto inicial: $${monto_inicial}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Caja aperturada correctamente', hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/cierre', verificarToken, requiereModulo('apertura'), verificarPermiso('apertura_cierre'), (req, res) => {
  try {
    const { monto_final, observaciones } = req.body;
    const aperturaActiva = db.prepare("SELECT * FROM aperturas_cierre WHERE (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)) AND tipo = 'apertura' AND monto_final IS NULL AND date(created_at) = date('now', '-5 hours') ORDER BY created_at DESC LIMIT 1").get(req.usuario.owner_id, req.usuario.owner_id);
    if (!aperturaActiva) return res.status(400).json({ error: 'No hay una apertura activa' });
    const ventasHoy = db.prepare("SELECT COUNT(*) as total_ventas, COALESCE(SUM(total), 0) as total_ingresos FROM ventas WHERE apertura_id = ?").get(aperturaActiva.id);
    db.prepare("UPDATE aperturas_cierre SET monto_final = ?, observaciones = ? WHERE id = ?").run(monto_final || ventasHoy.total_ingresos, observaciones, aperturaActiva.id);
    db.prepare("INSERT INTO aperturas_cierre (usuario_id, usuario_nombre, tipo, monto_inicial, observaciones) VALUES (?, ?, 'cierre', ?, ?)").run(req.usuario.id, req.usuario.nombre, monto_final || ventasHoy.total_ingresos, 'Cierre automático del día');
    logAction(req.usuario.id, req.usuario.nombre, 'Cierre de caja', 'apertura_cierre', `Total ventas: $${ventasHoy.total_ingresos}`);
    res.json({ mensaje: 'Caja cerrada correctamente', resumen: ventasHoy, hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/historial', verificarToken, requiereModulo('apertura'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const registros = db.prepare(`
    SELECT a.*, COALESCE(a.usuario_nombre, (SELECT nombre FROM usuarios WHERE id = a.usuario_id), (SELECT nombre FROM empleados WHERE id = a.usuario_id)) as usuario_nombre 
    FROM aperturas_cierre a 
    ${!isSuper ? 'WHERE a.usuario_id = ? OR a.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)' : ''} 
    ORDER BY a.created_at DESC 
    LIMIT 50
  `).all(...(!isSuper ? [req.usuario.owner_id, req.usuario.owner_id] : []));
  res.json(registros);
});

module.exports = router;
