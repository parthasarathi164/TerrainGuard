import { TerrainProcessor } from './terrain_processor.js';
import { TerrainVisualizer } from './visualizer.js';
import { UASPathfinder } from './pathfinder.js';

// Global shared simulation configurations
export const CONFIG = {
    GRID_RES: 128,
    PLANE_SIZE: 100
};

// Global shared data object across modules
export const DATA = {
    terrainHeights: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    tciScores: new Float32Array(CONFIG.GRID_RES * CONFIG.GRID_RES),
    minEl: 0,
    maxEl: 0
};

// Log updates to the UI panel box layout
export function logStatus(msg, type = "normal") {
    const logEl = document.getElementById('status-log');
    logEl.innerHTML = msg;
    logEl.className = type;
}

// 1. Initialize Visualizer Module
TerrainVisualizer.init();

// 2. Handle File Parsing Event
document.getElementById('file-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    logStatus("Parsing GeoTIFF via Module Pipeline...");
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const rasters = await image.readRasters();
        
        // 1. Execute math module to fill global DATA object
        TerrainProcessor.process(rasters[0], image.getWidth(), image.getHeight());
        
        // 2. Clear old canvas elements and rebuild with new loaded data
        TerrainVisualizer.renderTerrain();
        TerrainVisualizer.drawAxisNumbers();
        
        // 3. Enable the button explicitly now that DATA is populated
        const startBtn = document.getElementById('btn-start');
        startBtn.removeAttribute('disabled'); 
        startBtn.disabled = false;
        
        logStatus("Terrain Loaded. Ready for Pathfinding Routing.");
    } catch (err) {
        logStatus("Error reading TIFF: " + err.message, "error");
        console.error(err);
    }
});

// 3. Handle Simulation Execution Click Event
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
        const path = UASPathfinder.run(params.sx, params.sz, params.ex, params.ez, params.maxH);
        if (path) {
            logStatus("Optimal Safe Corridor Found. Launching Drone...", "normal");
            TerrainVisualizer.drawPath(path);
            TerrainVisualizer.spawnDrone(path);
        } else {
            logStatus(`CRITICAL: Destination Unreachable under ${params.maxH}m.`, "error");
        }
    }, 100);
});

// 4. Connect UI Change Listeners to the view space
document.getElementById('theme-select').addEventListener('change', () => {
    if (DATA.terrainHeights[0] !== 0) TerrainVisualizer.renderTerrain();
});

document.getElementById('terrain-opacity').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('opacity-val').innerText = val.toFixed(2);
    TerrainVisualizer.updateOpacity(val);
});