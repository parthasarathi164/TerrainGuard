export class UIController {
    constructor() {
        this.checkpointsCount = 0;
        this.container = document.getElementById('checkpoints-container');
        this.liveUpdateCallback = null; 
    }

    init(callbacks) {
        this.liveUpdateCallback = callbacks.onWaypointsChanged;

        document.getElementById('add-checkpoint-btn').addEventListener('click', () => {
            this.addCheckpoint();
            this.bindLiveUpdates(); 
            if (this.liveUpdateCallback) this.liveUpdateCallback();
        });

        document.getElementById('opacity-slider').addEventListener('input', (e) => {
            document.getElementById('opacity-val').innerText = `${Math.round(e.target.value * 100)}%`;
            callbacks.onOpacityChange(parseFloat(e.target.value));
        });
        
        document.getElementById('tif-upload').addEventListener('change', async (e) => {
            const file = e.target.files[0]; 
            if (!file) return;
            this.setStatus("Parsing GeoTIFF via Module Pipeline...");
            
            try {
                const arrayBuffer = await file.arrayBuffer(); 
                const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer); 
                const image = await tiff.getImage(); 
                const rasters = await image.readRasters(); 
                
                callbacks.onTerrainParsed(rasters[0], image.getWidth(), image.getHeight());
                this.loadDefaultCheckpoints();
                this.bindLiveUpdates(); 
                
            } catch (err) {
                console.error(err);
                this.setStatus("Error parsing GeoTIFF file.");
            }
        });

        document.getElementById('run-msa-btn').addEventListener('click', callbacks.onRunMSA);
    }

    loadDefaultCheckpoints() {
        this.container.innerHTML = "";
        this.checkpointsCount = 0;

        // CP1 configuration: (82, 5000, 193)
        this.injectCheckpointRow(82, 5000, 193);
        
        // CP2 configuration: (220, 4900, 373)
        this.injectCheckpointRow(220, 4900, 373);

        // CP3 configuration: (350, 5300, 476)
        this.injectCheckpointRow(350, 5300, 476);

        if (this.liveUpdateCallback) this.liveUpdateCallback();
    }

    injectCheckpointRow(x, y, z) {
        this.checkpointsCount++;
        const id = this.checkpointsCount;
        const div = document.createElement('div');
        div.className = 'checkpoint-row';
        div.id = `cp-${id}`;
        
        div.innerHTML = `
            <label>CP${id}:</label>
            <input type="number" class="cp-x" placeholder="X" value="${x}">
            <input type="number" class="cp-y" placeholder="Y" value="${y}">
            <input type="number" class="cp-z" placeholder="Z" value="${z}">
            <button class="remove-btn" onclick="document.getElementById('cp-${id}').remove(); window.triggerLiveUpdate();">X</button>
        `;
        this.container.appendChild(div);

        window.triggerLiveUpdate = () => { if(this.liveUpdateCallback) this.liveUpdateCallback(); };
    }

    addCheckpoint() {
        // Adjusts to scale cleanly from the end of CP3 defaults
        const nextX = 350 + (this.checkpointsCount * 50);
        const nextY = 5300;
        const nextZ = 476 + (this.checkpointsCount * 50);
        
        this.injectCheckpointRow(nextX, nextY, nextZ);
    }

    bindLiveUpdates() {
        const inputs = document.querySelectorAll('.waypoint input[type="number"], .checkpoint-row input[type="number"]');
        inputs.forEach(input => {
            input.removeEventListener('input', this.liveUpdateCallback);
            input.addEventListener('input', this.liveUpdateCallback);
        });
    }

    getWaypoints() {
        const points = [];
        points.push({
            x: parseFloat(document.getElementById('start-x').value) || 0,
            y: parseFloat(document.getElementById('start-y').value) || 0,
            z: parseFloat(document.getElementById('start-z').value) || 0,
            type: 'start'
        });

        const cpRows = this.container.querySelectorAll('.checkpoint-row');
        cpRows.forEach(row => {
            points.push({
                x: parseFloat(row.querySelector('.cp-x').value) || 0,
                y: parseFloat(row.querySelector('.cp-y').value) || 0,
                z: parseFloat(row.querySelector('.cp-z').value) || 0,
                type: 'checkpoint'
            });
        });

        points.push({
            x: parseFloat(document.getElementById('end-x').value) || 0,
            y: parseFloat(document.getElementById('end-y').value) || 0,
            z: parseFloat(document.getElementById('end-z').value) || 0,
            type: 'end'
        });

        return points;
    }

    setStatus(msg) {
        document.getElementById('status-text').innerText = msg;
    }
}