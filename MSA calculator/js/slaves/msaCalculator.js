export class MSACalculator {
    constructor() {
        this.safetyBuffer = 300; 
        this.horizontalBufferPixels = 40; 
        this.segmentLength = 40; // The length of each sub-sector chunk
    }

    calculateSectors(waypoints, terrainData) {
        if (!terrainData) throw new Error("Terrain data not loaded.");
        const sectors = [];
        
        for (let i = 0; i < waypoints.length - 1; i++) {
            const start = waypoints[i];
            const end = waypoints[i+1];
            
            // --- NEW: Subdivide the path into small chunks ---
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Determine how many chunks we need to bridge this leg
            const numSegments = Math.max(1, Math.ceil(distance / this.segmentLength));
            
            const subSectors = [];
            
            for (let j = 0; j < numSegments; j++) {
                const t1 = j / numSegments;
                const t2 = (j + 1) / numSegments;
                
                // Interpolate the start and end coordinates of this specific chunk
                const p1 = {
                    x: start.x + dx * t1,
                    y: start.y + (end.y - start.y) * t1, 
                    z: start.z + dz * t1
                };
                const p2 = {
                    x: start.x + dx * t2,
                    y: start.y + (end.y - start.y) * t2,
                    z: start.z + dz * t2
                };
                
                const msa = this.calculateMSAForSector(p1, p2, terrainData);
                subSectors.push({ start: p1, end: p2, msaAltitude: msa });
            }
            // --------------------------------------------------

            sectors.push({
                sectorIndex: i + 1,
                start: start,
                end: end,
                subSectors: subSectors // Attach chunks to main sector
            });
        }
        return sectors;
    }

    calculateMSAForSector(p1, p2, terrainData) {
        // Direct pixel alignment logic 
        const minX = Math.min(p1.x, p2.x) - this.horizontalBufferPixels;
        const maxX = Math.max(p1.x, p2.x) + this.horizontalBufferPixels;
        const minZ = Math.min(p1.z, p2.z) - this.horizontalBufferPixels; 
        const maxZ = Math.max(p1.z, p2.z) + this.horizontalBufferPixels;

        // Clip strictly to image bounds
        const startPixelX = Math.max(0, Math.floor(minX));
        const endPixelX = Math.min(terrainData.width - 1, Math.ceil(maxX));
        const startPixelY = Math.max(0, Math.floor(minZ));
        const endPixelY = Math.min(terrainData.height - 1, Math.ceil(maxZ));

        let highestElevation = 0;

        for (let x = startPixelX; x <= endPixelX; x++) {
            for (let y = startPixelY; y <= endPixelY; y++) {
                const elevation = terrainData.data[y * terrainData.width + x];
                if (elevation > highestElevation) {
                    highestElevation = elevation;
                }
            }
        }

        return highestElevation + this.safetyBuffer; 
    }
}