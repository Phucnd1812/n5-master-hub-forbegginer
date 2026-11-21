(() => {
  const release = document.querySelector('meta[name="n5-release"]').content;
  const workers = /^https?:$/.test(location.protocol) ? navigator.serviceWorker : null;
  const displayMode = matchMedia('(display-mode: standalone)');
  const update = document.getElementById('n5-update');
  const updateMessage = document.getElementById('n5-update-message');
  const checkInterval = 15 * 60 * 1000;
  const retryInterval = 60 * 1000;
  let registration, installPrompt, activeRelease, updateTimer, watchedInstaller;
  let lastCheck = 0;
  let checking = false;
  let installingUpdate = false;
  let dismissed = false;
  let updateFailed = false;
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
    else if (updateFailed && navigator.onLine) status = activeRelease
      ? 'Chưa tải được bản cập nhật. Bạn vẫn có thể học bằng bản hiện tại và thử kiểm tra lại.'
      : 'Chưa chuẩn bị được dữ liệu ngoại tuyến. Hãy thử kiểm tra lại khi có mạng ổn định.';
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

  function watchInstaller() {
    const worker = registration.installing;
    if (!worker || worker === watchedInstaller) return;
    watchedInstaller = worker;
    dismissed = false;
    const report = () => {
      if (worker !== watchedInstaller) return;
      if (worker.state === 'redundant' && !registration.waiting) updateFailed = true;
      else if (worker.state === 'installed' || worker.state === 'activated') updateFailed = false;
      render();
    };
    worker.addEventListener('statechange', report);
    report();
  }

  async function checkForUpdate(manual = false) {
    const interval = updateFailed ? retryInterval : checkInterval;
    if (!workers || checking || installingUpdate || (!manual && Date.now() - lastCheck < interval)) return;
    if (!navigator.onLine) {
      if (manual) showToast('Cần Internet để kiểm tra cập nhật.');
      return;
    }
    checking = true;
    lastCheck = Date.now();
    if (manual) dismissed = false;
    render();
    try {
      if (!registration) {
        registration = await workers.register('./sw.js', {updateViaCache: 'none'});
        registration.addEventListener('updatefound', watchInstaller);
      } else if (!registration.waiting && !registration.installing) {
        const previousInstaller = watchedInstaller;
        await registration.update();
        if (!registration.installing && !registration.waiting && watchedInstaller === previousInstaller) updateFailed = false;
        if (manual && !registration.installing && !registration.waiting && activeRelease === release) {
          showToast(updateFailed ? 'Chưa tải được bản cập nhật. Hãy thử lại sau.' : 'Ứng dụng đang dùng bản mới nhất.');
        }
      }
      watchInstaller();
      workers.controller?.postMessage('N5_GET_VERSION');
    } catch {
      updateFailed = true;
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
      if (activeRelease !== release) updateFailed = false;
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
    }, retryInterval);
    checkForUpdate();
  }
  window.addEventListener('online', () => {
    lastCheck = 0;
    render();
    checkForUpdate();
  });
  window.addEventListener('offline', render);
})();
