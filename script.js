// map-only script.js — renders stops, markers, tooltips and route (OSRM)
const DEFAULT_CENTER = [39.5, -98.35]; // USA center
const STORAGE_KEY = "roadtrip_stops_v1";

let map = L.map('map', {zoomControl: true}).setView(DEFAULT_CENTER, 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let stops = [];
let markers = [];
let routeLayer = null;

const stopsListEl = document.getElementById('stops-list');

async function loadFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try { stops = JSON.parse(raw); } catch(e){ stops = [] }
    renderAll();
  } else {
    // try to fetch stops.json if present on same host
    try {
      const r = await fetch('stops.json');
      if(r.ok){ stops = await r.json(); saveToStorage(); }
    } catch(e){ /* ignore */ }
    renderAll();
  }
}

function saveToStorage(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stops,null,2));
}

function renderAll(){
  markers.forEach(m=>map.removeLayer(m));
  markers = [];
  if(routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }

  if(stopsListEl) stopsListEl.innerHTML = '';

  stops.forEach((s, i)=>{
    const m = L.circleMarker([s.lat, s.lng], {
      radius:8, fillColor:'#2bb7ad', color:'#fff', weight:1, fillOpacity:0.95
    }).addTo(map);

    m.bindTooltip(s.name || 'Stop', {permanent:false, direction:'top'});

    // popup
    const popupContent = document.createElement('div');
    popupContent.style.minWidth = '200px';
    const h = document.createElement('h3'); h.textContent = s.name || 'Stop';
    const d = document.createElement('div'); d.textContent = s.date || '';
    const p = document.createElement('p'); p.textContent = s.notes || '';
    popupContent.appendChild(h); popupContent.appendChild(d);
    if(s.image){
      const img = document.createElement('img');
      img.src = s.image; img.alt = s.name || '';
      img.style.maxWidth='100%'; img.style.borderRadius='8px'; img.style.marginTop='8px';
      popupContent.appendChild(img);
    }
    popupContent.appendChild(p);
    m.bindPopup(popupContent);

    markers.push(m);

    if(stopsListEl){
      const li = document.createElement('li');
      const meta = document.createElement('div'); meta.className = 'stop-meta';
      const title = document.createElement('strong'); title.textContent = s.name || `Stop ${i+1}`;
      const sub = document.createElement('div'); sub.textContent = `${s.date||'—'} • ${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)}`;
      const note = document.createElement('div'); note.style.color='#99a3b8'; note.style.fontSize='0.9rem'; note.textContent = (s.notes||'').slice(0,120);
      meta.appendChild(title); meta.appendChild(sub); meta.appendChild(note);

      const actions = document.createElement('div'); actions.className='stop-actions';
      const goto = document.createElement('button'); goto.textContent='Zoom'; goto.onclick = ()=> map.setView([s.lat, s.lng], 13);
      const del = document.createElement('button'); del.textContent='Delete'; del.onclick = ()=> { deleteStop(i) };
      actions.appendChild(goto); actions.appendChild(del);

      li.appendChild(meta); li.appendChild(actions);
      stopsListEl.appendChild(li);
    }
  });

  if(stops.length >= 2) drawRoute(stops.map(s=>[s.lng, s.lat]));
}

function deleteStop(index){
  if(!confirm('Delete this stop?')) return;
  stops.splice(index,1);
  saveToStorage();
  renderAll();
}

async function drawRoute(coordPairs){
  const coords = coordPairs.map(c=>c.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&annotations=false`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if(json.code !== 'Ok' || !json.routes || json.routes.length===0) throw new Error('no route');

    const routeGeojson = json.routes[0].geometry;
    routeLayer = L.geoJSON(routeGeojson, {
      style: {color:'#3dd2c6', weight:5, opacity:0.9}
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  } catch(err){
    console.warn('Routing failed', err);
    const latlngs = coordPairs.map(c=>[c[1], c[0]]);
    routeLayer = L.polyline(latlngs, {color:'#e89f3d', weight:4, dashArray:'6,6'}).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  }
}

// init
loadFromStorage();
