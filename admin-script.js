// admin-script.js — dynamic autocomplete + keyboard navigation + local save / optional POST
const DEFAULT_CENTER = [39.5, -98.35];
const STORAGE_KEY = "roadtrip_stops_v1";

let map = L.map('map', {zoomControl: true}).setView(DEFAULT_CENTER, 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let stops = [];
let markers = [];
let routeLayer = null;

// DOM
const form = document.getElementById('stop-form');
const nameInput = document.getElementById('name');
const placeInput = document.getElementById('place');
const searchResultsEl = document.getElementById('search-results');
const latInput = document.getElementById('lat');
const lngInput = document.getElementById('lng');
const dateInput = document.getElementById('date');
const notesInput = document.getElementById('notes');
const imageInput = document.getElementById('image');
const exportBtn = document.getElementById('export-json');
const importFile = document.getElementById('import-file');
const clearAllBtn = document.getElementById('clear-all');
const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

function showToast(message, type = 'info', timeout = 3000){
  let toast = document.getElementById('rt-toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'rt-toast';
    toast.style.position = 'fixed';
    toast.style.right = '20px';
    toast.style.top = '20px';
    toast.style.padding = '10px 14px';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = 9999;
    toast.style.color = '#021';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    document.body.appendChild(toast);
  }
  toast.style.background = type === 'success' ? '#b7ffef' : (type === 'error' ? '#ffd6d6' : 'rgba(255,255,255,0.06)');
  toast.textContent = message;
  toast.style.display = 'block';
  if(timeout){
    setTimeout(()=>{ toast.style.display = 'none'; }, timeout);
  }
}

function setSubmitDisabled(disabled){
  if(!submitBtn) return;
  submitBtn.disabled = disabled;
  submitBtn.style.opacity = disabled ? '0.6' : '1';
  submitBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
}

function updateSubmitState(){
  const ok = latInput && latInput.value && lngInput && lngInput.value;
  setSubmitDisabled(!ok);
}

async function loadFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try { stops = JSON.parse(raw); } catch(e){ stops = [] }
  } else {
    // attempt to load stops.json if present at site root
    try {
      const r = await fetch('stops.json');
      if(r.ok){ const j = await r.json(); if(Array.isArray(j)) stops = j; }
    } catch(e){ /* ignore */ }
  }
  renderStopsOnMap();
  updateSubmitState();
}

function saveToStorage(){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(stops,null,2)); }catch(e){ console.error('Save failed', e); showToast('Saving failed', 'error'); } }

