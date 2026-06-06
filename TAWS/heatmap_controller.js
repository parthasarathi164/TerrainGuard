import { CONFIG, DATA } from './ui_controller.js';
import { TerrainProcessor } from './terrain_processor.js';
import { UASPathfinder } from './pathfinder.js';
import { HeatmapVisualizer } from './heatmap_visualizer.js';

const outLog = document.getElementById('math-output');

function logMath(text, append = false) {
    if (append) outLog.innerHTML += text + "\n";
    else outLog.innerHTML = text + "\n";
}

document.getElementById('file-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    logMath("SYSTEM: Parsing GeoTIFF Matrix...\n");
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer);
        const image = await tiff.getImage();
        const rasters = await image.readRasters();
        
        TerrainProcessor.process(rasters[0], image.getWidth(), image.getHeight());
        
        logMath("SYSTEM: TTCI Risk Matrix Computed.", true);
        logMath(`Min Elevation: ${Math.round(DATA.minEl)}m | Max Elevation: ${Math.round(DATA.maxEl)}m`, true);
        
        // Draw the initial heatmap without a path
        HeatmapVisualizer.draw(DATA.tciScores, DATA.terrainHeights);
        
        document.getElementById('btn-run').disabled = false;
        logMath("\nREADY: Awaiting Route Parameters...", true);
    } catch (err) {
        logMath("ERROR: " + err.message);
    }
});

document.getElementById('btn-run').addEventListener('click', () => {
    const sx = parseInt(document.getElementById('sx').value);
    const sz = parseInt(document.getElementById('sz').value);
    const ex = parseInt(document.getElementById('ex').value);
    const ez = parseInt(document.getElementById('ez').value);
    const maxH = parseFloat(document.getElementById('max-height').value);

    logMath("--- A* ALGORITHM INITIATED ---\n");
    logMath(`Validating hard limits: Flight Ceiling ${maxH}m...`, true);

    const startTime = performance.now();
    const path = UASPathfinder.run(sx, sz, ex, ez, maxH);
    const endTime = performance.now();

    if (path) {
        HeatmapVisualizer.draw(DATA.tciScores, DATA.terrainHeights, path);
        
        // --- Generate Math Analytics Report ---
        let totalCost = 0;
        let maxRisk = 0;
        let report = `\nRESULT: Optimal Path Found in ${(endTime - startTime).toFixed(2)}ms\n`;
        report += `Total Waypoints: ${path.length}\n\n`;
        
        report += `[STEP]  |  [COORD]  | [ELEV] | [TTCI PENALTY]\n`;
        report += `-------------------------------------------\n`;

        // Only print every 5th step so we don't lag the browser with massive text walls
        path.forEach((node, index) => {
            const parts = node.split(',');
            const x = parseInt(parts[0]);
            const z = parseInt(parts[1]);
            const idx = z * CONFIG.GRID_RES + x;
            
            const elev = Math.round(DATA.terrainHeights[idx]);
            const risk = DATA.tciScores[idx].toFixed(2);
            
            if (DATA.tciScores[idx] > maxRisk) maxRisk = DATA.tciScores[idx];
            totalCost += (DATA.tciScores[idx] > 80 ? 1000 : (DATA.tciScores[idx] > 50 ? 15 : 1));

            if (index % 5 === 0 || index === path.length - 1) {
                report += `Step ${index.toString().padEnd(3)}| X:${x.toString().padEnd(3)} Z:${z.toString().padEnd(3)}| ${elev}m  | Risk: ${risk}\n`;
            }
        });

        report += `-------------------------------------------\n`;
        report += `MAX TTCI ENCOUNTERED : ${maxRisk.toFixed(2)} / 100\n`;
        report += `TOTAL PATH RISK COST : ${totalCost.toFixed(2)}\n`;
        
        logMath(report, true);

    } else {
        logMath("\n[!] FATAL: No valid path exists.", true);
        logMath(`Terrain geometry or TTCI risks physically block all routes below ${maxH}m.`, true);
    }
});