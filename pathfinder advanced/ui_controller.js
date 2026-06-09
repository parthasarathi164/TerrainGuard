import { TerrainProcessor } from './terrain_processor.js';
import { TerrainVisualizer } from './visualizer.js';
import { UASPathfinder } from './pathfinder.js';
import { HeatmapVisualizer } from './heatmap_visualizer.js'; 

export const CONFIG = { GRID_RES: 128, PLANE_SIZE: 100 };
export const DATA = {
    terrainHeights: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    tciScores: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    minEl: 0, maxEl: 0,
    bounds: null // Added to hold Lat/Lng bounds
};

export function logStatus(msg, type = "normal") {
    const logEl = document.getElementById('status-log');
    logEl.innerHTML = msg; logEl.className = type;
}

// --- 1. SPA Navigation Logic ---
document.getElementById('nav-3d').addEventListener('click', (e) => {
    document.getElementById('view-3d').style.display = 'block';
    document.getElementById('view-2d').style.display = 'none';
    e.target.classList.add('active');
    document.getElementById('nav-2d').classList.remove('active');
});

document.getElementById('nav-2d').addEventListener('click', (e) => {
    document.getElementById('view-3d').style.display = 'none';
    document.getElementById('view-2d').style.display = 'flex';
    e.target.classList.add('active');
    document.getElementById('nav-3d').classList.remove('active');
});

// --- 2. Initialize Visualizers ---
TerrainVisualizer.init();

// --- 3. Upload Event ---
document.getElementById('file-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    logStatus("Parsing GeoTIFF via Module Pipeline...");
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        
        // Extract geographic bounding box [minLng, minLat, maxLng, maxLat]
        const bbox = image.getBoundingBox();
        DATA.bounds = {
            minLng: bbox[0],
            minLat: bbox[1],
            maxLng: bbox[2],
            maxLat: bbox[3]
        };
        
        const rasters = await image.readRasters();
        
        TerrainProcessor.process(rasters[0], image.getWidth(), image.getHeight());
        
        TerrainVisualizer.renderTerrain();
        TerrainVisualizer.drawAxisNumbers();
        
        HeatmapVisualizer.drawBaseHeatmap(DATA.tciScores);
        
        const startBtn = document.getElementById('btn-start');
        startBtn.removeAttribute('disabled'); startBtn.disabled = false;
        
        syncLiveMarkers(); 
        logStatus("Terrain Loaded. Ready for Pathfinding Routing.");
    } catch (err) {
        logStatus("Error reading TIFF: " + err.message, "error");
    }
});

// --- 4. Unified Simulation Click Event ---
document.getElementById('btn-start').addEventListener('click', () => {
    const params = {
        sx: parseInt(document.getElementById('start-x').value),
        sz: parseInt(document.getElementById('start-z').value),
        ex: parseInt(document.getElementById('end-x').value),
        ez: parseInt(document.getElementById('end-z').value),
        maxH: parseFloat(document.getElementById('max-height').value),
        maxRisk: parseFloat(document.getElementById('max-risk').value)
    };

    logStatus(`Calculating Path (Max Elev: ${params.maxH}m, Max TTCI: ${params.maxRisk})...`);
    TerrainVisualizer.drawStraightLine(params.sx, params.sz, params.ex, params.ez);

    setTimeout(() => {
        const startTime = performance.now();
        const result = UASPathfinder.run(params.sx, params.sz, params.ex, params.ez, params.maxH, params.maxRisk);
        const calcTime = performance.now() - startTime;

        if (result && result.path) {
            const path = result.path;
            logStatus("Optimal Safe Corridor Found. Launching Drone...", "normal");
            TerrainVisualizer.drawPath(path);
            TerrainVisualizer.spawnDrone(path);
            
            HeatmapVisualizer.drawPathOnHeatmap(path);
            HeatmapVisualizer.generateMathReport(path, calcTime);
        } else {
            logStatus(`CRITICAL: ${result.error}.`, "error");
            document.getElementById('math-output').innerHTML = `\n[!] FATAL: DESTINATION UNREACHABLE\n\nCONSTRAINT TRIGGERED: ${result.error}\n-> ${result.detail}\n\nPlease adjust your Flight Ceiling or Max Acceptable Risk limits and run again.`;
        }
    }, 100);
});

// --- 5. Live Preview Logic ---
function syncLiveMarkers() {
    if (DATA.terrainHeights[0] === 0) return;

    const sx = parseInt(document.getElementById('start-x').value);
    const sz = parseInt(document.getElementById('start-z').value);
    const ex = parseInt(document.getElementById('end-x').value);
    const ez = parseInt(document.getElementById('end-z').value);
    const maxH = parseFloat(document.getElementById('max-height').value);

    TerrainVisualizer.updateLiveMarkers(sx, sz, ex, ez);
    TerrainVisualizer.updateMaxHeightCeiling(maxH);
    HeatmapVisualizer.updateLivePreview(sx, sz, ex, ez, DATA.tciScores);
}

['start-x', 'start-z', 'end-x', 'end-z', 'max-height', 'max-risk'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncLiveMarkers);
});

// --- UI Syncing ---
document.getElementById('theme-select').addEventListener('change', () => { if (DATA.terrainHeights[0] !== 0) TerrainVisualizer.renderTerrain(); });
document.getElementById('terrain-opacity').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('opacity-val').innerText = val.toFixed(2);
    TerrainVisualizer.updateOpacity(val);
});