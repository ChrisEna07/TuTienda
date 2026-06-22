const { initializeDatabase, db } = require('./database');
initializeDatabase();
const r = db.prepare("SELECT COUNT(*) as total FROM sqlite_master WHERE type='table'").get();
console.log('Tablas creadas:', r.total);
const u = db.prepare('SELECT email, nombre FROM usuarios LIMIT 1').get();
console.log('Usuario por defecto:', u.email, '/', u.nombre);
const c = db.prepare('SELECT * FROM configuracion').all();
console.log('Config:', c);
console.log('\nTodo OK!');
