const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

function resolverNombres(items, ownerId, isSuper) {
  if (isSuper) {
    return items.map(item => {
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(item.usuario_id);
      if (u) return { ...item, usuario_nombre: u.nombre };
      const e = db.prepare('SELECT nombre FROM empleados WHERE id = ?').get(item.usuario_id);
      return { ...item, usuario_nombre: e ? e.nombre : '-' };
    });
  }

  const empleados = db.prepare('SELECT id, nombre FROM empleados WHERE tienda_usuario_id = ?').all(ownerId);
  const empMap = new Map(empleados.map(e => [e.id, e.nombre]));
  const owner = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(ownerId);

  return items.map(item => {
    let nombre = '-';
    if (item.usuario_id === ownerId) {
      nombre = owner?.nombre || '-';
    } else if (empMap.has(item.usuario_id)) {
      nombre = empMap.get(item.usuario_id);
    } else {
      const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(item.usuario_id);
      nombre = u?.nombre || '-';
    }
    return { ...item, usuario_nombre: nombre };
  });
}

router.get('/', verificarToken, requiereModulo('ventas'), verificarPermiso('ventas', 'ventas_ver'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const ventas = db.prepare(`
    SELECT v.* 
    FROM ventas v 
    ${!isSuper ? 'WHERE v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)' : ''}
    ORDER BY v.created_at DESC 
    LIMIT 100
  `).all(...(!isSuper ? [req.usuario.owner_id, req.usuario.owner_id] : []));
  
  const ventasConNombres = resolverNombres(ventas, req.usuario.owner_id, isSuper);
  res.json(ventasConNombres);
});

router.get('/:id', verificarToken, (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const venta = db.prepare(`
    SELECT v.* 
    FROM ventas v 
    WHERE v.id = ?${!isSuper ? ' AND (v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
  `).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id, req.usuario.owner_id] : [])]);
  if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });
  
  const [ventaConNombre] = resolverNombres([venta], req.usuario.owner_id, isSuper);
  const detalle = db.prepare('SELECT vd.*, p.nombre as producto_nombre FROM ventas_detalle vd LEFT JOIN productos p ON vd.producto_id = p.id WHERE vd.venta_id = ?').all(req.params.id);
  res.json({ ...ventaConNombre, detalle });
});

router.post('/', verificarToken, verificarPermiso('ventas'), (req, res) => {
  try {
    const { items, metodo_pago = 'efectivo', apertura_id } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Debe incluir al menos un producto' });

    let total = 0;
    const detalles = [];

    for (const item of items) {
      const producto = db.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1 AND usuario_id = ?').get(item.producto_id, req.usuario.owner_id);
      if (!producto) return res.status(404).json({ error: `Producto ID ${item.producto_id} no encontrado` });
      if (producto.stock < item.cantidad) return res.status(400).json({ error: `Stock insuficiente para ${producto.nombre}` });

      const subtotal = producto.precio_venta * item.cantidad;
      total += subtotal;
      detalles.push({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unitario: producto.precio_venta, subtotal, nombre: producto.nombre });
    }

    const activeAp = db.prepare("SELECT id FROM aperturas_cierre WHERE (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)) AND tipo = 'apertura' AND monto_final IS NULL AND date(created_at) = date('now', '-5 hours') ORDER BY id DESC LIMIT 1").get(req.usuario.owner_id, req.usuario.owner_id);
    if (!activeAp) {
      return res.status(400).json({ error: 'Debes realizar la apertura de caja antes de registrar una venta', codigo: 'CAJA_CERRADA' });
    }

    const result = db.prepare('INSERT INTO ventas (usuario_id, total, metodo_pago, apertura_id) VALUES (?, ?, ?, ?)').run(req.usuario.id, total, metodo_pago, activeAp.id);
    const ventaId = result.lastInsertRowid;

    const insertDetalle = db.prepare('INSERT INTO ventas_detalle (venta_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)');
    const updateStock = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
    const insertMov = db.prepare('INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)');

    for (const d of detalles) {
      insertDetalle.run(ventaId, d.producto_id, d.cantidad, d.precio_unitario, d.subtotal);
      const prodActual = db.prepare('SELECT stock FROM productos WHERE id = ?').get(d.producto_id);
      updateStock.run(d.cantidad, d.producto_id);
      insertMov.run(d.producto_id, 'salida', d.cantidad, prodActual.stock, prodActual.stock - d.cantidad, `Venta #${ventaId}`, req.usuario.id);
    }

    logAction(req.usuario.id, req.usuario.nombre, 'Crear venta', 'ventas', `Venta #${ventaId}, Total: $${total.toLocaleString()}`);
    res.json({ id: ventaId, total, mensaje: 'Venta registrada correctamente', detalles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
