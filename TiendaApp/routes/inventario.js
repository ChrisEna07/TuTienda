const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, requiereModulo('inventario'), verificarPermiso('inventario', 'inventario_ver'), (req, res) => {
  const { busqueda, categoria, proveedor, agotandose, por_vencer } = req.query;
  const isSuper = req.usuario.tipo === 'superadmin';
  let query = `
    SELECT p.*, c.nombre as categoria_nombre, pr.nombre_empresa as proveedor_nombre 
    FROM productos p 
    LEFT JOIN categorias c ON p.categoria_id = c.id 
    LEFT JOIN proveedores pr ON p.proveedor_id = pr.id 
    WHERE p.activo = 1
  `;
  const params = [];
  if (!isSuper) { query += ' AND p.usuario_id = ?'; params.push(req.usuario.owner_id); }

  if (busqueda) { query += ' AND (p.nombre LIKE ? OR p.codigo_barras LIKE ?)'; params.push(`%${busqueda}%`, `%${busqueda}%`); }
  if (categoria) { query += ' AND p.categoria_id = ?'; params.push(categoria); }
  if (proveedor) { query += ' AND p.proveedor_id = ?'; params.push(proveedor); }
  if (agotandose) { query += ' AND p.stock <= p.stock_minimo'; }
  if (por_vencer) {
    const fechaLimite = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    query += ' AND p.fecha_vencimiento IS NOT NULL AND p.fecha_vencimiento <= ?';
    params.push(fechaLimite);
  }

  query += ' ORDER BY p.nombre ASC';
  const productos = db.prepare(query).all(...params);
  res.json(productos);
});

router.get('/:id', verificarToken, (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const producto = db.prepare(`
    SELECT p.*, c.nombre as categoria_nombre, pr.nombre_empresa as proveedor_nombre 
    FROM productos p 
    LEFT JOIN categorias c ON p.categoria_id = c.id 
    LEFT JOIN proveedores pr ON p.proveedor_id = pr.id 
    WHERE p.id = ?${!isSuper ? ' AND p.usuario_id = ?' : ''}
  `).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(producto);
});

router.get('/:id/movimientos', verificarToken, (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const movimientos = db.prepare(`
    SELECT m.*, COALESCE((SELECT nombre FROM usuarios WHERE id = m.usuario_id), (SELECT nombre FROM empleados WHERE id = m.usuario_id)) as usuario_nombre 
    FROM movimientos_inventario m 
    JOIN productos p ON m.producto_id = p.id
    WHERE m.producto_id = ?${!isSuper ? ' AND p.usuario_id = ?' : ''}
    ORDER BY m.created_at DESC 
    LIMIT 50
  `).all(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  res.json(movimientos);
});

router.post('/', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { codigo_barras, nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock, stock_minimo, unidad, fecha_vencimiento } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del producto requerido' });

    const result = db.prepare(`
      INSERT INTO productos (usuario_id, codigo_barras, nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock, stock_minimo, unidad, fecha_vencimiento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.usuario.owner_id, codigo_barras || null, nombre, descripcion, categoria_id || null, proveedor_id || null, precio_compra || 0, precio_venta || 0, stock || 0, stock_minimo || 5, unidad || 'unidad', fecha_vencimiento || null);

    if (stock > 0) {
      db.prepare(`
        INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id)
        VALUES (?, 'entrada', ?, 0, ?, 'Stock inicial', ?)
      `).run(result.lastInsertRowid, stock, stock, req.usuario.id);
    }

    logAction(req.usuario.id, req.usuario.nombre, 'Crear producto', 'inventario', `Producto: ${nombre}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Producto creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { codigo_barras, nombre, descripcion, categoria_id, proveedor_id, precio_compra, precio_venta, stock_minimo, unidad, fecha_vencimiento, activo } = req.body;
    db.prepare(`
      UPDATE productos SET 
        codigo_barras = COALESCE(?, codigo_barras), nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion),
        categoria_id = ?, proveedor_id = ?, precio_compra = COALESCE(?, precio_compra), precio_venta = COALESCE(?, precio_venta),
        stock_minimo = COALESCE(?, stock_minimo), unidad = COALESCE(?, unidad), fecha_vencimiento = COALESCE(?, fecha_vencimiento),
        activo = COALESCE(?, activo)
      WHERE id = ?${req.usuario.tipo !== 'superadmin' ? ' AND usuario_id = ' + req.usuario.owner_id : ''}
    `).run(codigo_barras, nombre, descripcion, categoria_id ?? null, proveedor_id ?? null, precio_compra, precio_venta, stock_minimo, unidad, fecha_vencimiento, activo, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar producto', 'inventario', `ID: ${req.params.id}`);
    res.json({ mensaje: 'Producto actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/ajustar-stock', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { tipo, cantidad, motivo } = req.body;
    if (!tipo || !cantidad) return res.status(400).json({ error: 'Tipo y cantidad requeridos' });

    const isSuper = req.usuario.tipo === 'superadmin';
    const producto = db.prepare(`SELECT * FROM productos WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const stockAnterior = producto.stock;
    let stockNuevo = stockAnterior;

    if (tipo === 'entrada') stockNuevo = stockAnterior + cantidad;
    else if (tipo === 'salida') {
      if (stockAnterior < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });
      stockNuevo = stockAnterior - cantidad;
    } else if (tipo === 'ajuste') stockNuevo = cantidad;
    else return res.status(400).json({ error: 'Tipo inválido' });

    db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(stockNuevo, req.params.id);
    db.prepare('INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.id, tipo, cantidad, stockAnterior, stockNuevo, motivo || '', req.usuario.id);

    logAction(req.usuario.id, req.usuario.nombre, 'Ajustar stock', 'inventario', `Producto: ${producto.nombre}, Tipo: ${tipo}, Cant: ${cantidad}`);
    res.json({ mensaje: 'Stock actualizado', stock_anterior: stockAnterior, stock_nuevo: stockNuevo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, verificarPermiso('inventario'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  db.prepare(`UPDATE productos SET activo = 0 WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).run(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar producto', 'inventario', `ID: ${req.params.id}`);
  res.json({ mensaje: 'Producto eliminado' });
});

module.exports = router;
