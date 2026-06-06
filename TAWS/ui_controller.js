import { TerrainProcessor } from './terrain_processor.js';
import { TerrainVisualizer } from './visualizer.js';
import { UASPathfinder } from './pathfinder.js';
import { HeatmapVisualizer } from './heatmap_visualizer.js'; // Import the new module

export const CONFIG = { GRID_RES: 128, PLANE_SIZE: 100 };
export const DATA = {
    terrainHeights: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    tciScores: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    minEl: 0, maxEl: 0
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
    document.getElementById('view-2d').style.display = 'flex'; // Uses flex for split layout
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
        const rasters = await image.readRasters();
        
        TerrainProcessor.process(rasters[0], image.getWidth(), image.getHeight());
        
        TerrainVisualizer.renderTerrain();
        TerrainVisualizer.drawAxisNumbers();
        
        // Draw the baseline 2D Heatmap instantly (without path)
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
        maxH: parseFloat(document.getElementById('max-height').value)
    };

    logStatus("Calculating Shortest Corridor Path...");
    TerrainVisualizer.drawStraightLine(params.sx, params.sz, params.ex, params.ez);

    setTimeout(() => {
        const startTime = performance.now();
        const path = UASPathfinder.run(params.sx, params.sz, params.ex, params.ez, params.maxH);
        const calcTime = performance.now() - startTime;

        if (path) {
            logStatus("Optimal Safe Corridor Found. Launching Drone...", "normal");
            
            // 1. Update 3D Viewer
            TerrainVisualizer.drawPath(path);
            TerrainVisualizer.spawnDrone(path);
            
            // 2. Update 2D Math Analytics
            HeatmapVisualizer.drawPathOnHeatmap(path);
            HeatmapVisualizer.generateMathReport(path, calcTime);

        } else {
            logStatus(`CRITICAL: Destination Unreachable under ${params.maxH}m.`, "error");
            document.getElementById('math-output').innerHTML = `\n[!] FATAL: No valid path exists.\nTerrain geometry physically blocks all routes below ${params.maxH}m.`;
        }
    }, 100);
});

// --- UI Syncing ---
document.getElementById('theme-select').addEventListener('change', () => { if (DATA.terrainHeights[0] !== 0) TerrainVisualizer.renderTerrain(); });
document.getElementById('terrain-opacity').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('opacity-val').innerText = val.toFixed(2);
    TerrainVisualizer.updateOpacity(val);
});

// --- 5. Live Coordinate Preview Logic ---
// --- 5. Live Preview Logic ---
function syncLiveMarkers() {
    if (DATA.terrainHeights[0] === 0) return; // Prevent errors before upload

    const sx = parseInt(document.getElementById('start-x').value);
    const sz = parseInt(document.getElementById('start-z').value);
    const ex = parseInt(document.getElementById('end-x').value);
    const ez = parseInt(document.getElementById('end-z').value);
    const maxH = parseFloat(document.getElementById('max-height').value); // Fetch max height

    // Update 3D markers and ceiling instantly
    TerrainVisualizer.updateLiveMarkers(sx, sz, ex, ez);
    TerrainVisualizer.updateMaxHeightCeiling(maxH);
    
    // Update 2D Heatmap instantly
    HeatmapVisualizer.updateLivePreview(sx, sz, ex, ez, DATA.tciScores);
}

// Attach the listener to ALL FIVE numerical inputs (added max-height)
['start-x', 'start-z', 'end-x', 'end-z', 'max-height'].forEach(id => {
    document.getElementById(id).addEventListener('input', syncLiveMarkers);
});