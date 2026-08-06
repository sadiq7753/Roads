/* ============================================================
   ROAD TRIP MAP APP — shared core
   Loaded by both index.html (public, read-only) and admin.html
   (admin.html sets window.APP_CONFIG = { adminMode: true } BEFORE
   this script runs, and wires window.onEditStop / window.onDeleteStop)
   ============================================================ */

const ADMIN_MODE = !!(window.APP_CONFIG && window.APP_CONFIG.adminMode);

const map = L.map('map', { zoomControl: true }).setView([39, -105], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 18
}).addTo(map);

let workingStops = [];
let markers = [];
let routeLayers = [];
let activeId = null;

function slugify(str){
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}

// Photos can be a full CDN/image URL, or just a filename that lives in
// images/<stop-id>/ alongside this site.
function photoSrc(stop, p){
  return /^https?:\/\//i.test(p) ? p : `images/${stop.id}/${p}`;
}

function makeIcon(num, isActive){
  return L.divIcon({
    className: '',
    html: `<div class="stop-marker${isActive ? ' active' : ''}"><span>${num}</span></div>`,
    iconSize: [30,30],
    iconAnchor: [15,28],
    popupAnchor: [0,-26]
  });
}

function popupHtml(stop){
  const photosHtml = (stop.photos && stop.photos.length)
    ? `<div class="photos">${stop.photos.map(p => `<img src="${photoSrc(stop,p)}" alt="${stop.name}" onerror="this.style.display='none'">`).join('')}</div>`
    : '';
  return `<div class="popup-card">
      <div class="name">${stop.name}</div>
      <div class="date mono">${stop.date}</div>
      <div class="notes">${(stop.notes || '').replace(/</g,'&lt;')}</div>
      ${photosHtml}
    </div>`;
}

function renderSidebar(){
  const list = document.getElementById('stopList');
  list.innerHTML = '';
  workingStops.forEach((stop, i) => {
    const card = document.createElement('div');
    card.className = 'stop-card' + (stop.id === activeId ? ' active' : '');
    card.innerHTML = `
      <div class="num">${i+1}</div>
      <div class="name">${stop.name}</div>
      <div class="date mono">${stop.date}</div>
      <div class="notes-preview">${(stop.notes||'').split('\n')[0]}</div>
      ${ADMIN_MODE ? `<div class="card-actions">
        <button class="mini-btn" type="button" data-action="edit">Edit</button>
        <button class="mini-btn danger" type="button" data-action="delete">Delete</button>
      </div>` : ''}
    `;
    card.addEventListener('click', (e) => {
      if(e.target.closest('[data-action]')) return;
      focusStop(stop.id);
    });
    if(ADMIN_MODE){
      const editBtn = card.querySelector('[data-action="edit"]');
      const delBtn = card.querySelector('[data-action="delete"]');
      editBtn.addEventListener('click', () => {
        if(typeof window.onEditStop === 'function') window.onEditStop(stop.id);
      });
      delBtn.addEventListener('click', () => {
        if(typeof window.onDeleteStop === 'function') window.onDeleteStop(stop.id);
      });
    }
    list.appendChild(card);
  });
}

function focusStop(id){
  activeId = id;
  const stop = workingStops.find(s => s.id === id);
  if(!stop) return;
  map.flyTo([stop.lat, stop.lng], 10, { duration: 0.6 });
  const m = markers.find(m => m._stopId === id);
  if(m){ m.openPopup(); }
  renderSidebar();
  redrawMarkerIcons();
}

function redrawMarkerIcons(){
  markers.forEach((m, i) => {
    m.setIcon(makeIcon(i+1, m._stopId === activeId));
  });
}

function clearRoutes(){
  routeLayers.forEach(l => map.removeLayer(l));
  routeLayers = [];
}

