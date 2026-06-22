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

module.exports = router;
