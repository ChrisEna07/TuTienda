const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');

router.get('/', verificarToken, requiereModulo('inventario'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const categorias = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM productos WHERE categoria_id = c.id AND activo = 1) as total_productos FROM categorias c ${!isSuper ? 'WHERE c.usuario_id = ?' : ''} ORDER BY c.nombre ASC`).all(...(!isSuper ? [req.usuario.owner_id] : []));
  res.json(categorias);
});

router.post('/', verificarToken, requiereModulo('inventario'), verificarPermiso('inventario'), (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const result = db.prepare('INSERT INTO categorias (usuario_id, nombre, descripcion) VALUES (?, ?, ?)').run(req.usuario.owner_id, nombre, descripcion);
    res.json({ id: result.lastInsertRowid, mensaje: 'Categoría creada' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'La categoría ya existe' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, requiereModulo('inventario'), verificarPermiso('inventario'), (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    const isSuper = req.usuario.tipo === 'superadmin';
    db.prepare(`UPDATE categorias SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion) WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).run(nombre, descripcion, req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
    res.json({ mensaje: 'Categoría actualizada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, requiereModulo('inventario'), verificarPermiso('inventario'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const productos = db.prepare(`SELECT COUNT(*) as count FROM productos WHERE categoria_id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).get(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  if (productos.count > 0) return res.status(400).json({ error: 'No se puede eliminar la categoría porque tiene productos asociados' });
  db.prepare(`DELETE FROM categorias WHERE id = ?${!isSuper ? ' AND usuario_id = ?' : ''}`).run(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  res.json({ mensaje: 'Categoría eliminada' });
});

module.exports = router;
