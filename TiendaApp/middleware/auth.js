const jwt = require('jsonwebtoken');
const { db } = require('../database');

const SECRET = 'TuTiendaByChrizDev2025SecretKey';

function generarToken(usuario) {
  return jwt.sign({
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol_id: usuario.rol_id,
    tipo: usuario.tipo,
    tienda_id: usuario.tienda_id || null
  }, SECRET, { expiresIn: '24h' });
}

function verificarToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const decoded = jwt.verify(token, SECRET);
    decoded.owner_id = decoded.tipo === 'empleado' ? decoded.tienda_id : decoded.id;
    req.usuario = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function verificarPermiso(...permisosRequeridos) {
  return (req, res, next) => {
    const rol = db.prepare('SELECT permisos FROM roles WHERE id = ?').get(req.usuario.rol_id);
    if (!rol) return res.status(403).json({ error: 'Rol no encontrado' });

    const permisos = JSON.parse(rol.permisos);
    if (permisos.includes('*') || permisosRequeridos.some(p => permisos.includes(p))) {
      next();
    } else {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
  };
}

function soloSuperAdmin(req, res, next) {
  if (req.usuario.tipo !== 'superadmin') {
    return res.status(403).json({ error: 'Solo superadmin puede realizar esta acción' });
  }
  next();
}

function requiereModulo(moduloId) {
  return (req, res, next) => {
    if (req.usuario.tipo === 'superadmin') return next();
    const uid = req.usuario.tienda_id || req.usuario.id;
    
    const sub = db.prepare(`
      SELECT o.caracteristicas FROM suscripciones s
      JOIN ofertas_software o ON s.oferta_id = o.id
      WHERE s.usuario_id = ? AND s.estado = 'activa'
      ORDER BY s.id DESC LIMIT 1
    `).get(uid);
    
    if (sub) {
      const modulos = JSON.parse(sub.caracteristicas || '[]');
      if (!modulos.includes(moduloId)) return res.status(403).json({ error: `Tu plan no incluye el modulo: ${moduloId}` });
      return next();
    }
    
    const owner = db.prepare('SELECT trial_end FROM usuarios WHERE id = ?').get(uid);
    if (owner && owner.trial_end) {
      const trialEnd = new Date(owner.trial_end + 'Z');
      const ahora = new Date();
      if (ahora <= trialEnd) {
        return next();
      } else {
        return res.status(403).json({ error: 'Tu periodo de prueba ha expirado. Por favor adquiere un plan.', codigo: 'TRIAL_EXPIRADO' });
      }
    }
    
    return res.status(403).json({ error: 'No tienes una suscripcion activa' });
  };
}

module.exports = { generarToken, verificarToken, verificarPermiso, soloSuperAdmin, requiereModulo, SECRET };
