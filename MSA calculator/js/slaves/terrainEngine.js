export class TerrainEngine {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x111111);
        
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);
        this.camera.position.set(1000, 2000, 2000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(1000, 2000, 1000);
        this.scene.add(dirLight);

        this.terrainMesh = null;
        
        this.pathGroup = new THREE.Group();
        this.markerGroup = new THREE.Group(); 
        this.axesGroup = new THREE.Group();
        this.labelGroup = new THREE.Group(); 
        
        this.scene.add(this.pathGroup);
        this.scene.add(this.markerGroup);
        this.scene.add(this.axesGroup);
        this.scene.add(this.labelGroup);
        
        this.terrainData = null; 

        this.animationData = { 
            active: false, 
            points: [], 
            flatSubSectors: [], // New tracker
            subSectorIndices: [], // New tracker
            pauseIndices: new Set(), // New Pause Tracker
            currentPoint: 0, 
            progress: 0, 
            box: null, 
            paused: false, 
            pauseUntil: 0, 
            activeSectorIndex: -1 
        };

        window.addEventListener('resize', () => this.onWindowResize(), false);
        this.animate();
    }

    process(rasterData, width, height) {
        this.terrainData = { width, height, data: rasterData };
        
        if (this.terrainMesh) this.scene.remove(this.terrainMesh);

        const segW = width - 1;
        const segH = height - 1;

        const geometry = new THREE.PlaneGeometry(width, height, segW, segH);
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(width / 2, 0, height / 2);

        const vertices = geometry.attributes.position.array;
        
        const colors = new Float32Array(vertices.length);
        
        let maxElevation = -Infinity;
        let minElevation = Infinity;
        
        for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            const elevation = rasterData[i];
            const displayElev = elevation > -500 ? elevation : 0;
            vertices[j + 1] = displayElev; 
            
            colors[j] = 0.66;
            colors[j+1] = 0.66;
            colors[j+2] = 0.66;

            if (displayElev > maxElevation) maxElevation = displayElev;
            if (displayElev < minElevation && elevation > -500) minElevation = displayElev; 
        }

        if (minElevation === Infinity) minElevation = 0;

        geometry.computeVertexNormals();
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true, 
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        this.terrainMesh = new THREE.Mesh(geometry, material);
        this.terrainMesh.scale.set(1, 1/30, 1);
        this.pathGroup.scale.set(1, 1/30, 1);
        
        this.scene.add(this.terrainMesh);

        this.camera.position.set(width * 1.2, Math.max(width, height), height * 1.2);
        this.controls.target.set(width / 2, 0, height / 2);
        this.controls.update();

        this.drawAxes(width, height, maxElevation, minElevation);
    }

    createTextSprite(message, color) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256; 
        canvas.height = 128;
        
        context.fillStyle = "rgba(0, 0, 0, 0.6)";
        context.fillRect(10, 30, 236, 68);

        context.font = "Bold 34px Arial";
        context.fillStyle = color;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(message, 128, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }); 
        return new THREE.Sprite(spriteMaterial);
    }

    drawAxes(width, height, maxElev, minElev) {
        while(this.axesGroup.children.length > 0) this.axesGroup.remove(this.axesGroup.children[0]);

        const originX = 0;
        const originZ = 0;
        
        const originY = Math.max(0, minElev - 50); 
        const visualOriginY = originY / 30;

        const axesHelper = new THREE.AxesHelper(Math.max(width, height));
        axesHelper.position.set(originX, visualOriginY, originZ);
        this.axesGroup.add(axesHelper);

        const spriteScale = Math.max(width / 20, 20); 
        const step = Math.floor(Math.max(width, height) / 8) || 100;

        for(let i = 0; i <= width; i += step) {
            let sprite = this.createTextSprite(`X:${Math.round(originX + i)}`, "#ff5555");
            sprite.scale.set(spriteScale, spriteScale/2, 1);
            sprite.position.set(originX + i, visualOriginY + 5, originZ);
            this.axesGroup.add(sprite);
        }

        for(let i = 0; i <= height; i += step) {
            let sprite = this.createTextSprite(`Z:${Math.round(originZ + i)}`, "#5555ff");
            sprite.scale.set(spriteScale, spriteScale/2, 1);
            sprite.position.set(originX, visualOriginY + 5, originZ + i);
            this.axesGroup.add(sprite);
        }

        const yStep = 500; 
        const startY = Math.floor(originY / yStep) * yStep; 
        
        for(let i = startY; i <= maxElev + yStep; i += yStep) {
            let sprite = this.createTextSprite(`${i}m`, "#55ff55");
            sprite.scale.set(spriteScale, spriteScale/2, 1);
            sprite.position.set(originX, i / 30, originZ); 
            this.axesGroup.add(sprite);
        }
    }

    drawLiveMarkers(waypoints) {
        if (!this.terrainData) return;
        
        while(this.markerGroup.children.length > 0) {
            this.markerGroup.remove(this.markerGroup.children[0]);
        }

        const radius = Math.max(this.terrainData.width * 0.008, 1); 

        waypoints.forEach(wp => {
            let color = 0x00aaff; 
            if (wp.type === 'start') color = 0x00ff00; 
            if (wp.type === 'end') color = 0xff0000; 

            const geo = new THREE.SphereGeometry(radius, 16, 16);
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const sphere = new THREE.Mesh(geo, mat);

            sphere.position.set(wp.x, wp.y / 30, wp.z);
            this.markerGroup.add(sphere);
        });
    }

    highlightSector(sectorIndex) {
        if (!this.terrainMesh || !this.animationData.flatSubSectors) return;

        const colors = this.terrainMesh.geometry.attributes.color.array;
        const vertices = this.terrainMesh.geometry.attributes.position.array;

        if (sectorIndex === -1) {
            for (let i = 0; i < colors.length; i++) colors[i] = 0.66;
            this.terrainMesh.geometry.attributes.color.needsUpdate = true;
            return;
        }

        if (sectorIndex === 0) {
            for (let i = 0; i < colors.length; i++) colors[i] = 0.66;
        }

        // Draw the specific sub-sector chunk
        const sector = this.animationData.flatSubSectors[sectorIndex];
        if (!sector) return;

        const buffer = 40; 
        const minX = Math.min(sector.start.x, sector.end.x) - buffer;
        const maxX = Math.max(sector.start.x, sector.end.x) + buffer;
        const minZ = Math.min(sector.start.z, sector.end.z) - buffer;
        const maxZ = Math.max(sector.start.z, sector.end.z) + buffer;

        let sectorMaxElev = -Infinity;
        let sectorMinElev = Infinity;

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i+1];
            const z = vertices[i+2];
            
            if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && y > -500) {
                if (y > sectorMaxElev) sectorMaxElev = y;
                if (y < sectorMinElev) sectorMinElev = y;
            }
        }

        if (sectorMaxElev === sectorMinElev) sectorMaxElev += 1;

        for (let i = 0, j = 0; i < vertices.length; i += 3, j += 3) {
            const x = vertices[i];
            const y = vertices[i+1];
            const z = vertices[i+2];

            if (x >= minX && x <= maxX && z >= minZ && z <= maxZ && y > -500) {
                const t = (y - sectorMinElev) / (sectorMaxElev - sectorMinElev);
                colors[j] = t;       
                colors[j+1] = 1 - t; 
                colors[j+2] = 0;     
            }
        }
        
        this.terrainMesh.geometry.attributes.color.needsUpdate = true;
    }

    drawPath(sectors) {
        this.animationData.active = false;
        
        while(this.pathGroup.children.length > 0) this.pathGroup.remove(this.pathGroup.children[0]); 
        while(this.labelGroup.children.length > 0) this.labelGroup.remove(this.labelGroup.children[0]); 
        
        if (this.animationData.box) {
            this.scene.remove(this.animationData.box);
            this.animationData.box = null;
        }

        this.animationData.flatSubSectors = [];
        this.animationData.pauseIndices = new Set();
        this.animationData.subSectorIndices = [];

        if (!sectors || sectors.length === 0) {
            this.highlightSector(-1); 
            return;
        }

        const mapWidth = (this.terrainData && this.terrainData.width) ? this.terrainData.width : 500;
        const labelScale = Math.max(mapWidth * 0.02, 15); // Scaled down for multiple chunks

        const keyPoints = [];
        let activeSubIdx = 0;
        
        sectors.forEach((sector, index) => {
            // Initial Takeoff Point
            if (index === 0) {
                keyPoints.push(new THREE.Vector3(sector.start.x, sector.start.y, sector.start.z));
                this.animationData.pauseIndices.add(keyPoints.length - 1);
                this.animationData.subSectorIndices.push(activeSubIdx);
            }

            // Loop through localized safety chunks
            sector.subSectors.forEach((sub, sIdx) => {
                this.animationData.flatSubSectors.push(sub);
                const safeMSA = Math.max(sub.msaAltitude || 0, sub.start.y || 0, sub.end.y || 0);

                // Vertical Climb/Descend to next localized MSA
                keyPoints.push(new THREE.Vector3(sub.start.x, safeMSA, sub.start.z));
                this.animationData.subSectorIndices.push(activeSubIdx);
                
                // Horizontal Leg for this chunk
                const horizontalLegStart = new THREE.Vector3(sub.start.x, safeMSA, sub.start.z);
                const horizontalLegEnd = new THREE.Vector3(sub.end.x, safeMSA, sub.end.z);
                keyPoints.push(horizontalLegEnd);
                this.animationData.subSectorIndices.push(activeSubIdx);

                // Visual Label for this chunk
                const midPoint = new THREE.Vector3().addVectors(horizontalLegStart, horizontalLegEnd).multiplyScalar(0.5);
                const msaText = sub.msaAltitude ? Math.round(sub.msaAltitude) : 0;
                
                const label = this.createTextSprite(`MSA: ${msaText}m`, "#ffff00");
                label.scale.set(labelScale * 2, labelScale, 1);
                label.position.set(midPoint.x, (safeMSA / 30) + (labelScale * 0.5), midPoint.z);
                label.material.depthTest = false; 
                label.renderOrder = 999; 

                this.labelGroup.add(label);
                
                activeSubIdx++;
            });
            
            // At the end of the entire Waypoint Leg, descend to the Checkpoint
            keyPoints.push(new THREE.Vector3(sector.end.x, sector.end.y, sector.end.z));
            this.animationData.pauseIndices.add(keyPoints.length - 1);
            this.animationData.subSectorIndices.push(activeSubIdx - 1); 
        });

        const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
        const geometry = new THREE.BufferGeometry().setFromPoints(keyPoints);
        const line = new THREE.Line(geometry, material);
        this.pathGroup.add(line);

        if (keyPoints.length > 1) {
            this.animationData.points = keyPoints;
            const width = Math.max(mapWidth * 0.0075, 3); 
            const boxGeo = new THREE.BoxGeometry(width, width * 0.4, width * 1.8);
            const boxMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
            
            this.animationData.box = new THREE.Mesh(boxGeo, boxMat);
            this.scene.add(this.animationData.box);
            
            this.animationData.active = true;
            this.animationData.currentPoint = 0;
            this.animationData.progress = 0;
            this.animationData.paused = true;
            this.animationData.pauseUntil = Date.now() + 250; 
            this.animationData.box.position.set(keyPoints[0].x, keyPoints[0].y / 30, keyPoints[0].z);

            this.animationData.activeSectorIndex = 0;
            this.highlightSector(0);
        }
    }

    setOpacity(value) {
        if (this.terrainMesh) this.terrainMesh.material.opacity = value;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();

        if (this.animationData.active && this.animationData.box && this.animationData.points.length > 1) {
            
            // Determine active chunk and paint dynamically
            const currentSubIdx = this.animationData.subSectorIndices[this.animationData.currentPoint];
            if (this.animationData.activeSectorIndex !== currentSubIdx) {
                this.animationData.activeSectorIndex = currentSubIdx;
                this.highlightSector(currentSubIdx);
            }

            if (this.animationData.paused) {
                if (Date.now() > this.animationData.pauseUntil) {
                    this.animationData.paused = false; 
                }
            }

            if (!this.animationData.paused) {
                const startP = this.animationData.points[this.animationData.currentPoint];
                const endP = this.animationData.points[this.animationData.currentPoint + 1];

                if (endP) {
                    const distance = startP.distanceTo(endP);
                    const isVertical = Math.abs(startP.x - endP.x) < 0.1 && Math.abs(startP.z - endP.z) < 0.1;
                    
                    const verticalSpeed = 20.0;    
                    const horizontalSpeed = 1.0; 
                    const speed = isVertical ? verticalSpeed : horizontalSpeed;

                    if (distance < 0.1) {
                        this.animationData.progress = 1;
                    } else {
                        this.animationData.progress += speed / Math.max(distance, 0.01);
                    }

                    if (this.animationData.progress >= 1) {
                        this.animationData.progress = 0;
                        this.animationData.currentPoint++;
                        
                        if (this.animationData.currentPoint >= this.animationData.points.length - 1) {
                            this.animationData.active = false; 
                            const finalPoint = this.animationData.points[this.animationData.points.length - 1];
                            this.animationData.box.position.set(finalPoint.x, finalPoint.y / 30, finalPoint.z);
                        } else if (this.animationData.pauseIndices.has(this.animationData.currentPoint)) {
                            // Smart Pauses: Only pauses at registered Checkpoints (Start, CP1, CP2, End)
                            this.animationData.paused = true;
                            this.animationData.pauseUntil = Date.now() + 250; 
                        }
                        
                    } else {
                        const currentTruePos = new THREE.Vector3().lerpVectors(startP, endP, this.animationData.progress);
                        this.animationData.box.position.set(currentTruePos.x, currentTruePos.y / 30, currentTruePos.z);
                        
                        const dx = Math.abs(startP.x - endP.x);
                        const dz = Math.abs(startP.z - endP.z);
                        if (dx > 1 || dz > 1) {
                            const visualTarget = new THREE.Vector3(endP.x, endP.y / 30, endP.z);
                            this.animationData.box.lookAt(visualTarget);
                        }
                    }
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}