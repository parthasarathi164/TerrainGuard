export class MSACalculator {
    constructor() {
        this.safetyBuffer = 600; 
        this.horizontalBufferPixels = 308; 
    }

    calculateSectors(waypoints, terrainData) {
        if (!terrainData) throw new Error("Terrain data not loaded.");
        const sectors = [];
        
        for (let i = 0; i < waypoints.length - 1; i++) {
            const start = waypoints[i];
            const end = waypoints[i+1];
            const msa = this.calculateMSAForSector(start, end, terrainData);
            
            sectors.push({
                sectorIndex: i + 1,
                start: start,
                end: end,
                msaAltitude: msa
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