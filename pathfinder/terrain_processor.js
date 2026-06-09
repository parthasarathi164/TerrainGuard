import { CONFIG, DATA } from './ui_controller.js';

export const TerrainProcessor = {
    process(rawData, imgW, imgH) {
        const stepX = Math.floor(imgW / CONFIG.GRID_RES);
        const stepY = Math.floor(imgH / CONFIG.GRID_RES);
        
        // Reset and target data writing directly to the shared global memory profile
        DATA.minEl = Infinity; 
        DATA.maxEl = -Infinity;

        // 1. Map Downscaled Grid matrices
        for (let y = 0; y < CONFIG.GRID_RES; y++) {
            for (let x = 0; x < CONFIG.GRID_RES; x++) {
                const idx = (y * stepY) * imgW + (x * stepX);
                let val = rawData[idx];
                if (val < -1000) val = DATA.minEl === Infinity ? 0 : DATA.minEl; 
                
                // Write data straight into the shared export arrays
                DATA.terrainHeights[y * CONFIG.GRID_RES + x] = val;
                
                if (val < DATA.minEl) DATA.minEl = val;
                if (val > DATA.maxEl) DATA.maxEl = val;
            }
        }

        // 2. Generate Slope Ruggedness Derivatives
        for (let y = 1; y < CONFIG.GRID_RES - 1; y++) {
            for (let x = 1; x < CONFIG.GRID_RES - 1; x++) {
                const idx = y * CONFIG.GRID_RES + x;
                const el = DATA.terrainHeights[idx];
                
                let maxDiff = 0;
                [[0,1],[1,0],[0,-1],[-1,0]].forEach(d => {
                    const nIdx = (y+d[0]) * CONFIG.GRID_RES + (x+d[1]);
                    maxDiff = Math.max(maxDiff, Math.abs(el - DATA.terrainHeights[nIdx]));
                });
                
                // Write risk structures straight into the global scoring matrix
                DATA.tciScores[idx] = Math.min(100, (maxDiff / ((DATA.maxEl - DATA.minEl) * 0.05)) * 100);
            }
        }
    }
};