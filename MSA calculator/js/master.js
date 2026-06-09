import { UIController } from './slaves/uiController.js';
import { TerrainEngine } from './slaves/terrainEngine.js';
import { MSACalculator } from './slaves/msaCalculator.js';

class MasterController {
    constructor() {
        this.ui = new UIController();
        this.engine = new TerrainEngine();
        this.msaCalc = new MSACalculator();

        this.init();
    }

    init() {
        this.ui.init({
            onOpacityChange: (val) => this.engine.setOpacity(val),
            
            onTerrainParsed: (rasterData, width, height) => {
                this.engine.process(rasterData, width, height);
                this.updateLiveMarkers(); // Draw initial markers once terrain loads
                this.ui.setStatus('Terrain & Axes generated successfully.');
            },

            // This fires every time a user types in a coordinate box
            onWaypointsChanged: () => {
                this.updateLiveMarkers();
            },
            
            onRunMSA: () => this.runMSACalculation()
        });
    }

    updateLiveMarkers() {
        if (!this.engine.terrainData) return;
        const waypoints = this.ui.getWaypoints();
        this.engine.drawLiveMarkers(waypoints);
    }

    runMSACalculation() {
        if (!this.engine.terrainData) {
            alert("Please upload a .tif terrain file first.");
            return;
        }

        const waypoints = this.ui.getWaypoints();
        this.ui.setStatus('Calculating sector-by-sector MSA profiles...');

        try {
            const sectors = this.msaCalc.calculateSectors(waypoints, this.engine.terrainData);
            this.engine.drawPath(sectors);
            
            let status = 'MSA: ';
            sectors.forEach(s => status += `[Sec ${s.sectorIndex}: ${s.msaAltitude.toFixed(0)}m] `);
            this.ui.setStatus(status);

        } catch (err) {
            console.error(err);
            this.ui.setStatus('Error calculating MSA pathing constraints.');
        }
    }
}

window.onload = () => {
    new MasterController();
};