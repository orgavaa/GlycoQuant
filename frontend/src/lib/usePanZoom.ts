import { useCallback, useEffect, useRef, useState } from "react";

export interface PanZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

const MIN_ZOOM = 1.0;
const MAX_ZOOM = 12.0;
const WHEEL_SENSITIVITY = 0.0015;
const CLICK_MOVE_THRESHOLD_PX = 3;

/**
 * Pointer-driven pan/zoom for a CSS-transformed image layer.
 *
 * The returned `onMouseDown` / `onWheel` handlers should be attached to the
 * *outer* container element. Transforms are applied as
 *   transform: translate(panX px, panY px) scale(zoom);
 *   transform-origin: 0 0;
 * on a single inner div that contains every child the user should pan
 * together (image, overlay canvas, etc.).
 *
 * Click-vs-drag is resolved by movement threshold: a mouseup with <3 px
 * total travel fires `onClickRef.current` (image-space hit test), anything
 * larger is treated as a pan.
 */
export function usePanZoom(opts: { onClick?: (clientX: number, clientY: number) => void } = {}) {
  const [state, setState] = useState<PanZoomState>({ zoom: 1, panX: 0, panY: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);
  const [panning, setPanning] = useState(false);

  const onClickRef = useRef(opts.onClick);
  onClickRef.current = opts.onClick;

  const containerRef = useRef<HTMLDivElement | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Left button only.
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: stateRef.current.panX,
      startPanY: stateRef.current.panY,
      moved: false,
    };
  }, []);

  // Global mousemove/up so the drag survives even if the cursor leaves the
  // container — the natural expectation for a microscopy viewer.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD_PX) {
        d.moved = true;
        setPanning(true);
      }
      if (d.moved) {
        setState(s => ({ ...s, panX: d.startPanX + dx, panY: d.startPanY + dy }));
      }
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const wasClick = !d.moved;
      dragRef.current = null;
      setPanning(false);
      if (wasClick) onClickRef.current?.(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Non-passive wheel handler — we need preventDefault to stop page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      setState(s => {
        const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY);
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor));
        if (nextZoom === s.zoom) return s;
        // Anchor zoom at the cursor: keep the image-space point under the cursor fixed.
        // screen = pan + zoom * content → content = (screen - pan) / zoom
        const contentX = (localX - s.panX) / s.zoom;
        const contentY = (localY - s.panY) / s.zoom;
        let panX = localX - contentX * nextZoom;
        let panY = localY - contentY * nextZoom;
        // Fully zoomed-out: snap to origin so the image sits flush in the viewport.
        if (nextZoom <= MIN_ZOOM + 1e-6) {
          panX = 0;
          panY = 0;
        }
        return { zoom: nextZoom, panX, panY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const reset = useCallback(() => setState({ zoom: 1, panX: 0, panY: 0 }), []);

  const zoomBy = useCallback((factor: number) => {
    setState(s => {
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom * factor));
      if (nextZoom === s.zoom) return s;
      const el = containerRef.current;
      if (!el) return { ...s, zoom: nextZoom };
      // Anchor on the viewport centre.
      const rect = el.getBoundingClientRect();
      const localX = rect.width / 2;
      const localY = rect.height / 2;
      const contentX = (localX - s.panX) / s.zoom;
      const contentY = (localY - s.panY) / s.zoom;
      let panX = localX - contentX * nextZoom;
      let panY = localY - contentY * nextZoom;
      if (nextZoom <= MIN_ZOOM + 1e-6) {
        panX = 0;
        panY = 0;
      }
      return { zoom: nextZoom, panX, panY };
    });
  }, []);

  /** Convert a viewport (client) coordinate to image-space content coordinate. */
  const clientToContent = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const s = stateRef.current;
    return { x: (sx - s.panX) / s.zoom, y: (sy - s.panY) / s.zoom };
  }, []);

  return {
    state,
    panning,
    containerRef,
    onMouseDown,
    reset,
    zoomIn: () => zoomBy(1.4),
    zoomOut: () => zoomBy(1 / 1.4),
    clientToContent,
    isAtDefault: state.zoom === 1 && state.panX === 0 && state.panY === 0,
  };
}
