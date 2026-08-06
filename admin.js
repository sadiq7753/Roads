/* ============================================================
   ADMIN PAGE LOGIC
   Handles the add/edit form, place search, and persisting stops
   straight to stops-data.json using the File System Access API
   (Chrome/Edge). Falls back to a manual download in other browsers.
   ============================================================ */

const FS_SUPPORTED = 'showOpenFilePicker' in window;
let fileHandle = null;
let editingId = null;

/* ---------- tiny IndexedDB helper, just to remember the file handle ---------- */
const DB_NAME = 'roadtrip-admin';
const STORE_NAME = 'handles';

function idbOpen(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- file connection UI ---------- */
function updateFileStatus(text, cls){
  const el = document.getElementById('fileStatus');
  el.textContent = text;
  el.className = 'file-status mono' + (cls ? ' ' + cls : '');
}

async function initFileConnection(){
  if(!FS_SUPPORTED){
    updateFileStatus('direct save unsupported here — Save will download a file instead', 'warn');
    document.getElementById('connectFileBtn').textContent = 'n/a';
    document.getElementById('connectFileBtn').disabled = true;
    return;
  }
  try{
    const saved = await idbGet('stopsFile');
    if(saved){
      fileHandle = saved;
      const perm = await saved.queryPermission({ mode: 'readwrite' });
      if(perm === 'granted'){
        updateFileStatus('connected: ' + saved.name, 'connected');
      } else {
        updateFileStatus('reconnect needed (click Connect)', 'warn');
      }
    }
  } catch(e){ /* no saved handle yet */ }
}

document.getElementById('connectFileBtn').addEventListener('click', async () => {
  if(!FS_SUPPORTED) return;
  try{
    if(fileHandle){
      const perm = await fileHandle.requestPermission({ mode: 'readwrite' });
      if(perm === 'granted'){
        updateFileStatus('connected: ' + fileHandle.name, 'connected');
        return;
      }
    }
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'stops-data.json', accept: { 'application/json': ['.json'] } }]
    });
    fileHandle = handle;
    await idbSet('stopsFile', handle);
    updateFileStatus('connected: ' + handle.name, 'connected');
  } catch(e){
    // user cancelled the picker — ignore
  }
});

/* ---------- saving ---------- */
function flashSaveStatus(text){
  const el = document.getElementById('saveStatus');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

function downloadFile(text){
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stops-data.json';
  a.click();
}

async function persistStops(){
  const text = window.mapApp.toFileText(window.mapApp.getStops());

  if(fileHandle){
    try{
      let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
      if(perm !== 'granted'){
        perm = await fileHandle.requestPermission({ mode: 'readwrite' });
      }
      if(perm === 'granted'){
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        flashSaveStatus('Saved to ' + fileHandle.name);
        return;
      }
    } catch(e){
      console.warn('Direct save failed, falling back to download', e);
    }
  }

  downloadFile(text);
  flashSaveStatus('Downloaded stops-data.json — connect a file above to save directly next time');
}

/* ---------- place search ---------- */
document.getElementById('geocodeBtn').addEventListener('click', async () => {
  const q = document.getElementById('searchPlace').value.trim();
  const resultsBox = document.getElementById('geocodeResults');
  resultsBox.innerHTML = 'Searching…';
  if(!q){ resultsBox.innerHTML = ''; return; }
  try{
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if(!data.length){ resultsBox.innerHTML = 'No results.'; return; }
    resultsBox.innerHTML = '';
    data.forEach(place => {
      const div = document.createElement('div');
      div.textContent = place.display_name;
      div.addEventListener('click', () => {
        document.getElementById('fLat').value = parseFloat(place.lat).toFixed(4);
        document.getElementById('fLng').value = parseFloat(place.lon).toFixed(4);
        if(!document.getElementById('fName').value){
          document.getElementById('fName').value = place.display_name.split(',')[0];
        }
        resultsBox.innerHTML = '';
      });
      resultsBox.appendChild(div);
    });
  } catch(e){
    resultsBox.innerHTML = 'Lookup failed — enter lat/lng manually.';
  }
});

/* ---------- form ---------- */
function readForm(){
  const name = document.getElementById('fName').value.trim();
  const lat = parseFloat(document.getElementById('fLat').value);
  const lng = parseFloat(document.getElementById('fLng').value);
  const date = document.getElementById('fDate').value || new Date().toISOString().slice(0,10);
  const notes = document.getElementById('fNotes').value;
  const photos = document.getElementById('fPhotos').value
    .split(',').map(s => s.trim()).filter(Boolean);
  if(!name || isNaN(lat) || isNaN(lng)){
    alert('Please provide at least a name and coordinates (use the search box above).');
    return null;
  }
  const id = editingId || (window.mapApp.slugify(name) || ('stop-' + Date.now()));
  return { id, name, date, lat, lng, notes, photos };
}

function resetForm(){
  editingId = null;
  ['fName','fLat','fLng','fDate','fNotes','fPhotos','searchPlace'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('geocodeResults').innerHTML = '';
  document.getElementById('panelTitle').textContent = 'Add a stop';
  document.getElementById('saveBtn').textContent = 'Save to stops-data.json';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

document.getElementById('previewBtn').addEventListener('click', () => {
  const stop = readForm();
  if(!stop) return;
  window.mapApp.addOrUpdateStop(stop);
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const stop = readForm();
  if(!stop) return;
  window.mapApp.addOrUpdateStop(stop);
  await persistStops();
  resetForm();
});

document.getElementById('cancelEditBtn').addEventListener('click', () => {
  resetForm();
});

/* ---------- edit / delete hooks (called from map-app.js sidebar cards) ---------- */
window.onEditStop = function(id){
  const stop = window.mapApp.getStops().find(s => s.id === id);
  if(!stop) return;
  editingId = stop.id;
  document.getElementById('fName').value = stop.name;
  document.getElementById('fLat').value = stop.lat;
  document.getElementById('fLng').value = stop.lng;
  document.getElementById('fDate').value = stop.date;
  document.getElementById('fNotes').value = stop.notes || '';
  document.getElementById('fPhotos').value = (stop.photos || []).join(', ');
  document.getElementById('panelTitle').textContent = 'Editing: ' + stop.name;
  document.getElementById('saveBtn').textContent = 'Save changes';
  document.getElementById('cancelEditBtn').style.display = 'inline-block';
  document.getElementById('addPanel').open = true;
  window.mapApp.focusStop(id);
};

window.onDeleteStop = async function(id){
  const stop = window.mapApp.getStops().find(s => s.id === id);
  if(!stop) return;
  if(!confirm(`Delete "${stop.name}"? This can't be undone.`)) return;
  window.mapApp.removeStop(id);
  await persistStops();
  if(editingId === id) resetForm();
};

initFileConnection();
