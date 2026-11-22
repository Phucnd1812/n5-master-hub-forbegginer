(() => {
  const storageKey = 'n5_effects_mode_v1';
  const modes = new Set(['auto', 'full', 'balanced', 'performance']);
  const root = document.documentElement;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const coarsePointer = matchMedia('(pointer: coarse)');
  const canBlur = CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  const canRotate = CSS.supports('rotate', '1 0 0 2deg');

  let mode = 'auto';
  try {
    const saved = localStorage.getItem(storageKey);
    if (modes.has(saved)) mode = saved;
  } catch {}

  let effectiveMode;
  let tracking = false;
  let tilted;
  let tiltFrame = 0;

  function resetTilt() {
    if (!tilted) return;
    if (tiltFrame) cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
    const {element} = tilted;
    element.removeAttribute('data-n5-tilting');
    for (const key of ['--n5-tilt', '--n5-reflection-x', '--n5-reflection-y']) {
      element.style.removeProperty(key);
    }
    tilted = null;
  }

  function paintTilt() {
    tiltFrame = 0;
    if (!tilted?.element.isConnected) { resetTilt(); return; }
    const {element, rect, x, y} = tilted;
    const limit = value => Math.max(-1, Math.min(1, value));
    const across = limit(2 * (x - rect.left) / Math.max(1, rect.width) - 1);
    const down = limit(2 * (y - rect.top) / Math.max(1, rect.height) - 1);
    const degrees = (Math.min(1, Math.hypot(across, down)) * 4).toFixed(2);
    element.style.setProperty('--n5-tilt',
      Number(degrees) ? String(-down) + ' ' + across + ' 0 ' + degrees + 'deg' : '0deg');
    element.style.setProperty('--n5-reflection-x', (across * 15).toFixed(1) + '%');
    element.style.setProperty('--n5-reflection-y', (down * 13).toFixed(1) + '%');
    element.setAttribute('data-n5-tilting', '');
  }

  function move(event) {
    if (event.pointerType !== 'mouse' || event.buttons) { resetTilt(); return; }
    const element = event.target.closest?.('[data-n5-tilt], .flashcard-stage');
    if (!element || element.classList.contains('n5-flashcard-motion')) { resetTilt(); return; }
    if (tilted?.element !== element) {
      resetTilt();
      tilted = {element, rect:element.getBoundingClientRect()};
    }
    tilted.x = event.clientX;
    tilted.y = event.clientY;
    if (!tiltFrame) tiltFrame = requestAnimationFrame(paintTilt);
  }

  function leave(event) {
    if (tilted && (!(event.relatedTarget instanceof Node) || !tilted.element.contains(event.relatedTarget))) {
      resetTilt();
    }
  }

  function trackTilt(enabled) {
    if (tracking === enabled) return;
    tracking = enabled;
    const listen = enabled ? 'addEventListener' : 'removeEventListener';
    document[listen]('pointermove', move, {passive:true});
    document[listen]('pointerout', leave, {passive:true});
    document[listen]('pointercancel', resetTilt, {passive:true});
    document[listen]('pointerdown', resetTilt, {passive:true});
    document[listen]('scroll', resetTilt, {capture:true, passive:true});
    document[listen]('visibilitychange', resetTilt);
    window[listen]('resize', resetTilt, {passive:true});
    window[listen]('blur', resetTilt);
    if (!enabled) resetTilt();
  }

  function resolveMode() {
    if (motion.matches) return 'performance';
    if (mode !== 'auto') return mode;
    const cores = navigator.hardwareConcurrency;
    const memory = navigator.deviceMemory;
    if ((cores && cores <= 2) || (memory && memory <= 2)) return 'performance';
    return finePointer.matches && canBlur && canRotate && cores >= 6 && (!memory || memory >= 4)
      ? 'full' : 'balanced';
  }

  function applyMode() {
    const next = resolveMode();
    const changed = next !== effectiveMode || mode !== root.dataset.n5EffectMode;
    effectiveMode = next;
    root.dataset.n5EffectMode = mode;
    root.dataset.n5Effects = next;
    trackTilt(next === 'full' && finePointer.matches && canRotate);
    if (changed) window.dispatchEvent(new CustomEvent('n5-effects-change', {detail:{mode, effective:next}}));
  }

  window.n5Effects = {
    getMode: () => mode,
    getEffectiveMode: () => effectiveMode,
    setMode(value) {
      if (!modes.has(value)) return false;
      try { localStorage.setItem(storageKey, value); } catch { return false; }
      mode = value;
      applyMode();
      return true;
    },
  };

  function onMediaChange(query, callback) {
    if (query.addEventListener) query.addEventListener('change', callback);
    else query.addListener(callback);
  }

  onMediaChange(motion, applyMode);
  onMediaChange(finePointer, applyMode);
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    mode = modes.has(event.newValue) ? event.newValue : 'auto';
    applyMode();
  });
  applyMode();

  // Safeguard a sheet anchored to the layout viewport in iOS Safari. Pinch
  // zoom is handled by the browser and must not be mistaken for a keyboard.
  const viewport = window.visualViewport;
  if (!viewport) return;
  let viewportFrame = 0;

  function keyboardInsets() {
    viewportFrame = 0;
    const editing = document.activeElement?.matches('textarea, input:not([type]), input:is([type="text"], [type="search"], [type="email"], [type="password"], [type="number"]), [contenteditable="true"]');
    const inset = Math.max(0, root.clientHeight - viewport.height - viewport.offsetTop);
    const showing = coarsePointer.matches && editing && viewport.scale < 1.06 && root.clientHeight - viewport.height > 96;
    root.toggleAttribute('data-n5-keyboard-open', Boolean(showing));
    if (showing) {
      root.style.setProperty('--n5-visual-viewport', Math.floor(viewport.height) + 'px');
      root.style.setProperty('--n5-keyboard-inset', Math.ceil(inset) + 'px');
    } else {
      root.style.removeProperty('--n5-visual-viewport');
      root.style.removeProperty('--n5-keyboard-inset');
    }
  }

  function queueInsets() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(keyboardInsets);
  }

  for (const event of ['resize', 'scroll']) viewport.addEventListener(event, queueInsets, {passive:true});
  document.addEventListener('focusin', queueInsets);
  document.addEventListener('focusout', queueInsets);
})();
