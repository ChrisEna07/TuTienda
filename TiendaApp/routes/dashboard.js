const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { verificarToken } = require('../middleware/auth');

router.get('/', verificarToken, (req, res) => {
  try {
    const isSuper = req.usuario.tipo === 'superadmin';
    const uid = req.usuario.owner_id;
    const isSuperParams = !isSuper ? [uid] : [];
    const isSuperParamsVentas = !isSuper ? [uid, uid] : [];

    const totalProductos = db.prepare(`SELECT COUNT(*) as total FROM productos WHERE activo = 1 ${!isSuper ? 'AND usuario_id = ?' : ''}`).get(...isSuperParams).total;
    const totalProveedores = db.prepare(`SELECT COUNT(*) as total FROM proveedores ${!isSuper ? 'WHERE usuario_id = ?' : ''}`).get(...isSuperParams).total;
    const totalEmpleados = db.prepare(`SELECT COUNT(*) as total FROM empleados WHERE activo = 1 ${!isSuper ? 'AND tienda_usuario_id = ?' : ''}`).get(...isSuperParams).total;
    const hoySql = "date('now', '-5 hours')";
    const totalVentasHoy = db.prepare(`SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos FROM ventas WHERE date(created_at) = ${hoySql} ${!isSuper ? 'AND (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}`).get(...isSuperParamsVentas);
    const ventasTotales = db.prepare(`SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as ingresos FROM ventas ${!isSuper ? 'WHERE usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)' : ''}`).get(...isSuperParamsVentas);

    const productosBajoStock = db.prepare(`SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND stock <= stock_minimo AND stock > 0 ${!isSuper ? 'AND usuario_id = ?' : ''}`).get(...isSuperParams).total;
    const productosSinStock = db.prepare(`SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND stock = 0 ${!isSuper ? 'AND usuario_id = ?' : ''}`).get(...isSuperParams).total;
    const productosPorVencer = db.prepare(`SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento <= date('now', '+30 days', '-5 hours') AND fecha_vencimiento >= date('now', '-5 hours') ${!isSuper ? 'AND usuario_id = ?' : ''}`).get(...isSuperParams).total;

    const productosMasVendidos = db.prepare(`
      SELECT p.id, p.nombre, p.stock, SUM(vd.cantidad) as total_vendido, SUM(vd.subtotal) as total_ingresos
      FROM ventas_detalle vd
      JOIN productos p ON vd.producto_id = p.id
      JOIN ventas v ON vd.venta_id = v.id
      WHERE v.created_at >= date('now', '-30 days', '-5 hours') ${!isSuper ? 'AND (v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
      GROUP BY p.id ORDER BY total_vendido DESC LIMIT 10
    `).all(...isSuperParamsVentas);

    const productosAgotarse = db.prepare(`
      SELECT id, nombre, stock, stock_minimo, precio_venta
      FROM productos p WHERE activo = 1 AND stock <= stock_minimo ${!isSuper ? 'AND usuario_id = ?' : ''} ORDER BY stock ASC LIMIT 10
    `).all(...isSuperParams);

    const productosVencimiento = db.prepare(`
      SELECT id, nombre, fecha_vencimiento, stock, precio_venta,
        CAST(julianday(fecha_vencimiento) - julianday('now', '-5 hours') AS INTEGER) as dias_restantes
      FROM productos WHERE activo = 1 AND fecha_vencimiento IS NOT NULL 
      AND fecha_vencimiento <= date('now', '+30 days', '-5 hours')
      AND fecha_vencimiento >= date('now', '-5 hours') ${!isSuper ? 'AND usuario_id = ?' : ''}
      ORDER BY fecha_vencimiento ASC LIMIT 10
    `).all(...isSuperParams);

    const ventasUltimos7 = db.prepare(`
      SELECT date(created_at) as fecha, COUNT(*) as total_ventas, COALESCE(SUM(total), 0) as ingresos
      FROM ventas WHERE created_at >= date('now', '-7 days', '-5 hours') ${!isSuper ? 'AND (usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?))' : ''}
      GROUP BY date(created_at) ORDER BY fecha ASC
    `).all(...isSuperParamsVentas);

    const ingresoTotal = db.prepare(`SELECT COALESCE(SUM(total), 0) as total FROM ventas ${!isSuper ? 'WHERE usuario_id = ? OR usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)' : ''}`).get(...isSuperParamsVentas).total;
    const costoTotal = db.prepare(`SELECT COALESCE(SUM(p.precio_compra * vd.cantidad), 0) as total FROM ventas_detalle vd JOIN ventas v ON vd.venta_id = v.id JOIN productos p ON vd.producto_id = p.id ${!isSuper ? 'WHERE v.usuario_id = ? OR v.usuario_id IN (SELECT id FROM empleados WHERE tienda_usuario_id = ?)' : ''}`).get(...isSuperParamsVentas).total;

    res.json({
      totalProductos, totalProveedores, totalEmpleados,
      ventasHoy: totalVentasHoy, ventasTotales,
      productosBajoStock, productosSinStock, productosPorVencer,
      productosMasVendidos, productosAgotarse, productosVencimiento,
      ventasUltimos7,
      margenGanancia: ingresoTotal > 0 ? ((ingresoTotal - costoTotal) / ingresoTotal * 100).toFixed(1) : 0,
      ingresoTotal, costoTotal
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
