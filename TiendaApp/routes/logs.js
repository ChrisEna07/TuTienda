const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');

router.get('/', verificarToken, requiereModulo('logs'), verificarPermiso('logs'), (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const { modulo, usuario_id, accion, desde, hasta, limite = 100 } = req.query;
    let query = "SELECT l.* FROM logs l WHERE 1=1";
    const params = [];

    if (!isSuper) { query += " AND l.tienda_id = ?"; params.push(req.usuario.owner_id); }
    if (modulo) { query += " AND l.modulo = ?"; params.push(modulo); }
    if (usuario_id) { query += " AND l.usuario_id = ?"; params.push(usuario_id); }
    if (accion) { query += " AND l.accion LIKE ?"; params.push(`%${accion}%`); }
    if (desde) { query += " AND l.created_at >= ?"; params.push(desde); }
    if (hasta) { query += " AND l.created_at <= ?"; params.push(hasta); }

    query += " ORDER BY l.created_at DESC LIMIT ?";
    params.push(parseInt(limite));

    const logs = db.prepare(query).all(...params);
    const modulos = db.prepare("SELECT DISTINCT modulo FROM logs ORDER BY modulo").all();
    const usuarios = db.prepare(`SELECT DISTINCT l.usuario_id, l.usuario_nombre FROM logs l WHERE l.usuario_id IS NOT NULL ${!isSuper ? 'AND l.tienda_id = ?' : ''} ORDER BY l.usuario_nombre`).all(...(!isSuper ? [req.usuario.owner_id] : []));

    res.json({ logs, filtros: { modulos, usuarios } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/resumen', verificarToken, verificarPermiso('logs'), (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const uf = isSuper ? '' : ` WHERE l.tienda_id = ${req.usuario.owner_id}`;
    const totalLogs = db.prepare(`SELECT COUNT(*) as total FROM logs l${uf}`).get().total;
    const logsHoy = db.prepare(`SELECT COUNT(*) as total FROM logs l WHERE date(l.created_at) = date('now', '-5 hours')${!isSuper ? ' AND l.tienda_id = ?' : ''}`).get(...(!isSuper ? [req.usuario.owner_id] : [])).total;
    const accionesTop = db.prepare(`SELECT accion, COUNT(*) as total FROM logs l${uf} GROUP BY accion ORDER BY total DESC LIMIT 10`).all();
    const usuariosActivos = db.prepare(`SELECT usuario_nombre, COUNT(*) as total FROM logs l WHERE created_at >= date('now', '-7 days', '-5 hours') AND usuario_nombre IS NOT NULL${!isSuper ? ' AND l.tienda_id = ?' : ''} GROUP BY usuario_nombre ORDER BY total DESC LIMIT 10`).all(...(!isSuper ? [req.usuario.owner_id] : []));
    const modulosActivos = db.prepare(`SELECT modulo, COUNT(*) as total FROM logs l${uf} GROUP BY modulo ORDER BY total DESC`).all();

    res.json({ totalLogs, logsHoy, accionesTop, usuariosActivos, modulosActivos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reporte-financiero', verificarToken, verificarPermiso('logs'), (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const { periodo = 'mes', fecha = new Date().toISOString().split('T')[0] } = req.query;
    const ownerId = req.usuario.owner_id;

    if (!isSuper) {
      const activeApertura = db.prepare("SELECT id FROM aperturas_cierre WHERE (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)) AND tipo = 'apertura' AND monto_final IS NULL AND date(created_at) = date('now', '-5 hours') LIMIT 1").get(ownerId, ownerId);
      if (activeApertura) {
        return res.status(400).json({ error: 'No se pueden generar reportes mientras la caja esté abierta. Por favor, realice el cierre de caja primero.' });
      }
    }

    let startDate;
    let endDate;

    if (periodo === 'dia') {
      startDate = `${fecha} 00:00:00`;
      endDate = `${fecha} 23:59:59`;
    } else if (periodo === 'semana') {
      startDate = db.prepare("SELECT datetime(?, '-6 days', 'start of day')").get(fecha)['datetime(?, \'-6 days\', \'start of day\')'];
      endDate = `${fecha} 23:59:59`;
    } else if (periodo === 'mes') {
      startDate = db.prepare("SELECT datetime(?, 'start of month')").get(fecha)["datetime(?, 'start of month')"];
      endDate = db.prepare("SELECT datetime(?, 'start of month', '+1 month', '-1 second')").get(fecha)["datetime(?, 'start of month', '+1 month', '-1 second')"];
    } else if (periodo === 'trimestre') {
      startDate = db.prepare("SELECT datetime(?, 'start of month', '-2 months')").get(fecha)["datetime(?, 'start of month', '-2 months')"];
      endDate = db.prepare("SELECT datetime(?, 'start of month', '+1 month', '-1 second')").get(fecha)["datetime(?, 'start of month', '+1 month', '-1 second')"];
    } else if (periodo === 'semestre') {
      startDate = db.prepare("SELECT datetime(?, 'start of month', '-5 months')").get(fecha)["datetime(?, 'start of month', '-5 months')"];
      endDate = db.prepare("SELECT datetime(?, 'start of month', '+1 month', '-1 second')").get(fecha)["datetime(?, 'start of month', '+1 month', '-1 second')"];
    } else {
      return res.status(400).json({ error: 'Periodo invalido' });
    }

    const sales = db.prepare(`
      SELECT v.*, COALESCE((SELECT nombre FROM usuarios WHERE id = v.usuario_id), (SELECT nombre FROM empleados WHERE id = v.usuario_id)) as vendedor 
      FROM ventas v 
      WHERE v.created_at >= ? AND v.created_at <= ? 
      ${!isSuper ? 'AND (v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
      ORDER BY v.created_at ASC
    `).all(startDate, endDate, ...(!isSuper ? [ownerId, ownerId] : []));

    const salesDetails = db.prepare(`
      SELECT vd.*, p.nombre, p.precio_compra, v.created_at
      FROM ventas_detalle vd 
      JOIN productos p ON vd.producto_id = p.id 
      JOIN ventas v ON vd.venta_id = v.id 
      WHERE v.created_at >= ? AND v.created_at <= ?
      ${!isSuper ? 'AND (v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
    `).all(startDate, endDate, ...(!isSuper ? [ownerId, ownerId] : []));

    const movements = db.prepare(`
      SELECT m.*, p.nombre as producto_nombre, p.precio_compra as prod_precio_compra
      FROM movimientos_inventario m 
      JOIN productos p ON m.producto_id = p.id 
      WHERE m.created_at >= ? AND m.created_at <= ?
      ${!isSuper ? 'AND p.usuario_id = ?' : ''}
      ORDER BY m.created_at ASC
    `).all(startDate, endDate, ...(!isSuper ? [ownerId] : []));

    // Calculate totals
    const ingresosVentas = sales.reduce((sum, v) => sum + v.total, 0);
    
    // Gastos: COGS
    const costoMercanciaVendida = salesDetails.reduce((sum, d) => sum + (d.cantidad * d.precio_compra), 0);

    // Gastos: Pérdidas por salidas de inventario (vencidos, defectuosos, etc.)
    const perdidasSalidas = movements
      .filter(m => m.tipo === 'salida' && !m.motivo.startsWith('Venta #'))
      .reduce((sum, m) => sum + (m.cantidad * m.prod_precio_compra), 0);

    // Gastos: Compras o entradas de inventario
    const comprasEntradas = movements
      .filter(m => m.tipo === 'entrada')
      .reduce((sum, m) => sum + (m.cantidad * (m.precio_compra || m.prod_precio_compra)), 0);

    const totalGastos = costoMercanciaVendida + perdidasSalidas + comprasEntradas;
    const utilidadNeta = ingresosVentas - totalGastos;

    res.json({
      periodo,
      fecha,
      startDate,
      endDate,
      ingresosVentas,
      costoMercanciaVendida,
      perdidasSalidas,
      comprasEntradas,
      totalGastos,
      utilidadNeta,
      sales,
      salesDetails,
      movements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/historial-sesion/:id', verificarToken, (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;
    const session = db.prepare(`
      SELECT a.*, COALESCE((SELECT nombre FROM usuarios WHERE id = a.usuario_id), (SELECT nombre FROM empleados WHERE id = a.usuario_id)) as usuario_nombre 
      FROM aperturas_cierre a 
      WHERE a.id = ? ${!isSuper ? 'AND (a.usuario_id = ? OR a.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
    `).get(req.params.id, ...(!isSuper ? [ownerId, ownerId] : []));

    if (!session) return res.status(404).json({ error: 'Sesion de caja no encontrada' });

    // Find closing time
    const closingTime = db.prepare(`
      SELECT created_at FROM aperturas_cierre 
      WHERE tipo = 'cierre' AND usuario_id = ? AND created_at > ? 
      ORDER BY id ASC LIMIT 1
    `).get(session.usuario_id, session.created_at);

    const start = session.created_at;
    const end = closingTime ? closingTime.created_at : new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Sales in session
    const sales = db.prepare(`
      SELECT v.*, COALESCE((SELECT nombre FROM usuarios WHERE id = v.usuario_id), (SELECT nombre FROM empleados WHERE id = v.usuario_id)) as usuario_nombre 
      FROM ventas v 
      WHERE v.apertura_id = ? ORDER BY v.created_at ASC
    `).all(session.id);

    // Sales details
    const salesDetails = db.prepare(`
      SELECT vd.*, p.nombre as producto_nombre, p.codigo_barras 
      FROM ventas_detalle vd 
      JOIN productos p ON vd.producto_id = p.id 
      WHERE vd.venta_id IN (SELECT id FROM ventas WHERE apertura_id = ?)
    `).all(session.id);

    // Logs in session
    const logs = db.prepare(`
      SELECT * FROM logs 
      WHERE created_at >= ? AND created_at <= ? AND usuario_id = ?
      ORDER BY created_at ASC
    `).all(start, end, session.usuario_id);

    res.json({
      session,
      closingTime: closingTime ? closingTime.created_at : null,
      sales,
      salesDetails,
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
