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

// ================ DEVOLUCIONES A PROVEEDORES ================
router.post('/devoluciones', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { producto_id, proveedor_id, cantidad, motivo } = req.body;
    if (!producto_id || !proveedor_id || !cantidad || !motivo) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const isSuper = req.usuario.tipo === 'superadmin';
    const producto = db.prepare(`SELECT * FROM productos WHERE id = ? AND activo = 1 ${!isSuper ? 'AND usuario_id = ?' : ''}`).get(producto_id, ...(!isSuper ? [req.usuario.owner_id] : []));
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    if (producto.stock < cantidad) {
      return res.status(400).json({ error: `Stock insuficiente para devolución. Disponible: ${producto.stock}` });
    }

    // Insert return entry
    const result = db.prepare(`
      INSERT INTO devoluciones_proveedor (usuario_id, producto_id, proveedor_id, cantidad, precio_compra, motivo, estado)
      VALUES (?, ?, ?, ?, ?, ?, 'pendiente')
    `).run(req.usuario.owner_id, producto_id, proveedor_id, cantidad, producto.precio_compra, motivo);

    // Subtract from active stock
    const stockNuevo = producto.stock - cantidad;
    db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(stockNuevo, producto.id);

    // Record in movements log
    db.prepare(`
      INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, precio_compra, proveedor_id)
      VALUES (?, 'salida', ?, ?, ?, ?, ?, ?, ?)
    `).run(producto.id, cantidad, producto.stock, stockNuevo, `Devolución a Proveedor: ${motivo}`, req.usuario.id, producto.precio_compra, proveedor_id);

    logAction(req.usuario.id, req.usuario.nombre, 'Registrar devolución', 'inventario', `Devolución: ${producto.nombre}, Cant: ${cantidad}, Proveedor: ${proveedor_id}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Devolución registrada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/devoluciones', verificarToken, (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;
    const devoluciones = db.prepare(`
      SELECT d.*, p.nombre as producto_nombre, p.codigo_barras, prov.nombre_empresa as proveedor_nombre
      FROM devoluciones_proveedor d
      JOIN productos p ON d.producto_id = p.id
      JOIN proveedores prov ON d.proveedor_id = prov.id
      ${!isSuper ? 'WHERE d.usuario_id = ?' : ''}
      ORDER BY d.created_at DESC
    `).all(...(!isSuper ? [ownerId] : []));
    res.json(devoluciones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/devoluciones/:id/estado', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'devuelto'].includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido' });
    }

    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;
    db.prepare(`
      UPDATE devoluciones_proveedor SET estado = ?
      WHERE id = ? ${!isSuper ? 'AND usuario_id = ?' : ''}
    `).run(estado, req.params.id, ...(!isSuper ? [ownerId] : []));

    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar estado devolución', 'inventario', `ID: ${req.params.id}, Estado: ${estado}`);
    res.json({ mensaje: 'Estado de devolución actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================ CALENDARIO DE PROVEEDORES ================
router.post('/proveedores/visitas', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const { proveedor_id, fecha_visita, notas } = req.body;
    if (!proveedor_id || !fecha_visita) {
      return res.status(400).json({ error: 'Proveedor y fecha son requeridos' });
    }

    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;

    const result = db.prepare(`
      INSERT INTO visitas_proveedores (usuario_id, proveedor_id, fecha_visita, notas)
      VALUES (?, ?, ?, ?)
    `).run(ownerId, proveedor_id, fecha_visita, notas || null);

    logAction(req.usuario.id, req.usuario.nombre, 'Registrar visita proveedor', 'inventario', `Proveedor ID: ${proveedor_id}, Fecha: ${fecha_visita}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Visita agendada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedores/visitas', verificarToken, (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;
    const visitas = db.prepare(`
      SELECT v.*, prov.nombre_empresa as proveedor_nombre, prov.contacto_nombre, prov.contacto_telefono
      FROM visitas_proveedores v
      JOIN proveedores prov ON v.proveedor_id = prov.id
      ${!isSuper ? 'WHERE v.usuario_id = ?' : ''}
      ORDER BY v.fecha_visita ASC
    `).all(...(!isSuper ? [ownerId] : []));
    res.json(visitas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/proveedores/visitas/:id', verificarToken, verificarPermiso('inventario'), (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const ownerId = req.usuario.owner_id;
    db.prepare(`
      DELETE FROM visitas_proveedores
      WHERE id = ? ${!isSuper ? 'AND usuario_id = ?' : ''}
    `).run(req.params.id, ...(!isSuper ? [ownerId] : []));

    logAction(req.usuario.id, req.usuario.nombre, 'Eliminar visita proveedor', 'inventario', `ID: ${req.params.id}`);
    res.json({ mensaje: 'Visita eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================ PRODUCTOS DYNAMIC ROUTES ================
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
    const { tipo, cantidad, motivo, precio_compra, proveedor_id } = req.body;
    if (!tipo || !cantidad) return res.status(400).json({ error: 'Tipo y cantidad requeridos' });

    const isSuper = req.usuario.tipo === 'superadmin';
    const producto = db.prepare(`SELECT * FROM productos WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    const stockAnterior = producto.stock;
    let stockNuevo = stockAnterior;

    let finalPrecioCompra = producto.precio_compra;
    let finalProveedorId = producto.proveedor_id;

    if (tipo === 'entrada') {
      stockNuevo = stockAnterior + cantidad;
      if (precio_compra) finalPrecioCompra = parseFloat(precio_compra);
      if (proveedor_id) finalProveedorId = parseInt(proveedor_id);

      db.prepare('UPDATE productos SET stock = ?, precio_compra = ?, proveedor_id = ? WHERE id = ?').run(stockNuevo, finalPrecioCompra, finalProveedorId, req.params.id);
    } else if (tipo === 'salida') {
      if (stockAnterior < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });
      stockNuevo = stockAnterior - cantidad;
      db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(stockNuevo, req.params.id);
    } else if (tipo === 'ajuste') {
      stockNuevo = cantidad;
      db.prepare('UPDATE productos SET stock = ? WHERE id = ?').run(stockNuevo, req.params.id);
    } else {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    db.prepare('INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, usuario_id, precio_compra, proveedor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.id, tipo, cantidad, stockAnterior, stockNuevo, motivo || '', req.usuario.id, finalPrecioCompra, finalProveedorId);

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
