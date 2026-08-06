// script.js — map + add-stop panel, dynamic autocomplete, preview, and optional permanent save via serverless function
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
const stopsListEl = document.getElementById('stops-list');
const form = document.getElementById('stop-form');
const nameInput = document.getElementById('name');
const placeInput = document.getElementById('place');
const searchResultsEl = document.getElementById('search-results');
const latInput = document.getElementById('lat');
const lngInput = document.getElementById('lng');
const dateInput = document.getElementById('date');
const notesInput = document.getElementById('notes');
const imageInput = document.getElementById('image');
const previewBtn = document.getElementById('preview-btn');
const addPermanentBtn = document.getElementById('add-permanent');
const exportBtn = document.getElementById('export-json');
const importFile = document.getElementById('import-file');
const previewSection = document.getElementById('preview-section');
const pvName = document.getElementById('pv-name');
const pvDate = document.getElementById('pv-date');
const pvImage = document.getElementById('pv-image');
const pvNotes = document.getElementById('pv-notes');

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

function loadFromStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw){
    try { stops = JSON.parse(raw); } catch(e){ stops = [] }
  } else {
    // try to fetch stops.json
    fetch('stops.json').then(r => { if(r.ok) return r.json(); throw new Error('no stops.json') }).then(j=>{ stops = j || []; saveToStorage(); renderAll(); }).catch(()=>{ stops = []; renderAll(); });
    return;
  }
  renderAll();
}

function saveToStorage(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(stops,null,2)); }

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
      img.src = s.image; img.alt = s.name || '';
      img.style.maxWidth='100%'; img.style.borderRadius='8px'; img.style.marginTop='8px';
      popupContent.appendChild(img);
    }
    popupContent.appendChild(p);
    m.bindPopup(popupContent);

    markers.push(m);
  });

  // draw route using OSRM between stops (driving) - main path more prominent
  if(stops.length >= 2) drawRoute(stops.map(s=>[s.lng, s.lat]));
}

async function drawRoute(coordPairs){ // coordPairs: [[lng,lat],...]
  const coords = coordPairs.map(c=>c.join(',')).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false&annotations=false`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if(json.code !== 'Ok' || !json.routes || json.routes.length===0) throw new Error('no route');

    const routeGeojson = json.routes[0].geometry;
    // prominent main route
    routeLayer = L.geoJSON(routeGeojson, {
      style: {color:'#0af', weight:8, opacity:0.95}
    }).addTo(map);

    // fit bounds
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  } catch(err){
    console.warn('Routing failed', err);
    // fallback: draw simple polyline (less prominent secondary style)
    const latlngs = coordPairs.map(c=>[c[1], c[0]]);
    routeLayer = L.polyline(latlngs, {color:'#e89f3d', weight:4, dashArray:'6,6', opacity:0.6}).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding:[60,120]});
  }
}

function deleteStop(index){
  if(!confirm('Delete this stop?')) return;
  stops.splice(index,1);
  saveToStorage();
  renderAll();
}

// --------------------
// Search + preview + add permanently
// --------------------
function debounce(fn, wait=300){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait) } }
async function nominatimSearch(q){ if(!q || q.length<2) return []; const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=6&addressdetails=1`; try{ const r = await fetch(url); if(!r.ok) return []; return await r.json() }catch(e){console.warn(e); return []} }

let activeIndex = -1;
function renderSearchResults(items){
  searchResultsEl.innerHTML = '';
  if(!items || items.length===0){ searchResultsEl.hidden = true; return; }
  items.forEach(it=>{
    const div = document.createElement('div'); div.className='search-item'; div.textContent = it.display_name;
    div.onclick = ()=>{ placeInput.value = it.display_name; nameInput.value = it.display_name.split(',')[0]; latInput.value = parseFloat(it.lat).toFixed(6); lngInput.value = parseFloat(it.lon).toFixed(6); updateAddButton(); searchResultsEl.hidden=true; }
    searchResultsEl.appendChild(div);
  });
  searchResultsEl.hidden=false;
}

