// Карта маршрута: d3-geo, азимутальная проекция с центром на маршруте.

const MODE_WORD = { plane: 'самолёт', train: 'поезд', bus: 'автобус', car: 'авто' };

export function createMap(svg, legendEl) {
  const d3 = window.d3;
  const topojson = window.topojson;
  let land = null;
  let state = null;
  const ready = fetch('vendor/land-110m.json')
    .then((r) => r.json())
    .then((topo) => {
      land = topojson.feature(topo, topo.objects.land);
    })
    .catch(() => {
      land = { type: 'FeatureCollection', features: [] };
    });

  function coords(c) {
    return [c.lon, c.lat];
  }

  // Точки маршрута в порядке следования, с режимом отрезка.
  function segments(route) {
    const out = [];
    for (const leg of route.legs) {
      if (leg.kind === 'ground' && leg.mode !== 'local') {
        out.push({ mode: leg.mode, a: coords(leg.from), b: coords(leg.to), ground: true });
      } else if (leg.kind === 'flight') {
        out.push({ mode: 'plane', a: coords(leg.from), b: coords(leg.to), ground: false });
      }
    }
    if (route.ghost) {
      const last = out[out.length - 1];
      out.push({ mode: 'hidden', a: last.b, b: coords(route.ghost.to), ground: false, ghost: true });
    }
    return out;
  }

  function nodes(route) {
    const list = [];
    const seen = new Set();
    const push = (obj, kind) => {
      const key = obj.id || obj.iata;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ name: obj.name, lon: obj.lon, lat: obj.lat, kind });
    };
    route.legs.forEach((leg, i) => {
      if (leg.kind === 'ground' && leg.mode !== 'local') {
        push(leg.from, i === 0 ? 'origin' : 'via');
        push(leg.to, 'via');
      } else if (leg.kind === 'flight') {
        push(leg.fromCity, i === 0 ? 'origin' : 'via');
        push(leg.toCity, 'via');
      }
    });
    if (list.length) {
      list[0].kind = 'origin';
      const destName = route.chain[route.chain.length - 1].name;
      const dest = list.find((n) => n.name === destName);
      if (dest) dest.kind = 'dest';
    }
    if (route.ghost) list.push({ name: route.ghost.city.name, lon: route.ghost.to.lon, lat: route.ghost.to.lat, kind: 'ghost' });
    return list;
  }

  function draw() {
    if (!state || !land) return;
    const { route, others, animate } = state;
    const rect = svg.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(200, Math.round(rect.height));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const allSegs = [...others.flatMap(segments), ...segments(route)];
    const pts = allSegs.flatMap((s) => [s.a, s.b]);
    if (!pts.length) {
      svg.innerHTML = `<text class="map-empty" x="20" y="30">Маршрут не выбран</text>`;
      return;
    }
    // Центр — среднее направление точек, чтобы проекция не рвалась.
    let x = 0, y = 0, z = 0;
    for (const [lon, lat] of pts) {
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      x += Math.cos(la) * Math.cos(lo);
      y += Math.cos(la) * Math.sin(lo);
      z += Math.sin(la);
    }
    const cLon = (Math.atan2(y, x) * 180) / Math.PI;
    const cLat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;

    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const spread = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats));
    const fitPts = spread < 4 ? [...pts, [cLon - 2.5, cLat - 1.6], [cLon + 2.5, cLat + 1.6]] : pts;

    const projection = d3
      .geoAzimuthalEqualArea()
      .rotate([-cLon, -cLat])
      .fitExtent([[36, 30], [w - 36, h - 44]], { type: 'MultiPoint', coordinates: fitPts });
    const path = d3.geoPath(projection);

    const parts = [];
    parts.push(`<path class="map-land" d="${path(land) || ''}"/>`);
    parts.push(`<path class="map-grat" d="${path(d3.geoGraticule().step([10, 10])()) || ''}"/>`);

    const line = (s) => path({ type: 'LineString', coordinates: [s.a, s.b] }) || '';
    for (const o of others) for (const s of segments(o)) parts.push(`<path class="map-route ghost" d="${line(s)}"/>`);

    const segs = segments(route);
    segs.forEach((s, i) => {
      const cls = s.ghost ? 'm-hidden' : `m-${s.mode}`;
      parts.push(`<path class="map-route ${cls}${animate ? ' draw' : ''}" data-i="${i}" d="${line(s)}"/>`);
    });

    const labelParts = [];
    for (const n of nodes(route)) {
      const p = projection([n.lon, n.lat]);
      if (!p) continue;
      const major = n.kind === 'origin' || n.kind === 'dest';
      const r = major ? 4.5 : 3.2;
      const right = p[0] > w * 0.72;
      const anchor = right ? 'end' : 'start';
      const dx = right ? -9 : 9;
      parts.push(`<circle class="map-city" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}"${n.kind === 'ghost' ? ' opacity=".55"' : ''}/>`);
      labelParts.push(
        `<text class="map-label${major ? '' : ' minor'}" x="${(p[0] + dx).toFixed(1)}" y="${(p[1] + 4).toFixed(1)}" text-anchor="${anchor}">${escapeXml(n.name)}${n.kind === 'ghost' ? ' (билет до)' : ''}</text>`,
      );
    }
    svg.innerHTML = parts.join('') + labelParts.join('');

    if (animate) {
      let delay = 0;
      svg.querySelectorAll('.map-route.draw').forEach((el) => {
        const len = el.getTotalLength();
        el.style.setProperty('--len', len.toFixed(1));
        el.style.setProperty('--delay', `${delay.toFixed(2)}s`);
        delay += Math.min(0.9, Math.max(0.25, len / 900));
      });
    }

    const modes = [...new Set(segs.filter((s) => !s.ghost).map((s) => s.mode))];
    legendEl.innerHTML =
      modes.map((m) => `<li class="m-${m}"><i></i>${MODE_WORD[m]}</li>`).join('') +
      (others.length ? `<li><i></i>другие способы</li>` : '');
  }

  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });

  return {
    render(route, others = [], { animate = false } = {}) {
      state = { route, others, animate };
      if (land) draw();
      else ready.then(draw);
    },
  };
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
