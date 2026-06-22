const { db } = require('../database');

function logAction(usuario_id, usuario_nombre, accion, modulo, detalle = '', ip = '') {
  try {
    let tienda_id = usuario_id;
    if (usuario_id) {
      const emp = db.prepare('SELECT tienda_usuario_id FROM empleados WHERE id = ?').get(usuario_id);
      if (emp) {
        tienda_id = emp.tienda_usuario_id;
      }
    }
    db.prepare(
      'INSERT INTO logs (usuario_id, usuario_nombre, tienda_id, accion, modulo, detalle, ip) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(usuario_id, usuario_nombre, tienda_id, accion, modulo, detalle, ip);
  } catch (err) {
    console.error('Error al registrar log:', err.message);
  }
}

function loggingMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (req.usuario && req.method !== 'GET') {
      const modulo = req.baseUrl.replace('/api/', '');
      const accion = `${req.method} ${req.path}`;
      const detalle = JSON.stringify({ body: req.body, query: req.query });
      logAction(req.usuario.id, req.usuario.nombre, accion, modulo, detalle);
    }
    return originalJson(body);
  };
  next();
}

module.exports = { logAction, loggingMiddleware };