// -- rendering
function clearMapMarkers(){
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  if(routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
}
function renderStopsOnMap(){
  clearMapMarkers();
  stops.forEach(s => {
    const m = L.circleMarker([s.lat, s.lng], { radius:8, fillColor:'#2bb7ad', color:'#fff', weight:1, fillOpacity:0.95 }).addTo(map);
    m.bindTooltip(s.name || 'Stop', {permanent:false, direction:'top'});
    const popup = `<h3>${s.name||''}</h3><div>${s.date||''}</div><p>${s.notes||''}</p>${s.image?('<img src="'+s.image+'" style="max-width:100%;border-radius:6px;margin-top:8px">'):''}`;
    m.bindPopup(popup);
    markers.push(m);
  });
  if(stops.length >= 2) drawRoute(stops.map(s=>[s.lng, s.lat]));
}

// OSRM routing (same approach as map page)
async function drawRoute(coordPairs){
  const coords = coordPairs.map(c=>c.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const r = await fetch(url); const j = await r.json();
    if(j.routes && j.routes[0]) {
      routeLayer = L.geoJSON(j.routes[0].geometry, { style:{color:'#3dd2c6', weight:5, opacity:0.9} }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
    }
  } catch(e){ console.warn('Routing failed', e); }
}

// -- Nominatim search + helpers
function debounce(fn, wait=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }
async function nominatimSearch(q){
  if(!q || q.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
  try { const r = await fetch(url); if(!r.ok) return []; return await r.json(); } catch(e){ return []; }
}

let activeIndex = -1;
function renderSearchResults(items){
  searchResultsEl.innerHTML = '';
  if(!items || items.length===0){ searchResultsEl.hidden = true; activeIndex = -1; return; }
  items.forEach((it, idx) => {
    const el = document.createElement('div');
    el.className = 'search-item';
    el.textContent = it.display_name;
    el.dataset.lat = it.lat; el.dataset.lon = it.lon;
    el.addEventListener('click', ()=> selectResult(it));
    searchResultsEl.appendChild(el);
  });
  searchResultsEl.hidden = false;
}

function selectResult(it){
  placeInput.value = it.display_name;
  nameInput.value = (it.display_name.split(',')[0] || it.display_name);
  latInput.value = parseFloat(it.lat).toFixed(6);
  lngInput.value = parseFloat(it.lon).toFixed(6);
  searchResultsEl.hidden = true;
  activeIndex = -1;
  updateSubmitState();
}

const debSearch = debounce(async (q) => {
  const res = await nominatimSearch(q);
  renderSearchResults(res);
}, 180);

placeInput.addEventListener('input', (e)=> {
  const v = e.target.value.trim();
  if(!v){ searchResultsEl.hidden = true; updateSubmitState(); return; }
  debSearch(v);
});

// keyboard nav for suggestions
placeInput.addEventListener('keydown', (e)=>{
  const items = Array.from(searchResultsEl.querySelectorAll('.search-item'));
  if(items.length === 0) return;
  if(e.key === 'ArrowDown'){ e.preventDefault(); activeIndex = Math.min(items.length-1, activeIndex+1); updateActive(items); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); activeIndex = Math.max(0, activeIndex-1); updateActive(items); }
  else if(e.key === 'Enter'){
    e.preventDefault();
    if(activeIndex >= 0) items[activeIndex].click();
    else {
      // if Enter pressed without selecting, try to pick first suggestion
      const first = items[0]; if(first) first.click();
    }
  }
});

function updateActive(items){
  items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
  if(activeIndex >= 0) items[activeIndex].scrollIntoView({block:'nearest'});
}

document.addEventListener('click', (e)=>{
  if(!searchResultsEl.contains(e.target) && e.target !== placeInput) searchResultsEl.hidden = true;
});

// reverse geocode on map click
map.on('click', async (e)=>{
  const {lat, lng} = e.latlng;
  latInput.value = lat.toFixed(6); lngInput.value = lng.toFixed(6);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const r = await fetch(url);
    if(r.ok){ const j = await r.json(); placeInput.value = j.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`; nameInput.value = j.name || (j.display_name||'').split(',')[0]; }
  } catch(e){ placeInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; }
  updateSubmitState();
});

// submit
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  try{
    const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
    if(Number.isNaN(lat) || Number.isNaN(lng)){ showToast('Please select a place from suggestions or click the map.', 'error'); updateSubmitState(); return; }
    const obj = {
      name: nameInput.value.trim() || (placeInput.value || 'Stop'),
      lat, lng,
      date: dateInput.value || '',
      notes: notesInput.value || '',
      image: imageInput.value || ''
    };
    // save locally:
    stops.push(obj);
    saveToStorage();
    renderStopsOnMap();
    showToast('Stop added', 'success');
    // update a last-update key so other pages can detect changes
    try{ localStorage.setItem('roadtrip_last_update', String(Date.now())); }catch(e){}

    // OPTIONAL: send to serverless function to commit to GitHub (secure method)
    // Uncomment and set your endpoint if you deploy a serverless function:
    /*
    try {
      const r = await fetch('/.netlify/functions/commit-stop', {
        method: 'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(obj)
      });
      if(!r.ok) throw new Error('commit failed');
      showToast('Saved and committed to repo', 'success');
    } catch(err){ console.warn(err); showToast('Saved locally; server commit failed', 'error'); }
    */

    form.reset();
    searchResultsEl.hidden = true;
    updateSubmitState();
  }catch(err){ console.error(err); showToast('Failed to add stop', 'error'); }
});

// import/export & clear
exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(stops,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'stops.json'; a.click(); URL.revokeObjectURL(url);
});

importFile.addEventListener('change', (ev)=>{
  const f = ev.target.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if(Array.isArray(imported)){ stops = imported; saveToStorage(); renderStopsOnMap(); showToast('Imported stops', 'success'); } else showToast('JSON must be an array of stops', 'error');
    } catch(e){ showToast('Invalid JSON', 'error'); }
  };
  reader.readAsText(f);
  importFile.value = '';
});

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear all stops?')) return;
  stops = []; saveToStorage(); renderStopsOnMap(); showToast('Cleared all stops', 'success');
  updateSubmitState();
});

// init
loadFromStorage();
