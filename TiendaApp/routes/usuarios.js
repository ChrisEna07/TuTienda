const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { verificarToken, soloSuperAdmin } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, (req, res) => {
  if (req.usuario.tipo === 'superadmin') {
    const usuarios = db.prepare('SELECT u.id, u.nombre, u.email, u.telefono, u.tipo, u.activo, u.trial_start, u.trial_end, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id ORDER BY u.id DESC').all();
    return res.json(usuarios);
  }
  if (req.usuario.tipo === 'empleado') {
    const empleado = db.prepare('SELECT e.id, e.nombre, e.email, e.telefono, r.nombre as rol_nombre FROM empleados e LEFT JOIN roles r ON e.rol_id = r.id WHERE e.id = ?').get(req.usuario.id);
    return res.json(empleado ? [{ ...empleado, tipo: 'empleado' }] : []);
  }
  const usuario = db.prepare('SELECT u.id, u.nombre, u.email, u.telefono, u.tipo, u.activo, u.trial_start, u.trial_end, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ?').get(req.usuario.id);
  res.json(usuario ? [usuario] : []);
});

router.get('/me', verificarToken, (req, res) => {
  if (req.usuario.tipo === 'empleado') {
    const empleado = db.prepare('SELECT e.id, e.nombre, e.email, e.telefono, r.nombre as rol_nombre FROM empleados e LEFT JOIN roles r ON e.rol_id = r.id WHERE e.id = ?').get(req.usuario.id);
    if (!empleado) return res.status(404).json({ error: 'Empleado no encontrado' });
    return res.json({ ...empleado, tipo: 'empleado' });
  }
  const usuario = db.prepare('SELECT u.id, u.nombre, u.email, u.telefono, u.tipo, u.activo, u.trial_start, u.trial_end, r.nombre as rol_nombre FROM usuarios u LEFT JOIN roles r ON u.rol_id = r.id WHERE u.id = ?').get(req.usuario.id);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(usuario);
});

router.post('/', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { nombre, email, password, tipo, dias_prueba } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existe) return res.status(400).json({ error: 'El email ya está registrado' });

    const hash = bcrypt.hashSync(password, 10);
    const rol = db.prepare('SELECT id FROM roles WHERE nombre = ?').get('admin');
    const trialEnd = dias_prueba ? new Date(Date.now() + dias_prueba * 86400000).toISOString().replace('T', ' ').substring(0, 19) : null;

    const result = db.prepare(
      'INSERT INTO usuarios (nombre, email, password, rol_id, tipo, trial_start, trial_end) VALUES (?, ?, ?, ?, ?, datetime(\'now\', \'-5 hours\'), ?)'
    ).run(nombre, email, hash, rol?.id || 2, tipo || 'cliente', trialEnd);

    logAction(req.usuario.id, req.usuario.nombre, 'Crear usuario', 'usuarios', `Usuario: ${nombre}, Email: ${email}`);
    res.json({ id: result.lastInsertRowid, mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, soloSuperAdmin, (req, res) => {
  try {
    const { nombre, email, activo } = req.body;
    db.prepare('UPDATE usuarios SET nombre = COALESCE(?, nombre), email = COALESCE(?, email), activo = COALESCE(?, activo) WHERE id = ?')
      .run(nombre, email, activo, req.params.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar usuario', 'usuarios', `ID: ${req.params.id}`);
    res.json({ mensaje: 'Usuario actualizado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, soloSuperAdmin, (req, res) => {
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
  logAction(req.usuario.id, req.usuario.nombre, 'Eliminar usuario', 'usuarios', `ID: ${req.params.id}`);
  res.json({ mensaje: 'Usuario eliminado' });
});

module.exports = router;
