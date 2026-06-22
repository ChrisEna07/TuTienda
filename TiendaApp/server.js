const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

initializeDatabase();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/empleados', require('./routes/empleados'));
app.use('/api/inventario', require('./routes/inventario'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/apertura', require('./routes/apertura'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/config', require('./routes/config'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/api-integracion', require('./routes/api-integracion'));
app.use('/api/public', require('./routes/public'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n\x1b[36m========================================\x1b[0m`);
  console.log(`\x1b[36m  \x1b[1mTuTienda by ChrizDev\x1b[0m`);
  console.log(`\x1b[36m  Servidor iniciado en puerto: ${PORT}\x1b[0m`);
  console.log(`\x1b[36m  http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36m========================================\x1b[0m\n`);
});
