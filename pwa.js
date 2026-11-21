(() => {
  const release = document.querySelector('meta[name="n5-release"]').content;
  const workers = /^https?:$/.test(location.protocol) ? navigator.serviceWorker : null;
  const displayMode = matchMedia('(display-mode: standalone)');
  const update = document.getElementById('n5-update');
  const updateMessage = document.getElementById('n5-update-message');
  let registration, installPrompt, activeRelease, updateTimer;
  let lastCheck = 0;
  let checking = false;
  let installingUpdate = false;
  let dismissed = false;
  let registrationFailed = false;
  let installed = false;

  function render() {
    const newVersionActive = activeRelease && activeRelease !== release;
    const updateAvailable = newVersionActive || registration?.waiting;
    update.hidden = !installingUpdate && (dismissed || !updateAvailable);
    updateMessage.textContent = installingUpdate ? 'Đang cập nhật…' : 'Có bản N5 Master Hub mới.';
    update.querySelector('[data-n5-pwa="update"]').disabled = installingUpdate;

    const panel = document.getElementById('n5-pwa-panel');
    if (!panel?.firstElementChild) return;

    const standalone = displayMode.matches || navigator.standalone === true || installed;
    let status = 'Đang chuẩn bị dữ liệu học ngoại tuyến…';
    if (!workers) status = 'Mở website trong trình duyệt hỗ trợ Service Worker để học ngoại tuyến.';
    else if (registrationFailed) status = 'Chưa chuẩn bị được dữ liệu ngoại tuyến. Hãy kiểm tra mạng rồi mở lại ứng dụng.';
    else if (activeRelease) {
      status = navigator.onLine
        ? 'Đã sẵn sàng học ngoại tuyến trên thiết bị này.'
        : 'Đang ngoại tuyến. Tiến độ học được lưu trên thiết bị này.';
    } else if (!navigator.onLine) status = 'Cần kết nối Internet lần đầu để tải dữ liệu học ngoại tuyến.';

    panel.querySelector('[data-n5-pwa-status]').textContent = status;
    panel.querySelector('[data-n5-pwa-install-help]').hidden = standalone;
    panel.querySelector('[data-n5-pwa="install"]').hidden = standalone || !installPrompt;
    const check = panel.querySelector('[data-n5-pwa="check"]');
    check.hidden = !workers;
    check.disabled = checking || installingUpdate;
  }

  window.n5Pwa = {
    mount() {
      const panel = document.getElementById('n5-pwa-panel');
      panel.replaceChildren(document.getElementById('n5-pwa-settings').content.cloneNode(true));
      render();
    },
  };

  async function checkForUpdate(manual = false) {
    if (!workers || checking || installingUpdate || (!manual && Date.now() - lastCheck < 15 * 60 * 1000)) return;
    if (!navigator.onLine) {
      if (manual) showToast('Cần Internet để kiểm tra cập nhật.');
      return;
    }
    checking = true;
    if (manual) dismissed = false;
    render();
    try {
      if (!registration) {
        registration = await workers.register('./sw.js', {updateViaCache: 'none'});
        const onInstalling = () => {
          const worker = registration.installing;
          dismissed = false;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'redundant' && !workers.controller && !registration.active) {
              registrationFailed = true;
            }
            render();
          });
          render();
        };
        registration.addEventListener('updatefound', onInstalling);
        onInstalling();
      } else if (!registration.waiting && !registration.installing) {
        await registration.update();
        if (manual && !registration.installing && !registration.waiting && (!activeRelease || activeRelease === release)) {
          showToast('Ứng dụng đang dùng bản mới nhất.');
        }
      }
      registrationFailed = false;
      lastCheck = Date.now();
      workers.controller?.postMessage('N5_GET_VERSION');
    } catch {
      if (!workers.controller) registrationFailed = true;
      if (manual) showToast('Chưa kiểm tra được cập nhật. Hãy thử lại khi có mạng.');
    } finally {
      checking = false;
      render();
    }
  }

  function applyUpdate() {
    const waiting = registration?.waiting;
    if (installingUpdate || (!waiting && (!activeRelease || activeRelease === release))) return;
    if (!window.confirm('Mở lại ứng dụng để cập nhật? Phiên luyện đang làm dở có thể kết thúc.')) return;
    if (activeRelease && activeRelease !== release) {
      location.reload();
      return;
    }
    installingUpdate = true;
    updateTimer = setTimeout(() => {
      installingUpdate = false;
      render();
      showToast('Cập nhật chưa hoàn tất. Hãy thử lại hoặc mở lại ứng dụng.');
    }, 10000);
    waiting.postMessage('N5_ACTIVATE_UPDATE');
    render();
  }

  document.addEventListener('click', async event => {
    const action = event.target.closest('[data-n5-pwa]')?.dataset.n5Pwa;
    if (action === 'check') checkForUpdate(true);
    if (action === 'update') applyUpdate();
    if (action === 'later') {
      dismissed = true;
      render();
    }
    if (action === 'install' && installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      render();
      try {
        await prompt.prompt();
      } catch {
        showToast('Hãy dùng mục Cài đặt ứng dụng trong menu trình duyệt.');
      }
    }
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    render();
  });
  displayMode.addEventListener?.('change', render);

  if (workers) {
    workers.addEventListener('message', event => {
      if (event.source !== workers.controller || event.data?.type !== 'N5_VERSION') return;
      if (activeRelease !== event.data.release) dismissed = false;
      activeRelease = event.data.release;
      registrationFailed = false;
      if (installingUpdate && activeRelease !== release) {
        clearTimeout(updateTimer);
        location.reload();
        return;
      }
      render();
    });
    workers.addEventListener('controllerchange', () => workers.controller?.postMessage('N5_GET_VERSION'));
    workers.controller?.postMessage('N5_GET_VERSION');
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdate();
    });
    window.addEventListener('pageshow', () => checkForUpdate());
    setInterval(() => {
      if (!document.hidden) checkForUpdate();
    }, 15 * 60 * 1000);
    checkForUpdate();
  }
  window.addEventListener('online', () => {
    lastCheck = 0;
    render();
    checkForUpdate();
  });
  window.addEventListener('offline', render);
})();