function haversineMiles(a, b){
  const R = 3958.8;
  const dLat = (b.lat-a.lat) * Math.PI/180;
  const dLng = (b.lng-a.lng) * Math.PI/180;
  const lat1 = a.lat * Math.PI/180, lat2 = b.lat * Math.PI/180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

async function fetchRoute(a, b){
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if(data.routes && data.routes[0]){
    const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    return { coords, miles: data.routes[0].distance / 1609.34 };
  }
  throw new Error('no route');
}

async function drawRoutesAndMarkers(){
  clearRoutes();
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const bounds = [];
  let totalMiles = 0;

  // markers
  workingStops.forEach((stop, i) => {
    const marker = L.marker([stop.lat, stop.lng], { icon: makeIcon(i+1, stop.id === activeId) }).addTo(map);
    marker._stopId = stop.id;
    marker.bindPopup(popupHtml(stop));
    marker.on('click', () => { activeId = stop.id; renderSidebar(); redrawMarkerIcons(); });
    markers.push(marker);
    bounds.push([stop.lat, stop.lng]);
  });

  if(bounds.length) map.fitBounds(bounds, { padding: [40,40] });

  // routes between consecutive stops — drawn as a pale casing line under a
  // bold rust line so the route reads clearly against the map tiles.
  for(let i=0; i<workingStops.length-1; i++){
    const a = workingStops[i], b = workingStops[i+1];
    let coords, miles;
    try{
      const r = await fetchRoute(a,b);
      coords = r.coords; miles = r.miles;
    } catch(e){
      coords = [[a.lat,a.lng],[b.lat,b.lng]];
      miles = haversineMiles(a,b);
    }
    totalMiles += miles;
    const casing = L.polyline(coords, {
      color: '#fff8ea', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
    }).addTo(map);
    const line = L.polyline(coords, {
      color: '#bd5b2c', weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round'
    }).addTo(map);
    routeLayers.push(casing, line);
  }

  document.getElementById('statStops').textContent = workingStops.length;
  document.getElementById('statMiles').textContent = Math.round(totalMiles).toLocaleString();
  if(workingStops.length > 1){
    const days = Math.round((new Date(workingStops[workingStops.length-1].date) - new Date(workingStops[0].date)) / 86400000);
    document.getElementById('statDays').textContent = days;
  } else {
    document.getElementById('statDays').textContent = '0';
  }
}

// stops-data.json stores a plain array of stop objects, in this key order.
function stopsToFileText(stops){
  const ordered = stops.map(s => ({
    id: s.id,
    name: s.name,
    date: s.date,
    lat: s.lat,
    lng: s.lng,
    notes: s.notes || '',
    photos: s.photos || []
  }));
  return JSON.stringify(ordered, null, 2) + '\n';
}

async function loadStops(){
  try{
    const res = await fetch('stops-data.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    workingStops = await res.json();
  } catch(e){
    console.error('Failed to load stops-data.json', e);
    workingStops = [];
    document.getElementById('stopList').innerHTML =
      '<div class="hint">Couldn\'t load stops-data.json. If you opened this file ' +
      'directly (a file:// URL), browsers block that — run a local server instead ' +
      '(e.g. <span class="mono">python3 -m http.server</span> in this folder) or view ' +
      'it via GitHub Pages.</div>';
  }
  workingStops.sort((a,b) => new Date(a.date) - new Date(b.date));
  renderSidebar();
  drawRoutesAndMarkers();

  // Public API used by admin.js to mutate stops and persist them.
  window.mapApp = {
    getStops: () => workingStops,
    addOrUpdateStop: (stop) => {
      const idx = workingStops.findIndex(s => s.id === stop.id);
      if(idx >= 0) workingStops[idx] = stop; else workingStops.push(stop);
      workingStops.sort((a,b) => new Date(a.date) - new Date(b.date));
      activeId = stop.id;
      renderSidebar();
      drawRoutesAndMarkers();
    },
    removeStop: (id) => {
      workingStops = workingStops.filter(s => s.id !== id);
      if(activeId === id) activeId = null;
      renderSidebar();
      drawRoutesAndMarkers();
    },
    focusStop,
    slugify,
    toFileText: stopsToFileText
  };
  window.dispatchEvent(new Event('mapapp:ready'));
}

loadStops();
