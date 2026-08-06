// Basic road-trip app: markers + OSRM routing + JSON import/export + localStorage
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
const form = document.getElementById('stop-form');
const nameInput = document.getElementById('name');
const latInput = document.getElementById('lat');
const lngInput = document.getElementById('lng');
const dateInput = document.getElementById('date');
const notesInput = document.getElementById('notes');
const imageInput = document.getElementById('image');
const exportBtn = document.getElementById('export-json');
const importFile = document.getElementById('import-file');
const clearAllBtn = document.getElementById('clear-all');

function loadFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try {
      stops = JSON.parse(raw);
    } catch(e){ stops = [] }
  } else {
    // try to fetch stops.json if present on same host (useful when deployed with a repo file)
    fetch('stops.json').then(r=>{
      if(r.ok) return r.json();
      throw new Error('no stops.json');
    }).then(json=>{
      stops = json || [];
      saveToStorage();
      renderAll();
    }).catch(()=>{ stops = []; renderAll() });
  }
}

function saveToStorage(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stops,null,2));
}

function addStop(obj){
  stops.push(obj);
  saveToStorage();
  renderAll();
}

function deleteStop(index){
  stops.splice(index,1);
  saveToStorage();
  renderAll();
}

function clearAll(){
  if(!confirm('Clear all stops?')) return;
  stops = [];
  saveToStorage();
  renderAll();
}

function renderAll(){
  // clear markers
  markers.forEach(m=>map.removeLayer(m));
  markers = [];
  if(routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }

  stopsListEl.innerHTML = '';
  stops.forEach((s, i)=>{
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

    // marker
    const m = L.circleMarker([s.lat, s.lng], {
      radius:8, fillColor:'#2bb7ad', color:'#fff', weight:1, fillOpacity:0.95
    }).addTo(map);

    // hover tooltip
    m.bindTooltip(s.name || 'Stop', {permanent:false, direction:'top'});

    // popup with details & image
    const popupContent = document.createElement('div');
    popupContent.style.minWidth = '200px';
    const h = document.createElement('h3'); h.textContent = s.name || 'Stop';
    const d = document.createElement('div'); d.textContent = s.date || '';
    const p = document.createElement('p'); p.textContent = s.notes || '';
    popupContent.appendChild(h); popupContent.appendChild(d);
    if(s.image){
      const img = document.createElement('img');
      img.src = s.image;
      img.alt = s.name || '';
      img.style.maxWidth='100%'; img.style.borderRadius='8px'; img.style.marginTop='8px';
      popupContent.appendChild(img);
    }
    popupContent.appendChild(p);
    m.bindPopup(popupContent);

    markers.push(m);
  });

  // draw route using OSRM between stops (driving)
  if(stops.length >= 2) drawRoute(stops.map(s=>[s.lng, s.lat]));
}

async function drawRoute(coordPairs){ // coordPairs: [[lng,lat],...]
  // build coordinates string lng,lat;lng,lat...
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

    // fit bounds
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  } catch(err){
    console.warn('Routing failed', err);
    // fallback: draw simple polyline (straight-ish)
    const latlngs = coordPairs.map(c=>[c[1], c[0]]);
    routeLayer = L.polyline(latlngs, {color:'#e89f3d', weight:4, dashArray:'6,6'}).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  }
}

// form handlers
form.addEventListener('submit', e=>{
  e.preventDefault();
  const obj = {
    name: nameInput.value.trim() || 'Stop',
    lat: parseFloat(latInput.value),
    lng: parseFloat(lngInput.value),
    date: dateInput.value || '',
    notes: notesInput.value || '',
    image: imageInput.value || ''
  };
  addStop(obj);
  form.reset();
});

clearAllBtn.addEventListener('click', clearAll);

// map click to fill coords
map.on('click', e=>{
  const {lat,lng} = e.latlng;
  latInput.value = lat.toFixed(6);
  lngInput.value = lng.toFixed(6);
  // small animation marker when clicked
  const pulse = L.circleMarker([lat,lng], {radius:10, color:'#fff', weight:2, fillColor:'#3dd2c6', fillOpacity:0.6}).addTo(map);
  setTimeout(()=>map.removeLayer(pulse), 900);
});

// export JSON
exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(stops,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'stops.json'; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
});

// import JSON
importFile.addEventListener('change', (ev)=>{
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = (e)=>{
    try {
      const imported = JSON.parse(e.target.result);
      if(Array.isArray(imported)) {
        stops = imported;
        saveToStorage();
        renderAll();
      } else alert('JSON should be an array of stop objects');
    } catch(err){ alert('Invalid JSON') }
  };
  reader.readAsText(f);
  importFile.value = '';
});

// init
loadFromStorage();
renderAll();
