const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, requiereModulo('api'), verificarPermiso('api_integracion'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const apis = db.prepare(`SELECT * FROM api_config ${!isSuper ? 'WHERE usuario_id = ?' : ''} ORDER BY created_at DESC`).all(...(!isSuper ? [req.usuario.owner_id] : []));
  res.json(apis);
});

router.post('/', verificarToken, verificarPermiso('api_integracion'), (req, res) => {
  try {
    const { nombre, tipo, configuracion } = req.body;
    if (!nombre || !tipo) return res.status(400).json({ error: 'Nombre y tipo requeridos' });
    const result = db.prepare("INSERT INTO api_config (usuario_id, nombre, tipo, configuracion) VALUES (?, ?, ?, ?)").run(req.usuario.owner_id, nombre, tipo, JSON.stringify(configuracion || {}));
    logAction(req.usuario.id, req.usuario.nombre, 'Configurar API', 'api_integracion', `API: ${nombre}, Tipo: ${tipo}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'API configurada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, verificarPermiso('api_integracion'), (req, res) => {
  try {
    const { nombre, tipo, configuracion, activo } = req.body;
    const isSuper = req.usuario.tipo === 'superadmin';
    db.prepare(`UPDATE api_config SET nombre = COALESCE(?, nombre), tipo = COALESCE(?, tipo), configuracion = COALESCE(?, configuracion), activo = COALESCE(?, activo) WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`)
      .run(nombre, tipo, configuracion ? JSON.stringify(configuracion) : null, activo, req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar API', 'api_integracion', `API ID: ${req.params.id}`);
    res.json({ mensaje: 'API actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, verificarPermiso('api_integracion'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  db.prepare(`DELETE FROM api_config WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).run(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  res.json({ mensaje: 'API eliminada' });
});

router.post('/probar/:id', verificarToken, verificarPermiso('api_integracion'), (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const api = db.prepare(`SELECT * FROM api_config WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
    if (!api) return res.status(404).json({ error: 'API no encontrada' });
    const config = JSON.parse(api.configuracion || '{}');
    logAction(req.usuario.id, req.usuario.nombre, 'Probar API', 'api_integracion', `API: ${api.nombre}`);
    res.json({ mensaje: 'Conexión probada correctamente', config, estado: 'conectado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/tipos', verificarToken, (req, res) => {
  res.json([
    { id: 'barcode', nombre: 'Escáner de Código de Barras', descripcion: 'Integración con escáneres de código de barras para registro y ventas', icono: 'barcode' },
    { id: 'pago', nombre: 'Pasarela de Pago', descripcion: 'Integración con pasarelas de pago (EPayco, PayU, etc.)', icono: 'credit-card' },
    { id: 'facturacion', nombre: 'Facturación Electrónica', descripcion: 'Integración con sistemas de facturación electrónica DIAN', icono: 'file-invoice' },
    { id: 'ecommerce', nombre: 'E-commerce', descripcion: 'Integración con tiendas online (WooCommerce, Shopify, etc.)', icono: 'shopping-cart' },
    { id: 'inventario_externo', nombre: 'Inventario Externo', descripcion: 'Sincronización con sistemas de inventario externos', icono: 'sync' }
  ]);
});
module.exports = router;
