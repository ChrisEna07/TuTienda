const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'tutienda.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      clave TEXT NOT NULL,
      valor TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, clave)
    );

    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      metodo TEXT DEFAULT 'transferencia',
      concepto TEXT,
      referencia TEXT,
      estado TEXT DEFAULT 'pendiente',
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT UNIQUE NOT NULL,
      permisos TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      telefono TEXT,
      rol_id INTEGER,
      tipo TEXT DEFAULT 'cliente',
      activo INTEGER DEFAULT 1,
      trial_start DATETIME,
      trial_end DATETIME,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (rol_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tienda_usuario_id INTEGER,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL,
      telefono TEXT,
      password TEXT NOT NULL,
      rol_id INTEGER NOT NULL,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (tienda_usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (rol_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nombre_empresa TEXT NOT NULL,
      nit TEXT NOT NULL,
      contacto_nombre TEXT,
      contacto_telefono TEXT,
      direccion TEXT,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, nit)
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      UNIQUE(usuario_id, nombre)
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      codigo_barras TEXT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      categoria_id INTEGER,
      proveedor_id INTEGER,
      precio_compra REAL DEFAULT 0,
      precio_venta REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      stock_minimo INTEGER DEFAULT 5,
      unidad TEXT DEFAULT 'unidad',
      fecha_vencimiento DATE,
      imagen TEXT,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (categoria_id) REFERENCES categorias(id),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste')),
      cantidad INTEGER NOT NULL,
      stock_anterior INTEGER NOT NULL,
      stock_nuevo INTEGER NOT NULL,
      motivo TEXT,
      usuario_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS aperturas_cierre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('apertura','cierre')),
      monto_inicial REAL DEFAULT 0,
      monto_final REAL,
      observaciones TEXT,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      total REAL DEFAULT 0,
      metodo_pago TEXT DEFAULT 'efectivo',
      apertura_id INTEGER,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (apertura_id) REFERENCES aperturas_cierre(id)
    );

    CREATE TABLE IF NOT EXISTS ventas_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id),
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      usuario_nombre TEXT,
      tienda_id INTEGER,
      accion TEXT NOT NULL,
      modulo TEXT NOT NULL,
      detalle TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS ofertas_software (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio REAL NOT NULL,
      precio_mensual REAL DEFAULT 0,
      duracion_dias INTEGER NOT NULL,
      tipo_pago TEXT DEFAULT 'unico',
      caracteristicas TEXT DEFAULT '[]',
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours'))
    );

    CREATE TABLE IF NOT EXISTS suscripciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      oferta_id INTEGER,
      fecha_inicio DATETIME NOT NULL,
      fecha_fin DATETIME NOT NULL,
      estado TEXT DEFAULT 'activa',
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (oferta_id) REFERENCES ofertas_software(id)
    );

    CREATE TABLE IF NOT EXISTS api_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      configuracion TEXT DEFAULT '{}',
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', '-5 hours')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  try { db.exec("ALTER TABLE usuarios ADD COLUMN telefono TEXT"); } catch (e) {}
  try { db.exec("ALTER TABLE configuracion ADD COLUMN usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE proveedores ADD COLUMN usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE categorias ADD COLUMN usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE productos ADD COLUMN usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE api_config ADD COLUMN usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE empleados ADD COLUMN tienda_usuario_id INTEGER"); } catch (e) {}
  try { db.exec("ALTER TABLE ofertas_software ADD COLUMN precio_mensual REAL DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE ofertas_software ADD COLUMN tipo_pago TEXT DEFAULT 'unico'"); } catch (e) {}
  try { db.exec("ALTER TABLE ofertas_software ADD COLUMN caracteristicas TEXT DEFAULT '[]'"); } catch (e) {}
  try { db.exec("CREATE TABLE IF NOT EXISTS pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, monto REAL NOT NULL, metodo TEXT DEFAULT 'transferencia', concepto TEXT, referencia TEXT, estado TEXT DEFAULT 'pendiente', created_at DATETIME DEFAULT (datetime('now', '-5 hours')), FOREIGN KEY (usuario_id) REFERENCES usuarios(id))"); } catch (e) {}
  try { db.exec("ALTER TABLE ofertas_software ADD COLUMN mostrar_landing INTEGER DEFAULT 0"); } catch (e) {}
  try { db.exec("UPDATE ofertas_software SET mostrar_landing = 0 WHERE mostrar_landing IS NULL OR mostrar_landing = 1"); } catch (e) {}
  try { db.exec("ALTER TABLE logs ADD COLUMN tienda_id INTEGER"); } catch (e) {}
  try { db.exec("UPDATE logs SET tienda_id = usuario_id WHERE tienda_id IS NULL"); } catch (e) {}

  const rolCount = db.prepare('SELECT COUNT(*) as count FROM roles').get();
  if (rolCount.count === 0) {
    db.prepare('INSERT INTO roles (nombre, permisos) VALUES (?, ?)').run('superadmin', JSON.stringify(['*']));
    db.prepare('INSERT INTO roles (nombre, permisos) VALUES (?, ?)').run('admin', JSON.stringify(['dashboard','inventario','ventas','empleados','proveedores','logs','configuracion','apertura_cierre','api_integracion']));
    db.prepare('INSERT INTO roles (nombre, permisos) VALUES (?, ?)').run('cajero', JSON.stringify(['dashboard','ventas','apertura_cierre','inventario_ver']));
    db.prepare('INSERT INTO roles (nombre, permisos) VALUES (?, ?)').run('auxiliar', JSON.stringify(['dashboard_ver','inventario_ver','ventas_ver']));
  }

  const userCount = db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    const superRol = db.prepare('SELECT id FROM roles WHERE nombre = ?').get('superadmin');
    db.prepare('INSERT INTO usuarios (nombre, email, password, rol_id, tipo) VALUES (?, ?, ?, ?, ?)').run('Super Admin', 'admin@tutienda.com', hash, superRol.id, 'superadmin');
  }

  const configCount = db.prepare('SELECT COUNT(*) as count FROM configuracion').get();
  if (configCount.count === 0) {
    const superId = db.prepare('SELECT id FROM usuarios WHERE tipo = ?').get('superadmin')?.id || 1;
    db.prepare('INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)').run(superId, 'tienda_nombre', 'Mi Tienda');
    db.prepare('INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)').run(superId, 'tienda_footer', '© 2025 TuTienda by ChrizDev - Todos los derechos reservados');
    db.prepare('INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)').run(superId, 'tienda_logo', '');
    db.prepare('INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)').run(superId, 'moneda', 'COP');
    db.prepare('INSERT INTO configuracion (usuario_id, clave, valor) VALUES (?, ?, ?)').run(superId, 'impuesto', '19');
  }
}

module.exports = { db, initializeDatabase };
