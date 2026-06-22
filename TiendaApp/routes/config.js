const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken, verificarPermiso, requiereModulo } = require('../middleware/auth');
const { logAction } = require('../middleware/logger');

router.get('/', verificarToken, requiereModulo('config'), (req, res) => {
  const isSuper = req.usuario.tipo === 'superadmin';
  const configs = isSuper
    ? db.prepare("SELECT clave, valor FROM configuracion").all()
    : db.prepare("SELECT clave, valor FROM configuracion WHERE usuario_id = ?").all(req.usuario.owner_id);
  const obj = {};
  configs.forEach(c => obj[c.clave] = c.valor);
  res.json(obj);
});

router.put('/', verificarToken, requiereModulo('config'), verificarPermiso('configuracion'), (req, res) => {
  try {
    const updates = req.body;
    const del = db.prepare("DELETE FROM configuracion WHERE usuario_id = ? AND clave = ?");
    const ins = db.prepare("INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)");
    const transaction = db.transaction(() => {
      for (const [clave, valor] of Object.entries(updates)) {
        del.run(req.usuario.owner_id, clave);
        ins.run(req.usuario.owner_id, clave, String(valor));
      }
    });
    transaction();
    logAction(req.usuario.id, req.usuario.nombre, 'Actualizar configuración', 'configuracion', JSON.stringify(Object.keys(updates)));
    res.json({ mensaje: 'Configuración actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
