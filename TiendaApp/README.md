# 🏪 TuTienda by ChrizDev

> Una plataforma SaaS premium para la administración ágil de tiendas de barrio, minimarkets y supermercados, diseñada con enfoque en rendimiento, facilidad de uso y operaciones de alta velocidad sin clics excesivos.

---

## 🚀 Descripción General
**TuTienda** es un ecosistema de gestión comercial integral diseñado para optimizar el flujo de trabajo diario de los comerciantes. Combina la robustez de un sistema ERP/POS local con la flexibilidad y el control remoto de un modelo de negocio SaaS (Software as a Service). El software está optimizado para funcionar con alta agilidad mediante el uso de lectores de códigos de barras físicos e integración de cámaras, minimizando drásticamente la fricción y los clics innecesarios para el cajero.

---

## ✨ Características Premium

### 📊 Dashboard Interactivo y Métricas Dinámicas
* **Redirección de Filtros Directa**: Al hacer clic en las tarjetas del Dashboard (como "Bajo Stock" o "Por Vencer"), el sistema redirige automáticamente al usuario al módulo correspondiente, aplicando los filtros de manera instantánea.
* **Banner de Filtro Activo**: Muestra una indicación clara de los filtros aplicados en el inventario y permite borrarlos con un solo clic.

### 🔔 Panel Reactivo de Notificaciones (Campanita)
* **Monitoreo en Tiempo Real**: Un sistema inteligente incorporado en la cabecera que notifica visualmente sobre productos próximos a vencer (30 días) y productos sin existencias o con stock bajo.
* **Badges Dinámicos**: Indicadores numéricos vibrantes y detallados con enlaces de acceso rápido a los productos afectados.

### ⚡ Venta POS Ágil (Punto de Venta por Código de Barras)
* **Entrada Autofocus**: La ventana de ventas POS se enfoca automáticamente al abrirse, permitiendo la lectura directa y continua con lectores de códigos de barras (pistola USB) sin tocar el mouse.
* **Feedback de Audio (BEEP)**: Emite un sonido de pitido sintético de alta calidad mediante la API de Web Audio para confirmar un escaneo exitoso al cajero.
* **Escáner por Cámara Integrado**: Lector de códigos de barras por cámara web o móvil con respaldo de la librería `Html5-Qrcode` y la API nativa de `BarcodeDetector`.

### 👑 Gestión de Suscripciones Remota (Super Admin)
* **Soporte SaaS Multi-Tienda**: Los administradores de la plataforma pueden controlar y extender suscripciones de forma remota desde el panel Super Admin cuando se registra el pago.
* **Extensión Inteligente**: Si el cliente ya tiene una suscripción activa de un plan, la renovación extiende la fecha de vencimiento existente respetando los días restantes de gracia, en lugar de sobreescribirlos.

---

## 📦 Planes de Software Incorporados

El sistema siembra automáticamente los siguientes tres planes de suscripción preconfigurados al inicializar la base de datos:

| Nombre del Plan | Inversión Inicial (App) | Mensualidad (Cloud) | Módulos Incluidos |
| :--- | :---: | :---: | :--- |
| **Plan Inicial** | $350,000 COP | $60,000 COP/mes | Inventario, Ventas |
| **Plan Minimarket** | $400,000 COP | $120,000 COP/mes | Inventario, Ventas, APIs, Empleados, Configuración |
| **Plan SuperMarket** | $450,000 COP | $180,000 COP/mes | Todos los módulos habilitados (excepto Super Admin) |

---

## 🛠️ Stack Tecnológico

* **Backend**: Node.js, Express Framework.
* **Base de Datos**: SQLite3 / Better-SQLite3 para una persistencia local ultrarrápida, consistente y segura con soporte de transacciones ACID.
* **Frontend**: HTML5 Semántico, Vanilla JavaScript (sin frameworks pesados para garantizar máxima velocidad y carga instantánea), CSS3 personalizado con variables globales, animaciones fluidas y efectos de elevación hover.
* **Librerías Adicionales**: SweetAlert2 (alertas estilizadas), FontAwesome (iconos), Lottie (animaciones interactivas en login).

---

## 💻 Instalación y Configuración

### Requisitos Previos
* **Node.js** v16.x o superior instalado.
* Conexión a Internet para la carga inicial de scripts CDN (Lottie, SweetAlert2, FontAwesome, Html5-Qrcode).

### Pasos de Instalación

1. Clona o copia la carpeta del proyecto en tu entorno local.
2. Abre la consola de comandos en la ruta `TiendaApp` e instala las dependencias necesarias:
   ```bash
   npm install
   ```
3. Ejecuta el aplicativo mediante los scripts automatizados:
   * **`iniciar.bat`**: Inicia el servidor de producción local.
   * **`start.bat`**: Levanta el servidor del backend y limpia los puertos ocupados.

El servidor estará escuchando en el puerto `3000`. Accede desde tu navegador en:
🔗 **[http://localhost:3000](http://localhost:3000)**

### Credenciales por Defecto (Super Admin)
* **Usuario**: `admin@tutienda.com`
* **Contraseña**: `admin123`

---

## 📂 Estructura de Archivos Principal

* [server.js](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/server.js): Punto de entrada de la aplicación Express.
* [database.js](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/database.js): Definición de tablas SQLite y semilla de datos (planes base).
* [routes/superadmin.js](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/routes/superadmin.js): Endpoints de renovación remota de suscripciones y administración general de clientes.
* [public/index.html](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/public/index.html): Estructura del portal y contenedor de notificaciones de la campanita.
* [public/css/style.css](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/public/css/style.css): Estilos visuales del dashboard, campanita de notificaciones y diseño adaptativo.
* [public/js/app.js](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/public/js/app.js): Lógica del cliente, dashboard dinámico, lectura continua y procesado de notificaciones.
* [public/js/scanner.js](file:///c:/Users/gamve/Desktop/TT-byChrizDev/TiendaApp/public/js/scanner.js): Manejo del flujo de cámara web e integración de Html5QrCode.

---
Elaborado con 💜 por **ChrizDev** y optimizado para el éxito comercial.
