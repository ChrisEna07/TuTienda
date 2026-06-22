const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, requiereModulo('empleados'), verificarPermiso('empleados'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const empleados = db.prepare(`
    SELECT e.*, r.nombre as rol_nombre, r.permisos 
    FROM empleados e 
    LEFT JOIN roles r ON e.rol_id = r.id 
    ${!isSuper ? 'WHERE e.tienda_usuario_id = ?' : ''}
    ORDER BY e.id DESC
  `).all(...(!isSuper ? [req.usuario.owner_id] : []));
  res.json(empleados);
});

router.get('/roles', verificarToken, (req, res) => {
  const roles = db.prepare('SELECT * FROM roles WHERE nombre != ?').all('superadmin');
  res.json(roles);
});

router.post('/roles', verificarToken, verificarPermiso('empleados'), (req, res) => {
  try {
    const { nombre, permisos } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre del rol requerido' });
    const existe = db.prepare('SELECT id FROM roles WHERE nombre = ?').get(nombre);
    if (existe) return res.status(400).json({ error: 'El rol ya existe' });
    db.prepare('INSERT INTO roles (nombre, permisos) VALUES (?, ?)').run(nombre, JSON.stringify(permisos || []));
    logAction(req.usuario.id, req.usuario.nombre, 'Crear rol', 'empleados', `Rol: ${nombre}, Permisos: ${JSON.stringify(permisos)}`);
    res.json({ mensaje: 'Rol creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/roles/:id', verificarToken, verificarPermiso('empleados'), (req, res) => {
  try {
    const { nombre, permisos } = req.body;
    const rolActual = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!rolActual) return res.status(404).json({ error: 'Rol no encontrado' });
    if (rolActual.nombre === 'superadmin') return res.status(400).json({ error: 'No puedes modificar el rol superadmin' });
    db.prepare('UPDATE roles SET nombre = COALESCE(?, nombre), permisos = COALESCE(?, permisos) WHERE id = ?')
      .run(nombre, permisos ? JSON.stringify(permisos) : null, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar rol', 'empleados', `Rol ID: ${req.params.id}`);
    res.json({ mensaje: 'Rol actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/roles/:id', verificarToken, verificarPermiso('empleados'), (req, res) => {
  const rol = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
  if (!rol) return res.status(404).json({ error: 'Rol no encontrado' });
  if (rol.nombre === 'superadmin') return res.status(400).json({ error: 'No puedes eliminar el rol superadmin' });
  db.prepare('DELETE FROM roles WHERE id = ?').run(req.params.id);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar rol', 'empleados', `Rol: ${rol.nombre}`);
  res.json({ mensaje: 'Rol eliminado' });
});

router.post('/', verificarToken, verificarPermiso('empleados'), (req, res) => {
  try {
    const { nombre, email, telefono, password, rol_id, tienda_usuario_id } = req.body;
    if (!nombre || !email || !password || !rol_id) return res.status(400).json({ error: 'Campos requeridos' });
    const existe = db.prepare('SELECT id FROM empleados WHERE email = ?').get(email);
    if (existe) return res.status(400).json({ error: 'El email ya está registrado' });
    const hash = bcrypt.hashSync(password, 10);
    const tiendaId = req.usuario.tipo === 'superadmin' && tienda_usuario_id ? tienda_usuario_id : req.usuario.owner_id;
    const result = db.prepare('INSERT INTO empleados (tienda_usuario_id, nombre, email, telefono, password, rol_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tiendaId, nombre, email, telefono, hash, rol_id);
    logAction(req.usuario.id, req.usuario.nombre, 'Crear empleado', 'empleados', `Empleado: ${nombre} (tienda: ${tiendaId})`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Empleado creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, verificarPermiso('empleados'), (req, res) => {
  try {
    const { nombre, email, telefono, activo, rol_id } = req.body;
    const isSuper = req.usuario.tipo === 'superadmin';
    db.prepare(`UPDATE empleados SET nombre = COALESCE(?, nombre), email = COALESCE(?, email), telefono = COALESCE(?, telefono), activo = COALESCE(?, activo), rol_id = COALESCE(?, rol_id) WHERE id = ?${!isSuper ? ' AND tienda_usuario_id = ?' : ''}`)
      .run(nombre, email, telefono, activo, rol_id, req.params.id, ...(!isSuper ? [req.usuario.owner_id] : []));
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar empleado', 'empleados', `ID: ${req.params.id}`);
    res.json({ mensaje: 'Empleado actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, verificarPermiso('empleados'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  db.prepare(`DELETE FROM empleados WHERE id = ?${!isSuper ? ' AND tienda_usuario_id = ?' : ''}`).run(...[req.params.id, ...(!isSuper ? [req.usuario.owner_id] : [])]);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar empleado', 'empleados', `ID: ${req.params.id}`);
  res.json({ mensaje: 'Empleado eliminado' });
});

module.exports = router;