const debSearch = debounce(async (q)=>{ const res = await nominatimSearch(q); renderSearchResults(res); }, 220);
placeInput.addEventListener('input', e=>{ const v = e.target.value.trim(); if(!v){ searchResultsEl.hidden=true; updateAddButton(); return;} debSearch(v); });
placeInput.addEventListener('keydown', e=>{
  const items = Array.from(searchResultsEl.querySelectorAll('.search-item'));
  if(items.length===0) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); activeIndex = Math.min(items.length-1, activeIndex+1); items.forEach((it,i)=>it.classList.toggle('active', i===activeIndex)); items[activeIndex].scrollIntoView({block:'nearest'}); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); activeIndex = Math.max(0, activeIndex-1); items.forEach((it,i)=>it.classList.toggle('active', i===activeIndex)); items[activeIndex].scrollIntoView({block:'nearest'}); }
  else if(e.key==='Enter'){ e.preventDefault(); if(activeIndex>=0) items[activeIndex].click(); else { if(items[0]) items[0].click(); } }
});

document.addEventListener('click', e=>{ if(!searchResultsEl.contains(e.target) && e.target !== placeInput) searchResultsEl.hidden = true; });

map.on('click', async e=>{
  const {lat,lng} = e.latlng; latInput.value = lat.toFixed(6); lngInput.value = lng.toFixed(6);
  try{ const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`; const r=await fetch(url); if(r.ok){ const j=await r.json(); placeInput.value=j.display_name||`${lat.toFixed(4)},${lng.toFixed(4)}`; nameInput.value=j.name||placeInput.value.split(',')[0]; } }catch(err){ placeInput.value=`${lat.toFixed(4)},${lng.toFixed(4)}` }
  updateAddButton();
});

function updateAddButton(){ addPermanentBtn.disabled = !(latInput.value && lngInput.value); addPermanentBtn.style.opacity = addPermanentBtn.disabled ? '0.6' : '1'; }

previewBtn.addEventListener('click', ()=>{
  const name = nameInput.value || placeInput.value || 'Stop';
  pvName.textContent = name;
  pvDate.textContent = dateInput.value || '';
  pvNotes.textContent = notesInput.value || '';
  if(imageInput.value){ pvImage.src = imageInput.value; pvImage.style.display='block'; } else { pvImage.style.display='none'; }
  previewSection.hidden = false;
});

// Add permanently: save locally and attempt to POST to serverless function to commit stops.json
addPermanentBtn.addEventListener('click', async ()=>{
  const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
  if(Number.isNaN(lat) || Number.isNaN(lng)){ showToast('Select a place or click the map first', 'error'); return; }
  const obj = { name: nameInput.value.trim() || placeInput.value, lat, lng, date: dateInput.value || '', notes: notesInput.value || '', image: imageInput.value || '' };
  stops.push(obj);
  saveToStorage();
  renderAll();

  // try to commit to repo via serverless endpoint
  try{
    const resp = await fetch('/.netlify/functions/commit-stops', {
      method: 'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(stops)
    });
    if(resp.ok){ showToast('Saved permanently to repo', 'success'); }
    else { const txt = await resp.text(); console.warn('Commit failed', txt); showToast('Saved locally; server commit failed', 'error'); }
  }catch(err){ console.warn('Commit error', err); showToast('Saved locally; server commit error', 'error'); }

  form.reset(); previewSection.hidden=true; updateAddButton();
});

// export/import
exportBtn.addEventListener('click', ()=>{ const blob=new Blob([JSON.stringify(stops,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='stops.json'; a.click(); URL.revokeObjectURL(url); });
importFile.addEventListener('change',(ev)=>{ const f=ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=(e)=>{ try{ const imported=JSON.parse(e.target.result); if(Array.isArray(imported)){ stops=imported; saveToStorage(); renderAll(); showToast('Imported stops', 'success'); } else showToast('JSON must be an array','error'); }catch(e){ showToast('Invalid JSON','error'); } }; reader.readAsText(f); importFile.value=''; });

// init
loadFromStorage(); updateAddButton();
