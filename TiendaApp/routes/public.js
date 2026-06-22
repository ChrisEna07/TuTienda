const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');

router.get('/ofertas', (req, res) => {
  const ofertas = db.prepare("SELECT id, nombre, descripcion, precio, duracion_dias, tipo_pago, precio_mensual, caracteristicas FROM ofertas_software WHERE activo = 1 AND mostrar_landing = 1 ORDER BY precio ASC").all();
  res.json(ofertas);
});

router.post('/registro', (req, res) => {
  try {
    const { nombre, email, password, telefono } = req.body;
    if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contrasena requeridos' });

    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (existe) return res.status(400).json({ error: 'El email ya esta registrado. Intenta iniciar sesion.' });

    const hash = bcrypt.hashSync(password, 10);
    const rol = db.prepare('SELECT id FROM roles WHERE nombre = ?').get('admin');
    const trialEnd = new Date(Date.now() + 15 * 86400000).toISOString().replace('T', ' ').substring(0, 19);

    const result = db.prepare(
      "INSERT INTO usuarios (nombre, email, telefono, password, rol_id, tipo, trial_start, trial_end) VALUES (?, ?, ?, ?, ?, 'cliente', datetime('now', '-5 hours'), ?)"
    ).run(nombre, email, telefono || null, hash, rol?.id || 2, trialEnd);

    db.prepare("INSERT INTO logs (usuario_id, usuario_nombre, accion, modulo, detalle) VALUES (?, ?, ?, ?, ?)")
      .run(result.lastInsertRowid, nombre, 'Registro con prueba gratuita', 'public', `Email: ${email}, Trial: 15 dias`);

    res.json({ id: result.lastInsertRowid, mensaje: 'Registro exitoso! Bienvenido a TuTienda by ChrizDev. Tu prueba gratuita de 15 dias ha comenzado.', trial_end: trialEnd });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard-preview', (req, res) => {
  res.json({
    caracteristicas: [
      { icono: 'fa-box', titulo: 'Inventario Inteligente', descripcion: 'Control de stock en tiempo real con alertas de productos bajos y proximos a vencer.' },
      { icono: 'fa-chart-line', titulo: 'Dashboard Analitico', descripcion: 'Metricas claras de tus productos mas vendidos, ingresos y rendimiento.' },
      { icono: 'fa-users-cog', titulo: 'Roles y Permisos', descripcion: 'Gestiona tu equipo con roles personalizables: admin, cajero, auxiliar y mas.' },
      { icono: 'fa-truck', titulo: 'Proveedores', descripcion: 'Administra tus proveedores y asocia productos directamente.' },
      { icono: 'fa-cash-register', titulo: 'Punto de Venta', descripcion: 'Apertura y cierre de caja con registro de ventas automatizado.' },
      { icono: 'fa-plug', titulo: 'API Integrable', descripcion: 'Preparado para escaner de codigo de barras, pasarelas de pago y e-commerce.' },
      { icono: 'fa-clipboard-list', titulo: 'Auditoria y Logs', descripcion: 'Trazabilidad completa de cada accion realizada en el sistema.' },
      { icono: 'fa-mobile-alt', titulo: 'Multi-plataforma', descripcion: 'Funciona en cualquier dispositivo con navegador web.' }
    ]
  });
});

module.exports = router;
