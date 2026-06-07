import { CONFIG, DATA } from './ui_controller.js';

export const UASPathfinder = {
    run(startX, startZ, endX, endZ, maxH, maxRiskLimit = 100) {
        const startIdx = startZ * CONFIG.GRID_RES + startX;
        const endIdx = endZ * CONFIG.GRID_RES + endX;

        // FIXED: The math engine now dynamically calculates the exact real-world 
        // equivalent of the 0.5 visual offset used in visualizer.js
        const FLIGHT_CLEARANCE = 0.075 * (DATA.maxEl - DATA.minEl);

        // 1. PRE-FLIGHT CHECKS:
        if (DATA.terrainHeights[startIdx] + FLIGHT_CLEARANCE > maxH) return { error: "Launch Pad Blocked", detail: `Start elevation + hover clearance (${Math.round(DATA.terrainHeights[startIdx])}m + ${Math.round(FLIGHT_CLEARANCE)}m) exceeds your flight ceiling (${maxH}m).` };
        if (DATA.terrainHeights[endIdx] + FLIGHT_CLEARANCE > maxH) return { error: "Landing Zone Blocked", detail: `Target elevation + hover clearance (${Math.round(DATA.terrainHeights[endIdx])}m + ${Math.round(FLIGHT_CLEARANCE)}m) exceeds your flight ceiling (${maxH}m).` };
        if (DATA.tciScores[startIdx] > maxRiskLimit) return { error: "Launch Pad Unsafe", detail: `Start point risk (${Math.round(DATA.tciScores[startIdx])}) exceeds your Max Acceptable Risk (${maxRiskLimit}).` };
        if (DATA.tciScores[endIdx] > maxRiskLimit) return { error: "Landing Zone Unsafe", detail: `Target risk (${Math.round(DATA.tciScores[endIdx])}) exceeds your Max Acceptable Risk (${maxRiskLimit}).` };

        const openSet = [];
        const cameFrom = new Map();
        const gScore = new Map();
        
        let hitAltitudeWall = false;
        let hitRiskWall = false;
        
        const startKey = `${startX},${startZ}`;
        gScore.set(startKey, 0);
        openSet.push({ x: startX, z: startZ, f: this.getHeuristic(startX, startZ, endX, endZ) });

        while (openSet.length > 0) {
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const currKey = `${current.x},${current.z}`;

            if (current.x === endX && current.z === endZ) {
                return { path: this.reconstructPath(cameFrom, currKey) };
            }

            const neighbors = [
                {x: current.x, z: current.z-1}, {x: current.x, z: current.z+1},
                {x: current.x-1, z: current.z}, {x: current.x+1, z: current.z},
                {x: current.x-1, z: current.z-1}, {x: current.x+1, z: current.z+1},
                {x: current.x-1, z: current.z+1}, {x: current.x+1, z: current.z-1}
            ];

            for (let n of neighbors) {
                if (n.x < 0 || n.x >= CONFIG.GRID_RES || n.z < 0 || n.z >= CONFIG.GRID_RES) continue;

                const isBorder = (n.x === 0 || n.x === CONFIG.GRID_RES - 1 || n.z === 0 || n.z === CONFIG.GRID_RES - 1);
                const isDestination = (n.x === endX && n.z === endZ);
                if (isBorder && !isDestination) continue;

                const idx = n.z * CONFIG.GRID_RES + n.x;

                // 2. DIAGNOSTIC TRACKING:
                if (DATA.terrainHeights[idx] + FLIGHT_CLEARANCE > maxH) { hitAltitudeWall = true; continue; }
                if (DATA.tciScores[idx] > maxRiskLimit) { hitRiskWall = true; continue; }

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
        
        // 3. POST-FLIGHT DIAGNOSTICS:
        let failReason = "Terrain geometry completely blocks the corridor.";
        if (hitAltitudeWall && !hitRiskWall) failReason = `All available routes are blocked by mountain peaks (requiring at least ${Math.round(FLIGHT_CLEARANCE)}m hover clearance below your ${maxH}m ceiling).`;
        else if (!hitAltitudeWall && hitRiskWall) failReason = `All available routes are blocked by severe risk zones exceeding your limit of ${maxRiskLimit}.`;
        else if (hitAltitudeWall && hitRiskWall) failReason = `The path is choked by a combination of high terrain (needs ${Math.round(FLIGHT_CLEARANCE)}m clearance) and extreme risk zones (>${maxRiskLimit}).`;

        return { error: "No Safe Corridor Found", detail: failReason };
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