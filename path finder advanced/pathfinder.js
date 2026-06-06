import { CONFIG, DATA } from './ui_controller.js';

export const UASPathfinder = {
    run(startX, startZ, endX, endZ, maxH) {
        const startIdx = startZ * CONFIG.GRID_RES + startX;
        const endIdx = endZ * CONFIG.GRID_RES + endX;

        if (DATA.terrainHeights[startIdx] > maxH || DATA.terrainHeights[endIdx] > maxH) return null;

        const openSet = [];
        const cameFrom = new Map();
        const gScore = new Map();
        
        const startKey = `${startX},${startZ}`;
        gScore.set(startKey, 0);
        openSet.push({ x: startX, z: startZ, f: this.getHeuristic(startX, startZ, endX, endZ) });

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const currKey = `${current.x},${current.z}`;

            if (current.x === endX && current.z === endZ) {
                return this.reconstructPath(cameFrom, currKey);
            }

            const neighbors = [
                {x: current.x, z: current.z-1}, {x: current.x, z: current.z+1},
                {x: current.x-1, z: current.z}, {x: current.x+1, z: current.z},
                {x: current.x-1, z: current.z-1}, {x: current.x+1, z: current.z+1},
                {x: current.x-1, z: current.z+1}, {x: current.x+1, z: current.z-1}
            ];

            for (let n of neighbors) {
                if (n.x < 0 || n.x >= CONFIG.GRID_RES || n.z < 0 || n.z >= CONFIG.GRID_RES) continue;

                const idx = n.z * CONFIG.GRID_RES + n.x;
                if (DATA.terrainHeights[idx] > maxH) continue; 

                const isDiagonal = (n.x !== current.x && n.z !== current.z);
                const baseCost = isDiagonal ? 1.414 : 1.0;
                const riskPenalty = DATA.tciScores[idx] > 80 ? 1000 : (DATA.tciScores[idx] > 50 ? 15 : 0); 
                
                const tentative_g = gScore.get(currKey) + baseCost + riskPenalty;
                const nKey = `${n.x},${n.z}`;

                if (!gScore.has(nKey) || tentative_g < gScore.get(nKey)) {
                    cameFrom.set(nKey, current);
                    gScore.set(nKey, tentative_g);
                    openSet.push({ x: n.x, z: n.z, f: tentative_g + this.getHeuristic(n.x, n.z, endX, endZ) });
                }
            }
        }
        return null;
    },

    getHeuristic(x1, z1, x2, z2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
    },

    reconstructPath(cameFrom, currentKey) {
        const path = [currentKey];
        while (cameFrom.has(currentKey)) {
            const prev = cameFrom.get(currentKey);
            currentKey = `${prev.x},${prev.z}`;
            path.push(currentKey);
        }
        return path.reverse();
    }
};