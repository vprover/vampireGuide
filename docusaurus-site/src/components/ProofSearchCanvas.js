// src/components/ProofSearchCanvas.js
import React, {useEffect, useRef} from 'react';

const LIGHT_COLORS = {
  new: '#ff9fb2',
  active: '#b62929',
  passive: '#8a8a8a',
  selected: '#f97316',
  default: '#1a1a1a',
  text: '#0b0b0b',
  glow: 'rgba(140, 20, 20, 0.22)',
  bg0: '#fbfbfb',
  bg1: '#f2f2f2',
  grid: 'rgba(20, 20, 20, 0.08)',
  link: 'rgba(60, 60, 60, 0.35)',
  tooltipBg: 'rgba(18, 12, 12, 0.9)',
  tooltipStroke: 'rgba(255,255,255,0.12)',
  tooltipText: '#f8f4f4',
  tooltipOp: '#ff6b6b',
  tooltipVar: '#ffd166',
  tooltipNum: '#f59e0b',
  tooltipBool: '#ffffff',
  tooltipSym: '#f8f4f4',
  tooltipPunct: '#c0b0b0',
  subsumed: '#ff4d4d',
  negated: '#7c3aed',
  highlight: '#fff59d',
};

const DARK_COLORS = {
  new: '#ff3b5c',
  active: '#9a1b1b',
  passive: '#5f5f5f',
  selected: '#f59e0b',
  default: '#e0e0e0',
  text: '#f4f1f1',
  glow: 'rgba(255, 40, 40, 0.22)',
  bg0: '#0a0a0a',
  bg1: '#101010',
  grid: 'rgba(255, 255, 255, 0.08)',
  link: 'rgba(200, 200, 200, 0.28)',
  tooltipBg: 'rgba(18, 10, 10, 0.95)',
  tooltipStroke: 'rgba(255,255,255,0.2)',
  tooltipText: '#f3eaea',
  tooltipOp: '#ff8080',
  tooltipVar: '#ffd78a',
  tooltipNum: '#fbbf24',
  tooltipBool: '#ffffff',
  tooltipSym: '#f3eaea',
  tooltipPunct: '#b9aaaa',
  subsumed: '#ff4d4d',
  negated: '#c084fc',
  highlight: '#fff59d',
};

