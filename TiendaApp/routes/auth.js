const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { generarToken, verificarToken } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    let usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);
    if (!usuario) {
      const empleado = db.prepare('SELECT e.*, r.permisos FROM empleados e LEFT JOIN roles r ON e.rol_id = r.id WHERE e.email = ? AND e.activo = 1').get(email);
      if (!empleado) return res.status(401).json({ error: 'Credenciales inválidas' });
      if (!bcrypt.compareSync(password, empleado.password)) return res.status(401).json({ error: 'Credenciales inválidas' });
      const token = generarToken({ id: empleado.id, email: empleado.email, nombre: empleado.nombre, rol_id: empleado.rol_id, tipo: 'empleado', tienda_id: empleado.tienda_usuario_id });
      logAction(empleado.id, empleado.nombre, 'Inicio de sesión empleado', 'auth', `Email: ${email}`);
      const rol = db.prepare('SELECT nombre, permisos FROM roles WHERE id = ?').get(empleado.rol_id);
      return res.json({
        token,
        usuario: {
          id: empleado.id,
          nombre: empleado.nombre,
          email: empleado.email,
          tipo: 'empleado',
          tienda_id: empleado.tienda_usuario_id,
          rol: rol?.nombre || 'sin_rol',
          permisos: JSON.parse(rol?.permisos || '[]')
        }
      });
    }

    if (usuario.tipo === 'cliente') {
      const suscripcion = db.prepare('SELECT * FROM suscripciones WHERE usuario_id = ? AND estado = ? ORDER BY id DESC LIMIT 1').get(usuario.id, 'activa');
      if (!suscripcion) {
        if (usuario.trial_end) {
          const trialEnd = new Date(usuario.trial_end + 'Z');
          if (new Date() > trialEnd) {
            return res.status(403).json({ error: 'Tu período de prueba ha expirado. Contacta al soporte.', codigo: 'TRIAL_EXPIRADO' });
          }
        }
      } else {
        const fin = new Date(suscripcion.fecha_fin + 'Z');
        if (new Date() > fin) {
          db.prepare('UPDATE suscripciones SET estado = ? WHERE id = ?').run('expirada', suscripcion.id);
          return res.status(403).json({ error: 'Tu suscripción ha expirado. Contacta al soporte.', codigo: 'SUSCRIPCION_EXPIRADA' });
        }
      }
    }

    if (!bcrypt.compareSync(password, usuario.password)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generarToken(usuario);
    const rol = db.prepare('SELECT nombre, permisos FROM roles WHERE id = ?').get(usuario.rol_id);

    logAction(usuario.id, usuario.nombre, 'Inicio de sesión', 'auth', `Email: ${email}`);

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        tipo: usuario.tipo,
        rol: rol?.nombre || 'sin_rol',
        permisos: JSON.parse(rol?.permisos || '[]')
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/verificar', verificarToken, (req, res) => {
  let usuario;
  let rolId;
  let storeOwnerId;
  let tipo;

  if (req.usuario.tipo === 'empleado') {
    usuario = db.prepare('SELECT * FROM empleados WHERE id = ?').get(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Empleado no encontrado' });
    rolId = usuario.rol_id;
    storeOwnerId = usuario.tienda_usuario_id;
    tipo = 'empleado';
  } else {
    usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    rolId = usuario.rol_id;
    storeOwnerId = usuario.id;
    tipo = usuario.tipo;
  }

  const rol = db.prepare('SELECT nombre, permisos FROM roles WHERE id = ?').get(rolId);
  let suscripcionModulos = [];
  let tipoCuenta = 'trial';
  let estadoSuscripcion = null;
  let diasRestantes = null;
  let trialEnd = null;

  if (tipo !== 'superadmin') {
    const owner = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(storeOwnerId);
    if (owner) {
      trialEnd = owner.trial_end;
      const suscripcion = db.prepare(`
        SELECT s.*, o.caracteristicas FROM suscripciones s 
        JOIN ofertas_software o ON s.oferta_id = o.id 
        WHERE s.usuario_id = ? AND s.estado = 'activa' 
        ORDER BY s.id DESC LIMIT 1
      `).get(owner.id);
      if (suscripcion) {
        suscripcionModulos = JSON.parse(suscripcion.caracteristicas || '[]');
        tipoCuenta = 'pago';
        estadoSuscripcion = suscripcion.estado;
        const fin = new Date(suscripcion.fecha_fin + 'Z');
        const ahora = new Date();
        diasRestantes = Math.ceil((fin - ahora) / 86400000);
        if (diasRestantes < 0) diasRestantes = 0;
      } else if (owner.trial_end) {
        const fin = new Date(owner.trial_end + 'Z');
        const ahora = new Date();
        diasRestantes = Math.ceil((fin - ahora) / 86400000);
        if (diasRestantes < 0) diasRestantes = 0;
        tipoCuenta = diasRestantes > 0 ? 'trial' : 'expirado';
        estadoSuscripcion = diasRestantes > 0 ? 'trial' : 'expirado';
        suscripcionModulos = ['dashboard', 'inventario', 'ventas', 'apertura', 'empleados', 'proveedores', 'logs', 'config', 'api'];
      } else {
        tipoCuenta = 'sin_plan';
        estadoSuscripcion = 'inactivo';
      }
    }
  }

  res.json({
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      tipo: tipo,
      tienda_id: req.usuario.tipo === 'empleado' ? storeOwnerId : null,
      rol: rol?.nombre || 'sin_rol',
      permisos: JSON.parse(rol?.permisos || '[]'),
      suscripcion_modulos: suscripcionModulos,
      trial_end: trialEnd,
      tipo_cuenta: tipoCuenta,
      estado_suscripcion: estadoSuscripcion,
      dias_restantes: diasRestantes
    }
  });
});

router.post('/cambiar-password', verificarToken, (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!bcrypt.compareSync(password_actual, usuario.password)) {
      return res.status(400).json({ error: 'Contraseña actual incorrecta' });
    }
    const hash = bcrypt.hashSync(password_nueva, 10);
    db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hash, req.usuario.id);
    logAction(req.usuario.id, req.usuario.nombre, 'Cambio de contraseña', 'auth');
    res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
