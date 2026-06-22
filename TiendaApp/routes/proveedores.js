const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, requiereModulo('proveedores'), verificarPermiso('proveedores'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const proveedores = db.prepare(`
    SELECT p.*, 
      (SELECT COUNT(*) FROM productos WHERE proveedor_id = p.id AND activo = 1) as total_productos
    FROM proveedores p ${!isSuper ? 'WHERE p.usuario_id = ?' : ''} ORDER BY p.nombre_empresa ASC
  `).all(...(!isSuper ? [req.usuario.owner_id] : []));
  res.json(proveedores);
});

router.get('/:id', verificarToken, (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const proveedor = db.prepare(`SELECT * FROM proveedores WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
  const productos = db.prepare(`SELECT id, nombre, codigo_barras, stock, precio_compra FROM productos WHERE proveedor_id = ? AND activo = 1${!isSuper ? ' AND usuario_id = ?' : ''}`).all(req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
  res.json({ ...proveedor, productos });
});

router.post('/', verificarToken, verificarPermiso('proveedores'), (req, res) => {
  try {
    const { nombre_empresa, nit, contacto_nombre, contacto_telefono, direccion } = req.body;
    if (!nombre_empresa || !nit) return res.status(400).json({ error: 'Nombre empresa y NIT requeridos' });

    const existe = db.prepare('SELECT id FROM proveedores WHERE nit = ? AND usuario_id = ?').get(nit, req.usuario.owner_id);
    if (existe) return res.status(400).json({ error: 'El NIT ya está registrado' });

    const result = db.prepare('INSERT INTO proveedores (usuario_id, nombre_empresa, nit, contacto_nombre, contacto_telefono, direccion) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.usuario.owner_id, nombre_empresa, nit, contacto_nombre, contacto_telefono, direccion);

    logAction(req.usuario.id, req.usuario.nombre, 'Crear proveedor', 'proveedores', `Empresa: ${nombre_empresa}, NIT: ${nit}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Proveedor creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, verificarPermiso('proveedores'), (req, res) => {
  try {
    const { nombre_empresa, nit, contacto_nombre, contacto_telefono, direccion } = req.body;
    const isSuper = req.usuario.tipo === 'superadmin';
    db.prepare(`UPDATE proveedores SET nombre_empresa = COALESCE(?, nombre_empresa), nit = COALESCE(?, nit), contacto_nombre = COALESCE(?, contacto_nombre), contacto_telefono = COALESCE(?, contacto_telefono), direccion = COALESCE(?, direccion) WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`)
      .run(nombre_empresa, nit, contacto_nombre, contacto_telefono, direccion, req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar proveedor', 'proveedores', `ID: ${req.params.id}`);
    res.json({ mensaje: 'Proveedor actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, verificarPermiso('proveedores'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const productos = db.prepare(`SELECT COUNT(*) as count FROM productos WHERE proveedor_id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  if (productos.count > 0) return res.status(400).json({ error: 'No se puede eliminar el proveedor porque tiene productos asociados' });
  db.prepare(`DELETE FROM proveedores WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).run(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar proveedor', 'proveedores', `ID: ${req.params.id}`);
  res.json({ mensaje: 'Proveedor eliminado' });
});

module.exports = router;
