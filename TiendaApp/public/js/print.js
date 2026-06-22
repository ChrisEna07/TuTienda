function imprimirComprobante(venta) {
  const storeName = (window.currentUser && window.currentUser.storeName) || document.getElementById('sidebarStoreName')?.textContent || 'TuTienda by ChrizDev';
  const storeConfig = window._storeConfig || {};
  const fecha = new Date(venta.created_at + 'Z');
  const fechaLocal = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
  const horaLocal = fecha.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const win = window.open('', '_blank', 'width=400,height=600');
  win.document.write(`
<!DOCTYPE html>
<html lang="es-CO">
<head><meta charset="UTF-8"><meta name="viewport" content="width=370">
<title>Comprobante #${venta.id} - ${storeName}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #1a1a1a;
    width: 80mm;
    padding: 10px 8px;
    line-height: 1.4;
    background: #fff;
  }
  .header {
    text-align: center;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px dashed #333;
  }
  .store-logo {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #6C5CE7, #00CEC9);
    color: #fff;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 800;
    margin-bottom: 6px;
  }
  .store-name { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  .store-details { font-size: 10px; color: #555; }
  .divider { border-top: 1px dashed #333; margin: 8px 0; }
  .invoice-title { text-align: center; font-size: 14px; font-weight: 700; margin: 6px 0; text-transform: uppercase; }
  .info-row { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
  .info-label { color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }
  thead th { border-bottom: 1px solid #333; border-top: 1px solid #333; padding: 4px 2px; text-align: left; font-size: 10px; text-transform: uppercase; }
  thead th:last-child { text-align: right; }
  thead th:nth-child(2) { text-align: center; }
  tbody td { padding: 3px 2px; vertical-align: top; }
  tbody td:last-child { text-align: right; white-space: nowrap; }
  tbody td:nth-child(2) { text-align: center; }
  .qty-col { width: 40px; text-align: center !important; }
  .price-col { width: 75px; text-align: right !important; }
  .totals { margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; }
  .total-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
  .total-row.grand { font-size: 16px; font-weight: 800; border-top: 2px solid #333; padding-top: 6px; margin-top: 4px; }
  .payment-info { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #333; font-size: 11px; }
  .footer { text-align: center; margin-top: 12px; padding-top: 10px; border-top: 1px dashed #333; font-size: 10px; color: #555; }
  @media print {
    body { margin: 0; padding: 10px 8px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="store-logo">${storeName.charAt(0).toUpperCase()}</div>
    <div class="store-name">${storeName}</div>
    <div class="store-details">${storeConfig.tienda_nit || 'NIT: Pendiente'} | ${storeConfig.tienda_telefono || ''}</div>
  </div>

  <div class="invoice-title">COMPROBANTE DE VENTA</div>

  <div class="info-row"><span class="info-label">Factura #</span><span><strong>${String(venta.id).padStart(6, '0')}</strong></span></div>
  <div class="info-row"><span class="info-label">Fecha</span><span>${fechaLocal}</span></div>
  <div class="info-row"><span class="info-label">Hora</span><span>${horaLocal}</span></div>
  <div class="info-row"><span class="info-label">Atendido por</span><span>${venta.usuario_nombre || '-'}</span></div>
  <div class="info-row"><span class="info-label">Metodo pago</span><span>${venta.metodo_pago || 'Efectivo'}</span></div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Producto</th>
        <th class="qty-col">Cant</th>
        <th class="price-col">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${(venta.detalle || []).map(d => `
        <tr>
          <td>${d.producto_nombre || 'Producto'}</td>
          <td class="qty-col">${d.cantidad}</td>
          <td class="price-col">$${Number(d.subtotal).toLocaleString('es-CO')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>TOTAL</span><span><strong>$${Number(venta.total).toLocaleString('es-CO')}</strong></span></div>
  </div>

  <div class="divider"></div>

  <div class="footer">
    <p><strong>${storeName}</strong></p>
    <p>Software de Administracion by ChrizDev</p>
    <p style="margin-top:4px">Soporte: https://w.app/rtz8lp</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:15px">
    <button onclick="window.print()" style="padding:10px 30px;background:#6C5CE7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px"><i class="fas fa-print"></i> Imprimir</button>
    <button onclick="window.close()" style="padding:10px 30px;background:#E17055;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-left:8px"><i class="fas fa-times"></i> Cerrar</button>
  </div>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</body>
</html>
  `);
  win.document.close();
}
