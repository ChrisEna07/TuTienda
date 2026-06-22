let scannerStream = null;
let scannerActive = false;

function escanearCodigo(onDetect) {
  if (scannerActive) { cerrarEscanner(); return; }
  if (!navigator.mediaDevices?.getUserMedia) {
    Swal.fire({ icon: 'error', title: 'Camara no disponible', text: 'Tu navegador no soporta el acceso a camara.' });
    return;
  }
  scannerActive = true;
  const container = document.createElement('div');
  container.id = 'scannerContainer';
  container.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center';
  container.innerHTML = `
    <div style="position:relative;width:100%;max-width:500px">
      <video id="scannerVideo" autoplay playsinline style="width:100%;border-radius:12px;background:#000;transform:scaleX(-1)"></video>
      <div id="scannerOverlay" style="position:absolute;top:0;left:0;right:0;bottom:0;border:3px solid rgba(108,92,231,0.5);border-radius:12px;box-shadow:inset 0 0 30px rgba(108,92,231,0.2);pointer-events:none">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:70%;height:4px;background:linear-gradient(90deg,transparent,var(--primary),transparent);animation:scannerLine 2s ease-in-out infinite;border-radius:2px"></div>
      </div>
      <p style="color:rgba(255,255,255,0.6);text-align:center;margin-top:12px;font-size:14px"><i class="fas fa-camera"></i> Enfoca el codigo de barras...</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:12px">
        <button class="btn btn-danger" onclick="cerrarEscanner()"><i class="fas fa-times"></i> Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  try {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { min: 640, ideal: 1280 }, height: { min: 480, ideal: 720 } } })
      .then(stream => {
        scannerStream = stream;
        const video = document.getElementById('scannerVideo');
        video.srcObject = stream;
        video.play();

        if ('BarcodeDetector' in window) {
          const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
          const interval = setInterval(() => {
            if (!scannerActive) { clearInterval(interval); return; }
            detector.detect(video).then(codes => {
              if (codes.length > 0) {
                const code = codes[0].rawValue;
                stopScanner();
                if (onDetect) onDetect(code);
              }
            }).catch(() => {});
          }, 500);
          container._detectInterval = interval;
        } else {
          loadHtml5QrCode(video, onDetect);
        }
      })
      .catch(err => {
        scannerActive = false;
        document.body.removeChild(container);
        if (err.name === 'NotAllowedError') Swal.fire({ icon: 'error', title: 'Permiso denegado', text: 'Debes permitir el acceso a la camara para usar el escaner.' });
        else if (err.name === 'NotFoundError') Swal.fire({ icon: 'error', title: 'Camara no encontrada', text: 'No se detecto ninguna camara en el dispositivo.' });
        else Swal.fire({ icon: 'error', title: 'Error de camara', text: err.message });
      });
  } catch (err) {
    scannerActive = false;
    document.body.removeChild(container);
    Swal.fire({ icon: 'error', title: 'Error', text: err.message });
  }
}

function loadHtml5QrCode(video, onDetect) {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  script.onload = () => {
    const qrContainer = document.createElement('div');
    qrContainer.id = 'html5qr';
    qrContainer.style.display = 'none';
    document.body.appendChild(qrContainer);
    const html5QrCode = new Html5Qrcode('html5qr');
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 }, formatsToSupport: [ Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39 ] },
      decodedText => {
        stopScanner();
        if (onDetect) onDetect(decodedText);
      },
      () => {}
    ).catch(err => {
      stopScanner();
      Swal.fire({ icon: 'error', title: 'Error escaner', text: 'No se pudo iniciar el escaner con Html5-Qrcode.' });
    });
    window._html5QrCode = html5QrCode;
  };
  script.onerror = () => {
    stopScanner();
    Swal.fire({ icon: 'error', title: 'Error de carga', text: 'No se pudo cargar la libreria Html5-Qrcode. Verifica tu conexion a internet.' });
  };
  document.head.appendChild(script);
}

function stopScanner() {
  if (window._html5QrCode) {
    try { window._html5QrCode.stop().then(() => { try { window._html5QrCode.clear(); } catch {} }).catch(() => {}); } catch {}
    window._html5QrCode = null;
  }
  const el = document.getElementById('html5qr');
  if (el) document.body.removeChild(el);
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  const container = document.getElementById('scannerContainer');
  if (container) {
    if (container._detectInterval) clearInterval(container._detectInterval);
    document.body.removeChild(container);
  }
  scannerActive = false;
}

function cerrarEscanner() {
  stopScanner();
}

document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes scannerLine {
      0%, 100% { top: 30%; }
      50% { top: 70%; }
    }
  `;
  document.head.appendChild(style);
});
