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
        
        this.scene.add(this.pathGroup);
        this.scene.add(this.markerGroup);
        this.scene.add(this.axesGroup);
        
        this.terrainData = null; 

        this.animationData = { active: false, points: [], currentPoint: 0, progress: 0, box: null };

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
        
        let maxElevation = -Infinity;
        let minElevation = Infinity;
        
        for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
            const elevation = rasterData[i];
            const displayElev = elevation > -500 ? elevation : 0;
            vertices[j + 1] = displayElev; 
            
            if (displayElev > maxElevation) maxElevation = displayElev;
            if (displayElev < minElevation && elevation > -500) minElevation = displayElev; 
        }

        if (minElevation === Infinity) minElevation = 0;

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.5, // 50% opacity default
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
        canvas.width = 256; canvas.height = 128;
        context.font = "Bold 40px Arial";
        context.fillStyle = color;
        context.textAlign = "center";
        context.fillText(message, 128, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false }); 
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

        const radius = Math.max(this.terrainData.width * 0.003, 1);

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

    drawPath(sectors) {
        this.animationData.active = false;
        
        while(this.pathGroup.children.length > 0) { 
            this.pathGroup.remove(this.pathGroup.children[0]); 
        }
        
        if (this.animationData.box) {
            this.scene.remove(this.animationData.box);
            this.animationData.box = null;
        }

        if (sectors.length === 0) return;

        // --- 1. Define Key Points for Smooth Spline ---
        const keyPoints = [];
        
        // Push Starting Point
        keyPoints.push(new THREE.Vector3(sectors[0].start.x, sectors[0].msaAltitude, sectors[0].start.z));

        // Push Checkpoints (Altitude must be the safest/highest of the two adjoining sectors)
        for (let i = 0; i < sectors.length - 1; i++) {
            const s1 = sectors[i];
            const s2 = sectors[i+1];
            const safeAltitude = Math.max(s1.msaAltitude, s2.msaAltitude);
            keyPoints.push(new THREE.Vector3(s1.end.x, safeAltitude, s1.end.z));
        }

        // Push End Point
        const last = sectors[sectors.length - 1];
        keyPoints.push(new THREE.Vector3(last.end.x, last.msaAltitude, last.end.z));

        // --- 2. Create Continuous Smooth Curvy Line ---
        const curve = new THREE.CatmullRomCurve3(keyPoints);
        const smoothPoints = curve.getPoints(100 * sectors.length); // High res for perfectly smooth curve

        const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
        const geometry = new THREE.BufferGeometry().setFromPoints(smoothPoints);
        const line = new THREE.Line(geometry, material);
        this.pathGroup.add(line);

        // --- 3. Setup Cuboid Animation Box ---
        if (smoothPoints.length > 1) {
            this.animationData.points = smoothPoints;
            
            // Create a small, rectangular cuboid (length > width > height)
            const width = Math.max(this.terrainData.width * 0.005, 3);
            const height = width * 0.4;
            const length = width * 1.8;
            
            const boxGeo = new THREE.BoxGeometry(width, height, length);
            const boxMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
            this.animationData.box = new THREE.Mesh(boxGeo, boxMat);
            
            // Add to Main Scene (not pathGroup) to prevent rotation skewing/distortion
            this.scene.add(this.animationData.box);
            
            this.animationData.active = true;
            this.animationData.currentPoint = 0;
            this.animationData.progress = 0;
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

        // --- Flight Path Animation Logic ---
        if (this.animationData.active && this.animationData.box && this.animationData.points.length > 1) {
            const startP = this.animationData.points[this.animationData.currentPoint];
            const endP = this.animationData.points[this.animationData.currentPoint + 1];

            if (endP) {
                const distance = startP.distanceTo(endP);
                const speed = Math.max(this.terrainData.width * 0.001, 1); // Constant visual speed

                this.animationData.progress += speed / Math.max(distance, 0.01);

                if (this.animationData.progress >= 1) {
                    this.animationData.progress = 0;
                    this.animationData.currentPoint++;
                    
                    if (this.animationData.currentPoint >= this.animationData.points.length - 1) {
                        this.animationData.currentPoint = 0; // Loop flight path
                    }
                } else {
                    // Get position along curve
                    const currentTruePos = new THREE.Vector3().lerpVectors(startP, endP, this.animationData.progress);
                    
                    // Manually apply the visual height squishing
                    this.animationData.box.position.set(currentTruePos.x, currentTruePos.y / 30, currentTruePos.z);
                    
                    // Make cuboid point/look forward slightly ahead of itself on the curve
                    const lookAheadIndex = Math.min(this.animationData.currentPoint + 3, this.animationData.points.length - 1);
                    const targetTrue = this.animationData.points[lookAheadIndex];
                    
                    const visualTarget = new THREE.Vector3(targetTrue.x, targetTrue.y / 30, targetTrue.z);
                    this.animationData.box.lookAt(visualTarget);
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }
}