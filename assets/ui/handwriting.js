const SIDE = 480;

export function createHandwritingCanvas(canvas, {getStrokes, start, finish}) {
  const context = canvas.getContext('2d');
  let pointer = null;
  let current;
  let painted = 0;
  let frame = 0;
  let scale = 1;
  let ink = '';

  function draw(stroke, first) {
    if (first >= stroke.length) return;
    const [x,y] = stroke[Math.max(0,first-1)];
    context.beginPath();
    context.moveTo(x,y);
    if (stroke.length === 1) context.lineTo(x+.1,y+.1);
    else for (let index = Math.max(1,first); index < stroke.length; index++) {
      context.lineTo(...stroke[index]);
    }
    context.stroke();
  }

  function flush() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (current) {
      draw(current,painted);
      painted = current.length;
    }
  }

  function redraw() {
    cancelAnimationFrame(frame);
    frame = 0;
    context.setTransform(scale,0,0,scale,0,0);
    context.clearRect(0,0,SIDE,SIDE);
    ink = getComputedStyle(canvas).color;
    context.strokeStyle = ink;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of getStrokes()) draw(stroke,0);
    painted = current?.length || 0;
  }

  function resize() {
    const size = Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1,3));
    if (!size) return;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = canvas.height = size;
    }
    scale = size / SIDE;
    redraw();
  }

  function append(event) {
    const rect = canvas.getBoundingClientRect();
    const clamp = value => Math.max(0,Math.min(SIDE,value));
    const events = event.getCoalescedEvents?.();
    for (const sample of events?.length ? events : [event]) {
      const x = clamp((sample.clientX-rect.left) * SIDE/rect.width);
      const y = clamp((sample.clientY-rect.top) * SIDE/rect.height);
      const last = current.at(-1);
      if (!last || Math.hypot(x-last[0],y-last[1]) >= 1.1) current.push([x,y]);
    }
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function stop(event) {
    if (pointer === null || event && pointer !== event.pointerId) return;
    if (event?.type === 'pointerup') append(event);
    flush();
    const released = pointer;
    pointer = null;
    current = null;
    if (canvas.hasPointerCapture(released)) canvas.releasePointerCapture(released);
    finish();
  }

  canvas.addEventListener('pointerdown',event => {
    if (pointer !== null || !event.isPrimary || event.button !== 0) return;
    if (getComputedStyle(canvas).color !== ink) redraw();
    pointer = event.pointerId;
    current = [];
    painted = 0;
    start(current);
    append(event);
    if (event.isTrusted) canvas.setPointerCapture(pointer);
  });
  canvas.addEventListener('pointermove',event => { if (pointer === event.pointerId) append(event); });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,stop);

  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize',resize);
  new MutationObserver(() => {
    if (canvas.getBoundingClientRect().width && getComputedStyle(canvas).color !== ink) redraw();
  }).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  resize();
  return {redraw,stop,resize};
}