function getPalette(theme) {
  return theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export default function ProofSearchCanvas({
  clauses,
  edges = [],
  selectedId,
  awaitingInput,
  resetToken,
  layoutMode = 'radial',
  onSelect,
}) {
  const canvasRef = useRef(null);
  const nodesRef = useRef(new Map());
  const hoverRef = useRef(null);
  const dragRef = useRef(null);
  const edgesRef = useRef([]);
  const layoutRef = useRef({targets: new Map(), dirty: true});
  const sizeRef = useRef({w: 0, h: 0, dpr: 1});
  const cameraRef = useRef({zoom: 1, panX: 0, panY: 0});
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const themeRef = useRef('light');
  const tapRef = useRef({time: 0, id: null, x: 0, y: 0});
  const hoverFadeRef = useRef({id: null, alpha: 0, lastTs: 0});

  useEffect(() => {
    nodesRef.current.clear();
    hoverRef.current = null;
    layoutRef.current = {targets: new Map(), dirty: true};
  }, [resetToken]);

  useEffect(() => {
    edgesRef.current = Array.isArray(edges) ? edges : [];
    layoutRef.current.dirty = true;
  }, [edges]);

  useEffect(() => {
    layoutRef.current.dirty = true;
  }, [layoutMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const update = () => {
      themeRef.current = root?.dataset?.theme === 'dark' ? 'dark' : 'light';
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(root, {attributes: true, attributeFilter: ['data-theme']});
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const map = nodesRef.current;
    const seen = new Set();
    const now = performance.now();
    const {w, h} = sizeRef.current;
    const baseX = w ? w * 0.5 : 160;
    const baseY = h ? h * 0.5 : 140;
    clauses.forEach((clause) => {
      const id = String(clause.id);
      seen.add(id);
      if (!map.has(id)) {
        const angle = seededRandom(`${id}:a`) * Math.PI * 2;
        const radius = 40 + seededRandom(`${id}:r`) * 60;
        map.set(id, {
          id,
          text: clause.text || '',
          status: clause.status || 'new',
          prevStatus: null,
          statusChangedAt: now,
          subsumed: Boolean(clause.subsumed),
          negated: Boolean(clause.negated),
          x: baseX + Math.cos(angle) * radius,
          y: baseY + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          bornAt: now,
        });
      } else {
        const node = map.get(id);
        node.text = clause.text || node.text;
        const nextStatus = clause.status || node.status;
        if (nextStatus !== node.status) {
          if (
            node.status === 'new' &&
            nextStatus === 'passive' &&
            typeof window !== 'undefined'
          ) {
            // eslint-disable-next-line no-console
            console.log(`[viz] clause ${node.id} new -> passive`);
          }
          node.prevStatus = node.status;
          node.status = nextStatus;
          node.statusChangedAt = now;
        }
        node.subsumed = Boolean(clause.subsumed);
        node.negated = Boolean(clause.negated);
      }
    });
    // Remove nodes that are no longer in the current clause set
    map.forEach((node, key) => {
      if (!seen.has(node.id)) {
        map.delete(key);
      }
    });
    layoutRef.current.dirty = true;
  }, [clauses]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const parent = canvas.parentElement;
    if (!parent) return undefined;
    let rafId = null;
    let pending = null;
    const applySize = () => {
      rafId = null;
      if (!pending) return;
      const {width, height, dpr} = pending;
      pending = null;
      const nextW = Math.max(1, Math.floor(width * dpr));
      const nextH = Math.max(1, Math.floor(height * dpr));
      const prev = sizeRef.current;
      if (prev.w === width && prev.h === height && prev.dpr === dpr) {
        return;
      }
      sizeRef.current = {w: width, h: height, dpr};
      canvas.width = nextW;
      canvas.height = nextH;
      layoutRef.current.dirty = true;
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      pending = {width: rect.width, height: rect.height, dpr};
      if (rafId == null) {
        rafId = requestAnimationFrame(applySize);
      }
    });
    ro.observe(parent);
    return () => {
      ro.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let active = true;

    const draw = (ts) => {
      if (!active) return;
      timeRef.current = ts;
      const {w, h, dpr} = sizeRef.current;
      if (!w || !h) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const {zoom, panX, panY} = cameraRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const palette = getPalette(themeRef.current);

      // Background gradient (screen space)
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, palette.bg0);
      gradient.addColorStop(1, palette.bg1);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Zoomed world transform
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, panX * dpr, panY * dpr);

      const nodes = Array.from(nodesRef.current.values());
      const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
      const count = nodes.length;
      const viewW = w / zoom;
      const viewH = h / zoom;
      const minX = (-panX) / zoom;
      const minY = (-panY) / zoom;
      const maxX = minX + viewW;
      const maxY = minY + viewH;
      const centerX = minX + viewW * 0.5;
      const centerY = minY + viewH * 0.5;
      const dragState = dragRef.current;
      const grabbedId = dragState && dragState.type === 'node' ? dragState.id : null;

      // Subtle grid (world space)
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      const grid = 48;
      const startX = Math.floor(minX / grid) * grid;
      const endX = maxX + grid;
      const startY = Math.floor(minY / grid) * grid;
      const endY = maxY + grid;
      for (let x = startX; x <= endX; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, minY);
        ctx.lineTo(x, maxY);
        ctx.stroke();
      }
      for (let y = startY; y <= endY; y += grid) {
        ctx.beginPath();
        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
        ctx.stroke();
      }

      if (layoutRef.current.dirty) {
        layoutRef.current.targets = computeTargets(nodes, edgesRef.current, viewW, viewH, layoutMode, minX, minY);
        layoutRef.current.dirty = false;
      }
      const targets = layoutRef.current.targets;

      // Physics step
      const maxPairwise = 140;
      if (count <= maxPairwise) {
        for (let i = 0; i < count; i += 1) {
          const a = nodes[i];
          for (let j = i + 1; j < count; j += 1) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist2 = dx * dx + dy * dy + 0.01;
            const force = 60 / dist2;
            const fx = force * dx;
            const fy = force * dy;
            if (grabbedId && String(a.id) === String(grabbedId)) {
              b.vx -= fx;
              b.vy -= fy;
            } else if (grabbedId && String(b.id) === String(grabbedId)) {
              a.vx += fx;
              a.vy += fy;
            } else {
              a.vx += fx;
              a.vy += fy;
              b.vx -= fx;
              b.vy -= fy;
            }
          }
        }
      } else {
        for (let i = 0; i < count; i += 1) {
          const a = nodes[i];
          const jitter = (Math.random() - 0.5) * 0.06;
          a.vx += jitter;
          a.vy += jitter;
        }
      }

      for (let i = 0; i < count; i += 1) {
        const node = nodes[i];
        const grabbed = grabbedId && String(node.id) === String(grabbedId);
        const dragging = grabbed && dragState?.dragging;
        if (!dragging) {
          const target = targets.get(String(node.id));
          if (target) {
            // Pull back to the layout position.
            node.vx += (target.x - node.x) * 0.02;
            node.vy += (target.y - node.y) * 0.02;
          } else {
            node.vx += (centerX - node.x) * 0.001;
            node.vy += (centerY - node.y) * 0.001;
          }
          node.vx *= 0.78;
          node.vy *= 0.78;
        } else {
          node.vx = 0;
          node.vy = 0;
        }
        if (!grabbed) {
          node.x += node.vx;
          node.y += node.vy;
        }

        const pad = 28;
        node.x = clamp(node.x, minX + pad, maxX - pad);
        node.y = clamp(node.y, minY + pad, maxY - pad);
      }

      // Directed edges from parents to children
      const edgeList = edgesRef.current;
      const hoverId = hoverRef.current?.node?.id || null;
      const fade = hoverFadeRef.current;
      if (hoverId && hoverId !== fade.id) {
        fade.id = hoverId;
        fade.alpha = 0;
        fade.lastTs = ts;
      }
      if (fade.lastTs == null) fade.lastTs = ts;
      const dt = Math.min(1, (ts - fade.lastTs) / 400);
      const target = hoverId ? 1 : 0;
      if (target > (fade.alpha || 0)) {
        fade.alpha = Math.min(1, (fade.alpha || 0) + dt);
      } else if (target < (fade.alpha || 0)) {
        fade.alpha = Math.max(0, (fade.alpha || 0) - dt);
      }
      fade.lastTs = ts;
      if (!hoverId && fade.alpha === 0) {
        fade.id = null;
      }
      const highlightId = fade.id;
      const highlightAlpha = fade.alpha || 0;
      const highlight = highlightId ? computeHighlightSets(highlightId, edgeList) : null;
      if (edgeList && edgeList.length) {
        ctx.strokeStyle = palette.link;
        ctx.lineWidth = 1.4;
        const maxEdges = 500;
        const step = edgeList.length > maxEdges ? Math.ceil(edgeList.length / maxEdges) : 1;
        for (let i = 0; i < edgeList.length; i += step) {
          const edge = edgeList[i];
          const from = nodeMap.get(String(edge.from));
          const to = nodeMap.get(String(edge.to));
          if (!from || !to) continue;
          drawArrow(ctx, from.x, from.y, to.x, to.y);
        }
        if (highlight?.edgeKeys?.size && highlightAlpha > 0) {
          ctx.save();
          ctx.strokeStyle = '#c1121f';
          ctx.lineWidth = 3;
          ctx.globalAlpha = 0.55 * highlightAlpha;
          ctx.shadowColor = palette.highlight;
          ctx.shadowBlur = 14 * highlightAlpha;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          for (let i = 0; i < edgeList.length; i += step) {
            const edge = edgeList[i];
            if (!highlight.edgeKeys.has(`${edge.from}->${edge.to}`)) continue;
            const from = nodeMap.get(String(edge.from));
            const to = nodeMap.get(String(edge.to));
            if (!from || !to) continue;
            drawArrow(ctx, from.x, from.y, to.x, to.y);
          }
          ctx.strokeStyle = palette.link;
          ctx.lineWidth = 1.6;
          ctx.globalAlpha = 0.95 * highlightAlpha;
          ctx.shadowBlur = 0;
          for (let i = 0; i < edgeList.length; i += step) {
            const edge = edgeList[i];
            if (!highlight.edgeKeys.has(`${edge.from}->${edge.to}`)) continue;
            const from = nodeMap.get(String(edge.from));
            const to = nodeMap.get(String(edge.to));
            if (!from || !to) continue;
            drawArrow(ctx, from.x, from.y, to.x, to.y);
          }
          ctx.restore();
        }
      }

      // Nodes
      nodes.forEach((node) => {
        const age = (ts - node.bornAt) / 1000;
        const pulse = awaitingInput && node.status === 'passive'
          ? 1 + 0.06 * Math.sin(ts / 280 + Number(node.id) * 0.3)
          : 1;
        const baseRadius = 18;
        const hoverScale = node.id === hoverId ? 1.12 : 1;
        const radius = baseRadius * hoverScale;
        let color = node.id === String(selectedId)
          ? palette.selected
          : (palette[node.status] || palette.default);
        if (node.prevStatus && node.prevStatus !== node.status && node.id !== String(selectedId)) {
          const prev = palette[node.prevStatus] || palette.default;
          const t = clamp((ts - (node.statusChangedAt || ts)) / 1500, 0, 1);
          color = mixColor(prev, color, t);
          if (t >= 1) {
            node.prevStatus = null;
          }
        }

        if (highlight?.nodes?.has(String(node.id)) && highlightAlpha > 0) {
          const inner = radius * pulse + 2;
          const outer = radius * pulse + 20;
          const grad = ctx.createRadialGradient(node.x, node.y, inner, node.x, node.y, outer);
          grad.addColorStop(0, rgbaFrom(palette.highlight, 0.75 * highlightAlpha));
          grad.addColorStop(0.5, rgbaFrom(palette.highlight, 0.35 * highlightAlpha));
          grad.addColorStop(1, rgbaFrom(palette.highlight, 0));
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(node.x, node.y, outer, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.beginPath();
        const isFalse = isFalseClause(node.text);
        if (isFalse) {
          ctx.fillStyle = themeRef.current === 'dark' ? '#000000' : '#ffffff';
        } else {
          ctx.fillStyle = color;
        }
        ctx.globalAlpha = 0.95;
        ctx.arc(node.x, node.y, radius * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.globalAlpha = 0.18 + Math.min(0.2, age * 0.05);
        ctx.strokeStyle = palette.glow;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * pulse + 6, 0, Math.PI * 2);
        ctx.stroke();

        if (!node.subsumed) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = themeRef.current === 'dark' ? '#ffffff' : '#000000';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * pulse + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (node.subsumed) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = palette.subsumed;
          ctx.lineWidth = 2.2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * pulse + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (node.negated) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = palette.negated;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * pulse - 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Label
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.text;
        const minIdFont = 10;
        const fontPx = Math.max(12, minIdFont / zoom);
        ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (isFalse) {
          const trophySize = Math.max(12, 10 / zoom);
          const gap = Math.max(4, 3 / zoom);
          const total = trophySize + gap + fontPx;
          const startY = node.y - total / 2;
          const trophyY = startY + trophySize / 2;
          const idY = startY + trophySize + gap + fontPx / 2;
          ctx.textBaseline = 'middle';
          ctx.fillText(node.id, node.x, idY);
          ctx.font = `${trophySize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.fillText('🏆', node.x, trophyY);
        } else {
          ctx.fillText(node.id, node.x, node.y);
        }
      });

      // Hover tooltip
      const hover = hoverRef.current;
      if (hover && hover.node) {
        const node = hover.node;
        const screenX = node.x * zoom + panX;
        const screenY = node.y * zoom + panY;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pad = 10;
        const maxWidth = Math.min(340, w - 20);
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        const lineHeight = 16;
        const tokens = tokenizeClause(node.text || '');
        const lines = wrapTokens(ctx, tokens, maxWidth - pad * 2);
        const lineWidths = lines.map((line) =>
          line.reduce((sum, tok) => sum + ctx.measureText(tok.text).width, 0)
        );
        const contentWidth = Math.min(
          maxWidth,
          Math.max(140, ...lineWidths.map((w) => w + pad * 2))
        );
        const boxWidth = Math.min(maxWidth, contentWidth);
        const boxHeight = pad * 2 + lineHeight * Math.max(1, lines.length);
        const boxX = clamp(screenX + 20, 10, w - boxWidth - 10);
        const boxY = clamp(screenY + 20, 10, h - boxHeight - 10);

        ctx.fillStyle = palette.tooltipBg;
        ctx.strokeStyle = palette.tooltipStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((line, idx) => {
          let cursorX = boxX + pad;
          const y = boxY + pad + idx * lineHeight;
          line.forEach((tok) => {
            if (!tok.text) return;
            ctx.fillStyle = tokenColor(tok.type, palette);
            ctx.fillText(tok.text, cursorX, y);
            cursorX += ctx.measureText(tok.text).width;
          });
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [awaitingInput, selectedId, layoutMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const handleMove = (ev) => {
      if (ev.pointerType === 'touch') return;
      const {w, h} = sizeRef.current;
      const rect = canvas.getBoundingClientRect();
      const {zoom, panX, panY} = cameraRef.current;
      const x = (ev.clientX - rect.left - panX) / zoom;
      const y = (ev.clientY - rect.top - panY) / zoom;
      if (!w || !h) return;

      const dragging = dragRef.current;
      if (dragging) {
        if (dragging.type === 'pan') {
          const dx = ev.clientX - dragging.startClientX;
          const dy = ev.clientY - dragging.startClientY;
          cameraRef.current.panX = dragging.startPanX + dx;
          cameraRef.current.panY = dragging.startPanY + dy;
          canvas.style.cursor = 'grabbing';
          return;
        }
        const node = nodesRef.current.get(dragging.id);
        if (node) {
          const dx = x - dragging.startX;
          const dy = y - dragging.startY;
          const distance = Math.hypot(dx, dy);
          if (!dragging.dragging && distance > 4) {
            dragging.dragging = true;
          }
          if (dragging.dragging) {
            node.x = x + dragging.offsetX;
            node.y = y + dragging.offsetY;
            node.vx = 0;
            node.vy = 0;
          }
        }
        canvas.style.cursor = 'grabbing';
        return;
      }

      let nearest = null;
      let best = Infinity;
      const hitRadius = 28 / zoom;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < hitRadius && dist < best) {
          best = dist;
          nearest = node;
        }
      });
      hoverRef.current = nearest ? {node: nearest} : null;
      canvas.style.cursor = nearest ? 'pointer' : 'grab';
    };
    const handleLeave = () => {
      hoverRef.current = null;
      canvas.style.cursor = 'default';
    };
    const handleDown = (ev) => {
      if (ev.pointerType === 'touch') return;
      const rect = canvas.getBoundingClientRect();
      const {zoom, panX, panY} = cameraRef.current;
      const x = (ev.clientX - rect.left - panX) / zoom;
      const y = (ev.clientY - rect.top - panY) / zoom;
      let chosen = null;
      let best = Infinity;
      const hitRadius = 28 / zoom;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < hitRadius && dist < best) {
          best = dist;
          chosen = node;
        }
      });
      if (chosen) {
        dragRef.current = {
          type: 'node',
          id: chosen.id,
          offsetX: chosen.x - x,
          offsetY: chosen.y - y,
          startX: x,
          startY: y,
          dragging: false,
        };
        chosen.vx = 0;
        chosen.vy = 0;
      } else {
        dragRef.current = {
          type: 'pan',
          startClientX: ev.clientX,
          startClientY: ev.clientY,
          startPanX: panX,
          startPanY: panY,
        };
        canvas.style.cursor = 'grabbing';
      }
    };
    const handleUp = (ev) => {
      if (ev?.pointerType === 'touch') return;
      const state = dragRef.current;
      if (state && state.type === 'node' && state.dragging) {
        const node = nodesRef.current.get(state.id);
        if (node) {
        }
      }
      dragRef.current = null;
      canvas.style.cursor = 'grab';
    };
    const handleDbl = (ev) => {
      if (!onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const {zoom, panX, panY} = cameraRef.current;
      const x = (ev.clientX - rect.left - panX) / zoom;
      const y = (ev.clientY - rect.top - panY) / zoom;
      let chosen = null;
      let best = Infinity;
      const hitRadius = 28 / zoom;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < hitRadius && dist < best) {
          best = dist;
          chosen = node;
        }
      });
      if (chosen && chosen.status === 'passive') {
        onSelect(chosen.id);
      }
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
    canvas.addEventListener('pointerdown', handleDown);
    canvas.addEventListener('pointerup', handleUp);
    canvas.addEventListener('pointerleave', handleUp);
    canvas.addEventListener('dblclick', handleDbl);
    const handleTouchStart = (ev) => {
      if (ev.touches.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const {zoom, panX, panY} = cameraRef.current;
      if (ev.touches.length >= 2) {
        ev.preventDefault();
        const t1 = ev.touches[0];
        const t2 = ev.touches[1];
        const cX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const cY = (t1.clientY + t2.clientY) / 2 - rect.top;
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const dist = Math.hypot(dx, dy);
        const worldX = (cX - panX) / zoom;
        const worldY = (cY - panY) / zoom;
        dragRef.current = {
          type: 'pinch',
          startDist: Math.max(dist, 1),
          startZoom: zoom,
          startPanX: panX,
          startPanY: panY,
          worldX,
          worldY,
        };
        canvas.style.cursor = 'grabbing';
        return;
      }

      const t = ev.touches[0];
      const x = (t.clientX - rect.left - panX) / zoom;
      const y = (t.clientY - rect.top - panY) / zoom;
      let chosen = null;
      let best = Infinity;
      const hitRadius = 28 / zoom;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < hitRadius && dist < best) {
          best = dist;
          chosen = node;
        }
      });
      if (chosen) {
        ev.preventDefault();
        hoverRef.current = {node: chosen};
        dragRef.current = {
          type: 'node',
          id: chosen.id,
          offsetX: chosen.x - x,
          offsetY: chosen.y - y,
          startX: x,
          startY: y,
          startTime: performance.now(),
          dragging: false,
        };
        chosen.vx = 0;
        chosen.vy = 0;
      } else {
        hoverRef.current = null;
        dragRef.current = null;
      }
    };
    const handleTouchMove = (ev) => {
      if (ev.touches.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      const state = dragRef.current;
      const {zoom, panX, panY} = cameraRef.current;
      if (ev.touches.length >= 2) {
        ev.preventDefault();
        const t1 = ev.touches[0];
        const t2 = ev.touches[1];
        const cX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const cY = (t1.clientY + t2.clientY) / 2 - rect.top;
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const dist = Math.hypot(dx, dy);
        let start = state;
        if (!start || start.type !== 'pinch') {
          const worldX = (cX - panX) / zoom;
          const worldY = (cY - panY) / zoom;
          start = {
            type: 'pinch',
            startDist: Math.max(dist, 1),
            startZoom: zoom,
            startPanX: panX,
            startPanY: panY,
            worldX,
            worldY,
          };
          dragRef.current = start;
        }
        const nextZoom = clamp(start.startZoom * (dist / start.startDist), 0.4, 2.5);
        cameraRef.current.zoom = nextZoom;
        cameraRef.current.panX = cX - start.worldX * nextZoom;
        cameraRef.current.panY = cY - start.worldY * nextZoom;
        canvas.style.cursor = 'grabbing';
        return;
      }

      if (state && state.type === 'node') {
        ev.preventDefault();
        const t = ev.touches[0];
        const x = (t.clientX - rect.left - panX) / zoom;
        const y = (t.clientY - rect.top - panY) / zoom;
        const node = nodesRef.current.get(state.id);
        if (node) {
          const dx = x - state.startX;
          const dy = y - state.startY;
          const distance = Math.hypot(dx, dy);
          if (!state.dragging && distance > 4) {
            state.dragging = true;
          }
          if (state.dragging) {
            node.x = x + state.offsetX;
            node.y = y + state.offsetY;
            node.vx = 0;
            node.vy = 0;
          }
        }
      }
    };
    const handleTouchEnd = (ev) => {
      if (ev.touches.length >= 2) return;
      const state = dragRef.current;
      if (state && state.type === 'node' && !state.dragging) {
        const now = performance.now();
        const tapDuration = state.startTime ? now - state.startTime : 0;
        if (tapDuration < 250) {
          const last = tapRef.current;
          if (last.id === state.id && now - last.time < 320) {
            const node = nodesRef.current.get(state.id);
            if (node && node.status === 'passive' && onSelect) {
              onSelect(node.id);
            }
            tapRef.current = {time: 0, id: null, x: 0, y: 0};
          } else {
            tapRef.current = {time: now, id: state.id, x: 0, y: 0};
          }
        }
      }
      if (state && state.type === 'node' && state.dragging) {
        const node = nodesRef.current.get(state.id);
        if (node) {
        }
      }
      dragRef.current = null;
      canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('touchstart', handleTouchStart, {passive: false});
    canvas.addEventListener('touchmove', handleTouchMove, {passive: false});
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);
    const handleWheel = (ev) => {
      if (!ev.ctrlKey) return;
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const {zoom, panX, panY} = cameraRef.current;
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const worldX = (cx - panX) / zoom;
      const worldY = (cy - panY) / zoom;
      const factor = Math.exp(-ev.deltaY * 0.001);
      const nextZoom = clamp(zoom * factor, 0.4, 2.5);
      const nextPanX = cx - worldX * nextZoom;
      const nextPanY = cy - worldY * nextZoom;
      cameraRef.current.zoom = nextZoom;
      cameraRef.current.panX = nextPanX;
      cameraRef.current.panY = nextPanY;
    };
    canvas.addEventListener('wheel', handleWheel, {passive: false});
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointerleave', handleUp);
      canvas.removeEventListener('dblclick', handleDbl);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [onSelect]);

  return (
    <canvas
      ref={canvasRef}
      style={{width: '100%', height: '100%', display: 'block', touchAction: 'pan-y'}}
    />
  );
}

function tokenizeClause(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return [{text: '(empty clause)', type: 'empty'}];
  }
  const regex = /(\s+|\$false|\$true|!=|<=|>=|<=>|=>|[()|,&=:.~]|[A-Za-z_][A-Za-z0-9_]*|\d+|[^\s])/g;
  const tokens = [];
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const value = match[0];
    tokens.push({text: value, type: classifyToken(value)});
  }
  return tokens;
}

function classifyToken(token) {
  if (/^\s+$/.test(token)) return 'ws';
  if (/^\$false$|^\$true$/i.test(token)) return 'bool';
  if (/^[A-Z]/.test(token)) return 'var';
  if (/^\d+$/.test(token)) return 'num';
  if (/^(~|\||&|=>|<=>|=|!=|<=|>=)$/.test(token)) return 'op';
  if (/^[a-z]/.test(token)) return 'sym';
  if (/^[()|,&=:.~]$/.test(token)) return 'punct';
  return 'sym';
}

function tokenColor(type, palette) {
  switch (type) {
    case 'op':
      return palette.tooltipOp;
    case 'var':
      return palette.tooltipVar;
    case 'num':
      return palette.tooltipNum;
    case 'bool':
      return palette.tooltipBool;
    case 'punct':
      return palette.tooltipPunct;
    case 'ws':
      return palette.tooltipText;
    default:
      return palette.tooltipSym || palette.tooltipText;
  }
}

function wrapTokens(ctx, tokens, maxWidth) {
  const lines = [];
  let line = [];
  let width = 0;
  const pushLine = () => {
    if (line.length) lines.push(line);
    line = [];
    width = 0;
  };
  tokens.forEach((tok) => {
    if (tok.type === 'ws' && line.length === 0) return;
    const tokenWidth = ctx.measureText(tok.text).width;
    if (tokenWidth > maxWidth && tok.text.length > 1) {
      // Break long tokens into characters
      tok.text.split('').forEach((ch) => {
        const chWidth = ctx.measureText(ch).width;
        if (line.length && width + chWidth > maxWidth) {
          pushLine();
        }
        line.push({text: ch, type: tok.type});
        width += chWidth;
      });
      return;
    }
    if (line.length && width + tokenWidth > maxWidth) {
      pushLine();
    }
    line.push(tok);
    width += tokenWidth;
  });
  if (line.length) lines.push(line);
  return lines.slice(0, 8);
}

function drawArrow(ctx, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) return;
  const ux = dx / dist;
  const uy = dy / dist;
  const startX = x1 + ux * 18;
  const startY = y1 + uy * 18;
  const endX = x2 - ux * 18;
  const endY = y2 - uy * 18;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const headSize = 6;
  const leftX = endX - ux * headSize - uy * headSize * 0.6;
  const leftY = endY - uy * headSize + ux * headSize * 0.6;
  const rightX = endX - ux * headSize + uy * headSize * 0.6;
  const rightY = endY - uy * headSize - ux * headSize * 0.6;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}

function computeHighlightSets(rootId, edges) {
  const parents = new Map();
  const children = new Map();
  edges.forEach((edge) => {
    const from = String(edge.from);
    const to = String(edge.to);
    if (!parents.has(to)) parents.set(to, new Set());
    parents.get(to).add(from);
    if (!children.has(from)) children.set(from, new Set());
    children.get(from).add(to);
  });

  const root = String(rootId);
  const ancestors = new Set();
  const descendants = new Set();
  const edgeKeys = new Set();

  // Walk up: collect only edges on paths to ancestors
  const queueUp = [root];
  while (queueUp.length) {
    const current = queueUp.pop();
    const ps = parents.get(current);
    if (!ps) continue;
    ps.forEach((p) => {
      edgeKeys.add(`${p}->${current}`);
      if (!ancestors.has(p)) {
        ancestors.add(p);
        queueUp.push(p);
      }
    });
  }

  // Walk down: collect only edges on paths to descendants
  const queueDown = [root];
  while (queueDown.length) {
    const current = queueDown.pop();
    const cs = children.get(current);
    if (!cs) continue;
    cs.forEach((c) => {
      edgeKeys.add(`${current}->${c}`);
      if (!descendants.has(c)) {
        descendants.add(c);
        queueDown.push(c);
      }
    });
  }

  const nodes = new Set([root, ...ancestors, ...descendants]);
  return {nodes, ancestors, descendants, edgeKeys};
}

function computeTargets(nodes, edges, width, height, layoutMode, minX = 0, minY = 0) {
  const centerX = minX + width * 0.5;
  const centerY = minY + height * 0.5;
  const targets = new Map();
  const nodeIds = nodes.map((n) => String(n.id));
  const hasEdges = Array.isArray(edges) && edges.length > 0;

  if (!hasEdges && layoutMode !== 'sequential') {
    const rings = {
      active: [],
      passive: [],
      new: [],
      other: [],
    };
    nodes.forEach((node) => {
      const key = rings[node.status] ? node.status : 'other';
      rings[key].push(node);
    });
    const order = ['active', 'passive', 'new', 'other'];
    const maxRadius = Math.min(width, height) * 0.42;
    const ringCount = order.filter((k) => rings[k].length).length || 1;
    const step = ringCount > 1 ? maxRadius / (ringCount + 1) : maxRadius * 0.6;
    let ringIdx = 1;
    order.forEach((key) => {
      const list = rings[key];
      if (!list.length) return;
      const radius = step * ringIdx;
      ringIdx += 1;
      list.forEach((node, idx) => {
        const angle = 2 * Math.PI * idx / list.length + seededRandom(`${node.id}:ang`) * 0.3;
        targets.set(String(node.id), {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
        });
      });
    });
    return targets;
  }

  const parents = new Map();
  edges.forEach((edge) => {
    const to = String(edge.to);
    const from = String(edge.from);
    if (!parents.has(to)) parents.set(to, []);
    parents.get(to).push(from);
  });

  const depth = new Map(nodeIds.map((id) => [id, 0]));
  for (let iter = 0; iter < nodeIds.length; iter += 1) {
    let changed = false;
    nodeIds.forEach((id) => {
      const ps = parents.get(id);
      if (!ps || !ps.length) return;
      let maxParent = 0;
      ps.forEach((pid) => {
        if (depth.has(pid)) {
          maxParent = Math.max(maxParent, depth.get(pid) || 0);
        }
      });
      const next = maxParent + 1;
      if (next > (depth.get(id) || 0)) {
        depth.set(id, next);
        changed = true;
      }
    });
    if (!changed) break;
  }

  if (!hasEdges && layoutMode === 'sequential') {
    const statusOrder = ['new', 'active', 'passive', 'other'];
    const groups = statusOrder.map(() => []);
    nodes.forEach((node) => {
      const idx = statusOrder.indexOf(node.status);
      const slot = idx >= 0 ? idx : statusOrder.length - 1;
      groups[slot].push(node);
    });
    const leftPad = 70;
    const rightPad = 70;
    const topPad = 40;
    const bottomPad = 40;
    const usableW = Math.max(1, width - leftPad - rightPad);
    const usableH = Math.max(1, height - topPad - bottomPad);
    const cols = statusOrder.length;
    const stepX = cols > 1 ? usableW / (cols - 1) : 0;
    const columnTargets = new Map();
    groups.forEach((layer, d) => {
      if (!layer.length) return;
      layer.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      layer.forEach((node, idx) => {
        const t = (idx + 1) / (layer.length + 1);
        const jitter = (seededRandom(`${node.id}:jy`) - 0.5) * 0.08;
        const target = {
          x: minX + leftPad + stepX * d,
          y: minY + topPad + usableH * clamp(t + jitter, 0.05, 0.95),
        };
        targets.set(String(node.id), target);
        columnTargets.set(String(node.id), {x: target.x, y: target.y});
      });
    });
    targets._columnTargets = columnTargets;
    return targets;
  }

  const maxDepth = Math.max(1, ...Array.from(depth.values()));
  const layers = Array.from({length: maxDepth + 1}, () => []);
  nodes.forEach((node) => {
    const d = depth.get(String(node.id)) || 0;
    layers[d].push(node);
  });

  if (layoutMode === 'sequential') {
    const leftPad = 70;
    const rightPad = 70;
    const topPad = 40;
    const bottomPad = 40;
    const usableW = Math.max(1, width - leftPad - rightPad);
    const usableH = Math.max(1, height - topPad - bottomPad);
    const stepX = maxDepth > 0 ? usableW / maxDepth : 0;
    const columnTargets = new Map();
    layers.forEach((layer, d) => {
      if (!layer.length) return;
      layer.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      layer.forEach((node, idx) => {
        const t = (idx + 1) / (layer.length + 1);
        const jitter = (seededRandom(`${node.id}:jy`) - 0.5) * 0.08;
        const target = {
          x: minX + leftPad + stepX * d,
          y: minY + topPad + usableH * clamp(t + jitter, 0.05, 0.95),
        };
        targets.set(String(node.id), target);
        columnTargets.set(String(node.id), {x: target.x, y: target.y});
      });
    });
    targets._columnTargets = columnTargets;
    return targets;
  }

  const maxRadius = Math.min(width, height) * 0.42;
  const ringStep = maxRadius / (maxDepth + 1);
  layers.forEach((layer, d) => {
    if (!layer.length) return;
    const radius = ringStep * (d + 1);
    layer.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    layer.forEach((node, idx) => {
      const angle = 2 * Math.PI * idx / layer.length + seededRandom(`${node.id}:ang`) * 0.35;
      targets.set(String(node.id), {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });
  });

  return targets;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function isFalseClause(text) {
  return /\$false\b/i.test(String(text || '').trim());
}

function mixColor(a, b, t) {
  const c1 = toRgb(a);
  const c2 = toRgb(b);
  const r = Math.round(lerp(c1.r, c2.r, t));
  const g = Math.round(lerp(c1.g, c2.g, t));
  const bch = Math.round(lerp(c1.b, c2.b, t));
  return `rgb(${r}, ${g}, ${bch})`;
}

function rgbaFrom(color, alpha) {
  const c = toRgb(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

function toRgb(color) {
  if (!color) return {r: 0, g: 0, b: 0};
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      };
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const parts = match[1].split(',').map((p) => parseFloat(p.trim()));
      return {
        r: Math.max(0, Math.min(255, parts[0] || 0)),
        g: Math.max(0, Math.min(255, parts[1] || 0)),
        b: Math.max(0, Math.min(255, parts[2] || 0)),
      };
    }
  }
  return {r: 0, g: 0, b: 0};
}

function seededRandom(seed) {
  let h = 2166136261;
  const str = String(seed);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
