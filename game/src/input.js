// Keyboard and mouse input for Solmar Bay.
// The game reads `down` every frame and `justPressed` for one-shot actions
// (enter car, punch, pause). Mouse drag orbits the camera; a click is also
// the shoot button. Nothing here touches the game state directly.
export function createInput(canvas) {
  const down = new Set();
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let gesture = false;
  const gestureListeners = [];

  function note(code) {
    if (!down.has(code)) justPressed.add(code);
    down.add(code);
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    note(event.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    markGesture();
  }

  function onKeyUp(event) {
    down.delete(event.code);
  }

  function onMouseDown(event) {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    note('Mouse0');
    markGesture();
  }

  function onMouseMove(event) {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onMouseUp(event) {
    dragging = false;
    down.delete('Mouse0');
  }

  function onBlur() {
    down.clear();
    dragging = false;
  }

  function markGesture() {
    if (gesture) return;
    gesture = true;
    for (const fn of gestureListeners) fn();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('touchstart', markGesture, { passive: true });

  return {
    down,
    /** True only on the frame the key or button went down. */
    justPressed(code) { return justPressed.has(code); },
    /** True while any of the codes is held. */
    anyDown(codes) { return codes.some((c) => down.has(c)); },
    /** Mouse movement since the last frame, in pixels; resets on read. */
    takeMouseDelta() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0;
      mouseDY = 0;
      return d;
    },
    /** Call at the end of each frame: one-shot presses expire. */
    endFrame() { justPressed.clear(); },
    /** Called once, on the first key or click: browsers need a gesture for audio. */
    onFirstGesture(fn) { gestureListeners.push(fn); },
  };
}
