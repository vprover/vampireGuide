// src/components/ProofSearchCanvas.js
import React, {useEffect, useRef} from 'react';

const LIGHT_COLORS = {
  new: '#46bdf0',
  active: '#42d392',
  passive: '#9aa6b2',
  selected: '#ffb347',
  default: '#6b93ff',
  text: '#0c1622',
  glow: 'rgba(74, 157, 255, 0.25)',
  bg0: '#f7fbff',
  bg1: '#edf3ff',
  grid: 'rgba(100, 125, 160, 0.12)',
  link: 'rgba(70, 110, 200, 0.35)',
  tooltipBg: 'rgba(15, 24, 44, 0.9)',
  tooltipStroke: 'rgba(255,255,255,0.15)',
  tooltipText: '#f5f7ff',
};

const DARK_COLORS = {
  new: '#5bc5ff',
  active: '#41e6a4',
  passive: '#7e8a96',
  selected: '#ffb347',
  default: '#7aa2f7',
  text: '#eef2ff',
  glow: 'rgba(94, 197, 255, 0.25)',
  bg0: '#0b1020',
  bg1: '#121a2f',
  grid: 'rgba(120, 150, 200, 0.12)',
  link: 'rgba(110, 170, 255, 0.35)',
  tooltipBg: 'rgba(20, 27, 44, 0.92)',
  tooltipStroke: 'rgba(255,255,255,0.2)',
  tooltipText: '#e6edf7',
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
  const rafRef = useRef(null);
  const timeRef = useRef(0);
  const themeRef = useRef('light');

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
          x: baseX + Math.cos(angle) * radius,
          y: baseY + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          bornAt: now,
        });
      } else {
        const node = map.get(id);
        node.text = clause.text || node.text;
        node.status = clause.status || node.status;
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const palette = getPalette(themeRef.current);

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, palette.bg0);
      gradient.addColorStop(1, palette.bg1);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid
      ctx.strokeStyle = palette.grid;
      ctx.lineWidth = 1;
      const grid = 48;
      for (let x = 0; x < w; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const nodes = Array.from(nodesRef.current.values());
      const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
      const count = nodes.length;
      const centerX = w * 0.5;
      const centerY = h * 0.5;

      if (layoutRef.current.dirty) {
        layoutRef.current.targets = computeTargets(nodes, edgesRef.current, w, h, layoutMode);
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
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
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
        const dragState = dragRef.current;
        const dragging = dragState && dragState.id === node.id && dragState.dragging;
        if (!dragging) {
          const target = targets.get(String(node.id));
          if (target) {
            node.vx += (target.x - node.x) * 0.02;
            node.vy += (target.y - node.y) * 0.02;
          } else {
            node.vx += (centerX - node.x) * 0.001;
            node.vy += (centerY - node.y) * 0.001;
          }
          node.vx *= 0.78;
          node.vy *= 0.78;
        }
        node.x += node.vx;
        node.y += node.vy;

        const pad = 28;
        node.x = clamp(node.x, pad, w - pad);
        node.y = clamp(node.y, pad, h - pad);
      }

      // Directed edges from parents to children
      const edgeList = edgesRef.current;
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
      }

      // Nodes
      const hoverId = hoverRef.current?.node?.id;
      nodes.forEach((node) => {
        const age = (ts - node.bornAt) / 1000;
        const pulse = awaitingInput ? 1 + 0.06 * Math.sin(ts / 280 + Number(node.id) * 0.3) : 1;
        const baseRadius = 16 + Math.min(18, (node.text?.length || 0) * 0.15);
        const hoverScale = node.id === hoverId ? 1.12 : 1;
        const radius = baseRadius * hoverScale;
        const color = node.id === String(selectedId)
          ? palette.selected
          : (palette[node.status] || palette.default);

        ctx.beginPath();
        ctx.fillStyle = color;
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

        // Label
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.text;
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, node.x, node.y);
      });

      // Hover tooltip
      const hover = hoverRef.current;
      if (hover && hover.node) {
        const node = hover.node;
        const lines = wrapText(ctx, node.text || '', 220);
        const pad = 10;
        ctx.font = '12px system-ui, sans-serif';
        const lineHeight = 16;
        const boxWidth = 240;
        const boxHeight = pad * 2 + lineHeight * Math.max(1, lines.length);
        const boxX = clamp(node.x + 20, 10, w - boxWidth - 10);
        const boxY = clamp(node.y + 20, 10, h - boxHeight - 10);

        ctx.fillStyle = palette.tooltipBg;
        ctx.strokeStyle = palette.tooltipStroke;
        ctx.lineWidth = 1;
        ctx.beginPath();
        drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = palette.tooltipText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        lines.forEach((line, idx) => {
          ctx.fillText(line, boxX + pad, boxY + pad + idx * lineHeight);
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
      const {w, h} = sizeRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      if (!w || !h) return;

      const dragging = dragRef.current;
      if (dragging) {
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
        return;
      }

      let nearest = null;
      let best = Infinity;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 28 && dist < best) {
          best = dist;
          nearest = node;
        }
      });
      hoverRef.current = nearest ? {node: nearest} : null;
      canvas.style.cursor = nearest ? 'pointer' : 'default';
    };
    const handleLeave = () => {
      hoverRef.current = null;
      canvas.style.cursor = 'default';
    };
    const handleDown = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let chosen = null;
      let best = Infinity;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 28 && dist < best) {
          best = dist;
          chosen = node;
        }
      });
      if (chosen) {
        dragRef.current = {
          id: chosen.id,
          offsetX: chosen.x - x,
          offsetY: chosen.y - y,
          startX: x,
          startY: y,
          dragging: false,
        };
        chosen.vx = 0;
        chosen.vy = 0;
      }
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    const handleDbl = (ev) => {
      if (!onSelect) return;
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      let chosen = null;
      let best = Infinity;
      nodesRef.current.forEach((node) => {
        const dx = x - node.x;
        const dy = y - node.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 28 && dist < best) {
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
    return () => {
      canvas.removeEventListener('mousemove', handleMove);
      canvas.removeEventListener('mouseleave', handleLeave);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointerleave', handleUp);
      canvas.removeEventListener('dblclick', handleDbl);
    };
  }, [onSelect]);

  return <canvas ref={canvasRef} style={{width: '100%', height: '100%', display: 'block'}} />;
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return ['(empty clause)'];
  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const test = line + ' ' + words[i];
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = words[i];
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines.slice(0, 6);
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

function computeTargets(nodes, edges, width, height, layoutMode) {
  const centerX = width * 0.5;
  const centerY = height * 0.5;
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
    groups.forEach((layer, d) => {
      if (!layer.length) return;
      layer.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      layer.forEach((node, idx) => {
        const t = (idx + 1) / (layer.length + 1);
        const jitter = (seededRandom(`${node.id}:jy`) - 0.5) * 0.08;
        targets.set(String(node.id), {
          x: leftPad + stepX * d,
          y: topPad + usableH * clamp(t + jitter, 0.05, 0.95),
        });
      });
    });
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
    layers.forEach((layer, d) => {
      if (!layer.length) return;
      layer.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      layer.forEach((node, idx) => {
        const t = (idx + 1) / (layer.length + 1);
        const jitter = (seededRandom(`${node.id}:jy`) - 0.5) * 0.08;
        targets.set(String(node.id), {
          x: leftPad + stepX * d,
          y: topPad + usableH * clamp(t + jitter, 0.05, 0.95),
        });
      });
    });
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

function seededRandom(seed) {
  let h = 2166136261;
  const str = String(seed);
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
