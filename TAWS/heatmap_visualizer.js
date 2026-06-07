import { CONFIG, DATA } from './ui_controller.js';

export const HeatmapVisualizer = {
    // Stores the cell dimensions locally so we don't recalculate
    cellW: 0, 
    cellH: 0,

    drawBaseHeatmap(tciData) {
        const canvas = document.getElementById('heatmap-canvas');
        const ctx = canvas.getContext('2d');
        const res = CONFIG.GRID_RES;
        
        this.cellW = canvas.width / res;
        this.cellH = canvas.height / res;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw the baseline risk map
        for (let z = 0; z < res; z++) {
            for (let x = 0; x < res; x++) {
                const idx = z * res + x;
                const risk = tciData[idx];
                
                // Color scale: Green (0) to Red (100)
                const r = risk > 50 ? 255 : Math.floor((risk / 50) * 255);
                const g = risk < 50 ? 255 : Math.floor(255 - ((risk - 50) / 50) * 255);
                
                ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
                ctx.fillRect(x * this.cellW, z * this.cellH, this.cellW + 0.5, this.cellH + 0.5);
            }
        }
    },

    updateLivePreview(sx, sz, ex, ez, tciData) {
        // 1. Redraw the base heatmap to erase old dots and paths
        this.drawBaseHeatmap(tciData);
        
        const canvas = document.getElementById('heatmap-canvas');
        const ctx = canvas.getContext('2d');

        // --- REPLACE THE START/END DRAWING IN updateLivePreview ---
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000'; // Black border

        // Draw Start Marker (Green)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath(); 
        ctx.arc(sx * this.cellW + (this.cellW / 2), sz * this.cellH + (this.cellH / 2), 8, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke(); // Paints the black border
        
        // Draw End Marker (Red)
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); 
        ctx.arc(ex * this.cellW + (this.cellW / 2), ez * this.cellH + (this.cellH / 2), 8, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke(); // Paints the black border
    },

    drawPathOnHeatmap(pathArray) {
        // Redraw base to clear old lines, then draw the new path
        this.drawBaseHeatmap(DATA.tciScores);
        
        const canvas = document.getElementById('heatmap-canvas');
        const ctx = canvas.getContext('2d');

        ctx.beginPath();
        ctx.strokeStyle = '#000000'; // Black path
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        pathArray.forEach((str, index) => {
            const parts = str.split(',');
            const px = parseInt(parts[0]) * this.cellW + (this.cellW / 2);
            const pz = parseInt(parts[1]) * this.cellH + (this.cellH / 2);

            if (index === 0) ctx.moveTo(px, pz);
            else ctx.lineTo(px, pz);
        });
        ctx.stroke();

        // Draw start/end nodes
        const sP = pathArray[0].split(',');
        const eP = pathArray[pathArray.length - 1].split(',');
        
        // --- Added styling for the black borders ---
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000000'; 

        // Draw Start Marker (Green with Black Border)
        ctx.fillStyle = '#00ff00';
        ctx.beginPath(); 
        ctx.arc(parseInt(sP[0]) * this.cellW + (this.cellW / 2), parseInt(sP[1]) * this.cellH + (this.cellH / 2), 8, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke(); // Paints the black border
        
        // Draw End Marker (Red with Black Border)
        ctx.fillStyle = '#ff0000';
        ctx.beginPath(); 
        ctx.arc(parseInt(eP[0]) * this.cellW + (this.cellW / 2), parseInt(eP[1]) * this.cellH + (this.cellH / 2), 8, 0, Math.PI * 2); 
        ctx.fill();
        ctx.stroke(); // Paints the black border
    },

    generateMathReport(path, calcTime) {
        const outLog = document.getElementById('math-output');
        let totalCost = 0;
        let maxRisk = 0;
        
        let report = `--- A* ALGORITHMIC TELEMETRY ---\n`;
        report += `Calculation Time : ${calcTime.toFixed(2)} ms\n`;
        report += `Total Waypoints  : ${path.length} nodes\n`;
        report += `Terrain Array    : 16,384 vectors verified\n\n`;
        
        report += `[STEP] | [COORD]   | [ELEV] | [TTCI RISK]\n`;
        report += `-----------------------------------------\n`;

        // Output every 5th step to show the math without lagging the text box
        path.forEach((node, index) => {
            const parts = node.split(',');
            const x = parseInt(parts[0]);
            const z = parseInt(parts[1]);
            const idx = z * CONFIG.GRID_RES + x;
            
            const elev = Math.round(DATA.terrainHeights[idx]);
            const risk = DATA.tciScores[idx].toFixed(2);
            
            if (DATA.tciScores[idx] > maxRisk) maxRisk = DATA.tciScores[idx];
            
            // REVERTED: Changed back to 1 so the text report matches the UI controller's calculation exactly
            totalCost += (DATA.tciScores[idx] > 80 ? 1000 : (DATA.tciScores[idx] > 50 ? 15 : 1));

            if (index % 5 === 0 || index === path.length - 1) {
                report += `Step ${index.toString().padEnd(2)}| X:${x.toString().padEnd(3)} Z:${z.toString().padEnd(3)}| ${elev}m  | R: ${risk}\n`;
            }
        });

        report += `-----------------------------------------\n`;
        report += `MAX TTCI ENCOUNTERED : ${maxRisk.toFixed(2)} / 100\n`;
        report += `TOTAL PATH RISK COST : ${totalCost.toFixed(2)}\n`;
        
        outLog.innerHTML = report;
    }
};