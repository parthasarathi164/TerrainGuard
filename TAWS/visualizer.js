import { CONFIG, DATA } from './ui_controller.js';

let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let draggingMarker = null; // Will track if we are holding 'start' or 'end'
let scene, camera, renderer, controls;
let terrainMesh, pathLine, straightLine, startMarker, endMarker, drone, ceilingMesh;
let axisLabelsGroup, cubeScene, cubeCamera, cubeMesh;
let targetCameraPos = null;
let animationPath = [];
let animIndex = 0;
const mainRaycaster = new THREE.Raycaster();
const cubeRaycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

export const TerrainVisualizer = {
    init() {
        const container = document.getElementById('canvas-container');
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a24);

        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 80, 100);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.autoClear = false;
        renderer.setSize(window.innerWidth, window.innerHeight);
        container.appendChild(renderer.domElement);

        renderer.domElement.addEventListener('pointerdown', TerrainVisualizer.onPointerDown.bind(TerrainVisualizer));
        renderer.domElement.addEventListener('pointermove', TerrainVisualizer.onPointerMove.bind(TerrainVisualizer));
        window.addEventListener('pointerup', TerrainVisualizer.onPointerUp.bind(TerrainVisualizer));

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 150, 50);
        scene.add(dirLight);

        const gridHelper = new THREE.GridHelper(CONFIG.PLANE_SIZE, 32, 0x444444, 0x222222);
        gridHelper.position.y = -5;
        scene.add(gridHelper);

        const axesHelper = new THREE.AxesHelper(CONFIG.PLANE_SIZE / 2 + 10);
        axesHelper.position.set(-CONFIG.PLANE_SIZE / 2, -5, -CONFIG.PLANE_SIZE / 2);
        scene.add(axesHelper);

        axisLabelsGroup = new THREE.Group();
        scene.add(axisLabelsGroup);

        this.setupViewCube();
        this.setupRaycasting();
        this.animate();
    },

    setupViewCube() {
        cubeScene = new THREE.Scene();
        cubeCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
        const faceTex = (txt, bg) => {
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0,0,128,128);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, 64, 64); return new THREE.CanvasTexture(canvas);
        };
        const mats = [
            new THREE.MeshBasicMaterial({map: faceTex('RIGHT', '#9e2a2b')}), new THREE.MeshBasicMaterial({map: faceTex('LEFT', '#9e2a2b')}),
            new THREE.MeshBasicMaterial({map: faceTex('TOP', '#3a5a40')}), new THREE.MeshBasicMaterial({map: faceTex('BTM', '#3a5a40')}),
            new THREE.MeshBasicMaterial({map: faceTex('FRONT', '#1d3557')}), new THREE.MeshBasicMaterial({map: faceTex('BACK', '#1d3557')})
        ];
        cubeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
        cubeScene.add(cubeMesh);
    },

    setupRaycasting() {
        window.addEventListener('mousemove', (e) => {
            if (!terrainMesh) return;
            mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
            mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
            mainRaycaster.setFromCamera(mouseVector, camera);
            const inters = mainRaycaster.intersectObject(terrainMesh);
            const sb = document.getElementById('status-bar');
            if (inters.length > 0) {
                const pt = inters[0].point;
                const gx = Math.round(((pt.x + CONFIG.PLANE_SIZE/2) / CONFIG.PLANE_SIZE) * (CONFIG.GRID_RES - 1));
                const gz = Math.round(((pt.z + CONFIG.PLANE_SIZE/2) / CONFIG.PLANE_SIZE) * (CONFIG.GRID_RES - 1));
                const el = ((pt.y + 5) / 20) * (DATA.maxEl - DATA.minEl) + DATA.minEl;
                if(gx >= 0 && gx < CONFIG.GRID_RES && gz >= 0 && gz < CONFIG.GRID_RES) {
                    sb.innerHTML = `Hover: X: ${gx} | Z: ${gz} | Elev: ${Math.round(el)}m`;
                }
            } else { sb.innerHTML = `Hover: --`; }
        });

        window.addEventListener('click', (e) => {
            const cx = window.innerWidth - 130, cy = window.innerHeight - 170;
            if (e.clientX >= cx && e.clientX <= cx + 110 && e.clientY >= cy && e.clientY <= cy + 110) {
                const lx = ((e.clientX - cx) / 110) * 2 - 1, ly = -((e.clientY - cy) / 110) * 2 + 1;
                cubeRaycaster.setFromCamera(new THREE.Vector2(lx, ly), cubeCamera);
                const inters = cubeRaycaster.intersectObject(cubeMesh);
                if (inters.length > 0) {
                    const dist = camera.position.distanceTo(controls.target), offset = new THREE.Vector3();
                    switch(inters[0].face.materialIndex) {
                        case 0: offset.set(dist, 0, 0); break;      case 1: offset.set(-dist, 0, 0); break;
                        case 2: offset.set(0.01, dist, 0); break;   case 3: offset.set(0.01, -dist, 0); break;
                        case 4: offset.set(0, 0, dist); break;      case 5: offset.set(0, 0, -dist); break;
                    }
                    targetCameraPos = controls.target.clone().add(offset);
                }
            }
        });
    },

    createLabelSprite(text, color = '#ffffff', fontSize = '24px') {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d'); ctx.font = 'Bold ' + fontSize + ' Arial';
        ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
        sprite.scale.set(8, 2, 1); return sprite;
    },

    drawAxisNumbers() {
        while(axisLabelsGroup.children.length > 0) axisLabelsGroup.remove(axisLabelsGroup.children[0]);
        const minPos = -CONFIG.PLANE_SIZE / 2;
        const stepVal = 5;

        for (let x = 0; x <= CONFIG.GRID_RES; x += stepVal) {
            const sprite = this.createLabelSprite(Math.min(x, CONFIG.GRID_RES - 1).toString(), '#ff4444');
            sprite.position.set(minPos + (x / CONFIG.GRID_RES) * CONFIG.PLANE_SIZE, -6.5, minPos - 3);
            axisLabelsGroup.add(sprite);
        }
        for (let z = 0; z <= CONFIG.GRID_RES; z += stepVal) {
            const sprite = this.createLabelSprite(Math.min(z, CONFIG.GRID_RES - 1).toString(), '#4444ff');
            sprite.position.set(minPos - 3, -6.5, minPos + (z / CONFIG.GRID_RES) * CONFIG.PLANE_SIZE);
            axisLabelsGroup.add(sprite);
        }
        for (let i = 0; i <= 8; i++) {
            const realMeters = DATA.minEl + ((i / 8) * (DATA.maxEl - DATA.minEl));
            const sprite = this.createLabelSprite(Math.round(realMeters) + 'm', '#00ff00');
            sprite.position.set(minPos - 5, -5 + ((i / 8) * 20), minPos - 5);
            axisLabelsGroup.add(sprite);
        }
    },

    renderTerrain() {
        if(terrainMesh) scene.remove(terrainMesh);
        const geo = new THREE.PlaneGeometry(CONFIG.PLANE_SIZE, CONFIG.PLANE_SIZE, CONFIG.GRID_RES - 1, CONFIG.GRID_RES - 1);
        geo.rotateX(-Math.PI / 2);
        const verts = geo.attributes.position.array, colors = [];
        const theme = document.getElementById('theme-select').value;

        for (let i = 0; i < DATA.terrainHeights.length; i++) {
            verts[i * 3 + 1] = ((DATA.terrainHeights[i] - DATA.minEl) / (DATA.maxEl - DATA.minEl)) * 20;
            let c = new THREE.Color(), r = DATA.tciScores[i];
            if (theme === "traffic-light") {
                if (r > 80) c.setHex(0x990000); else if (r > 50) c.setHex(0xff0000); else if (r > 15) c.setHex(0xffff00); else c.setHex(0x00ff00);
            } else if (theme === "magma") {
                c.setRGB(0.1 + (r/100)*0.8, 0.05, 0.2);
            } else if (theme === "grayscale") {
                let b = 0.1 + (r / 100) * 0.9; c.setRGB(b, b, b);
            } else { c.setRGB(r/100, 0, 1 - r/100); }
            colors.push(c.r, c.g, c.b);
        }
        geo.computeVertexNormals();
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: parseFloat(document.getElementById('terrain-opacity').value) }));
        terrainMesh.position.y = -5; scene.add(terrainMesh);
    },

    gridToWorld(gx, gz) {
        const idx = gz * CONFIG.GRID_RES + gx;
        const wy = ((DATA.terrainHeights[idx] - DATA.minEl) / (DATA.maxEl - DATA.minEl)) * 20 - 5;
        
        // REDUCED: Changed visual offset from + 1.5 to + 0.5 for a tighter, realistic flight hover
        return new THREE.Vector3((gx / (CONFIG.GRID_RES - 1)) * CONFIG.PLANE_SIZE - (CONFIG.PLANE_SIZE / 2), wy + 1.0, (gz / (CONFIG.GRID_RES - 1)) * CONFIG.PLANE_SIZE - (CONFIG.PLANE_SIZE / 2));
    },

    updateLiveMarkers(sx, sz, ex, ez) {
        // If the user changes coordinates, delete the old calculated paths
        if (pathLine) { scene.remove(pathLine); pathLine = null; }
        if (straightLine) { scene.remove(straightLine); straightLine = null; }
        if (drone) { scene.remove(drone); drone = null; }

        // Convert grid coordinates to actual 3D world space
        const startPos = this.gridToWorld(sx, sz);
        const endPos = this.gridToWorld(ex, ez);

        // Update or Create Start Marker (Green)
        if (!startMarker) {
            startMarker = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
            scene.add(startMarker);
        }
        startMarker.position.copy(startPos);

        // Update or Create End Marker (Red)
        if (!endMarker) {
            endMarker = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
            scene.add(endMarker);
        }
        endMarker.position.copy(endPos);
    },
    
    onPointerDown(event) {
        // Prevent crashing if markers haven't spawned yet
        if (!startMarker || !endMarker) return; 

        // Calculate mouse position in normalized device coordinates (-1 to +1)
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Check if the user clicked exactly on the Start or End sphere
        const intersects = raycaster.intersectObjects([startMarker, endMarker]);
        if (intersects.length > 0) {
            controls.enabled = false; // Lock OrbitControls so the camera stops rotating while dragging
            draggingMarker = (intersects[0].object === startMarker) ? 'start' : 'end';
        }
    },

    onPointerMove(event) {
        if (!draggingMarker || !terrainMesh) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Raycast against the terrain surface so the marker "sticks" to the mountains
        const intersects = raycaster.intersectObject(terrainMesh);
        if (intersects.length > 0) {
            const point = intersects[0].point;

            // Reverse Math: Convert 3D World Coordinates back to 2D Grid Coordinates (0-127)
            const gridRatio = CONFIG.PLANE_SIZE / CONFIG.GRID_RES;
            let gx = Math.round((point.x / gridRatio) + (CONFIG.GRID_RES / 2));
            let gz = Math.round((point.z / gridRatio) + (CONFIG.GRID_RES / 2));

            // Constrain the points so they cannot be dragged off the edge of the map
            gx = Math.max(0, Math.min(CONFIG.GRID_RES - 1, gx));
            gz = Math.max(0, Math.min(CONFIG.GRID_RES - 1, gz));

            // Update UI Input Boxes
            if (draggingMarker === 'start') {
                document.getElementById('start-x').value = gx;
                document.getElementById('start-z').value = gz;
                // Dispatch a fake "input" event to trigger your existing syncLiveMarkers logic!
                document.getElementById('start-x').dispatchEvent(new Event('input'));
            } else {
                document.getElementById('end-x').value = gx;
                document.getElementById('end-z').value = gz;
                // Dispatch a fake "input" event
                document.getElementById('end-x').dispatchEvent(new Event('input'));
            }
        }
    },

    onPointerUp(event) {
        if (draggingMarker) {
            draggingMarker = null; // Let go of the marker
            controls.enabled = true; // Turn camera rotation back on
        }
    },

    updateMaxHeightCeiling(maxH) {
        // Remove the old ceiling if it exists
        if (ceilingMesh) { scene.remove(ceilingMesh); ceilingMesh = null; }

        // Don't draw if data isn't loaded or input is empty
        if (DATA.maxEl === 0 || isNaN(maxH)) return;

        // Convert the real-world Max Height (meters) into Three.js 3D world coordinates
        const cy = ((maxH - DATA.minEl) / (DATA.maxEl - DATA.minEl)) * 20 - 5;

        // Create a flat plane scaled to our world size
        const geo = new THREE.PlaneGeometry(CONFIG.PLANE_SIZE, CONFIG.PLANE_SIZE);
        geo.rotateX(-Math.PI / 2); // Lay it flat

        // Make it a highly transparent blue glass material
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff5500,      // Bright cyan/blue
            transparent: true,
            opacity: 0.25,        // Low opacity so we can see the path underneath
            side: THREE.DoubleSide,
            depthWrite: false     // Prevents flickering (z-fighting) when viewing through transparent layers
        });

        ceilingMesh = new THREE.Mesh(geo, mat);
        ceilingMesh.position.y = cy;
        scene.add(ceilingMesh);
    },

    drawStraightLine(sx, sz, ex, ez) {
        if (straightLine) scene.remove(straightLine);
        const geo = new THREE.BufferGeometry().setFromPoints([this.gridToWorld(sx, sz), this.gridToWorld(ex, ez)]);
        straightLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xaaaaaa, dashSize: 1, gapSize: 1 }));
        straightLine.computeLineDistances(); scene.add(straightLine);
    },

    drawPath(pathArray) {
        if (pathLine) scene.remove(pathLine); if (startMarker) scene.remove(startMarker); if (endMarker) scene.remove(endMarker);
        animationPath = []; const points = [];
        pathArray.forEach(str => {
            const p = str.split(','); const vec = this.gridToWorld(parseInt(p[0]), parseInt(p[1]));
            points.push(vec); animationPath.push(vec);
        });
        pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x00d2ff, linewidth: 3 }));
        scene.add(pathLine);
        startMarker = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0x00ff00 })); startMarker.position.copy(points[0]); scene.add(startMarker);
        endMarker = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({ color: 0xff0000 })); endMarker.position.copy(points[points.length - 1]); scene.add(endMarker);
    },

    spawnDrone() { if (drone) scene.remove(drone); drone = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x005555 })); scene.add(drone); animIndex = 0; },
    updateOpacity(val) { if (terrainMesh) { terrainMesh.material.opacity = val; terrainMesh.material.needsUpdate = true; } },

    animate() {
        requestAnimationFrame(() => this.animate());
        if (targetCameraPos) { camera.position.lerp(targetCameraPos, 0.08); if (camera.position.distanceTo(targetCameraPos) < 0.1) targetCameraPos = null; }
        if (drone && animationPath.length > 0 && animIndex < animationPath.length - 1) {
            const cPos = animationPath[Math.floor(animIndex)], nPos = animationPath[Math.floor(animIndex) + 1];
            drone.position.lerpVectors(cPos, nPos, animIndex % 1); drone.lookAt(nPos); animIndex += 0.05;
        }
        if(axisLabelsGroup) axisLabelsGroup.children.forEach(l => l.quaternion.copy(camera.quaternion));
        controls.update();
        renderer.clear();
        renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        renderer.setScissorTest(false);
        renderer.render(scene, camera);

        cubeCamera.position.copy(camera.position).sub(controls.target).setLength(2.5); cubeCamera.lookAt(cubeScene.position);
        renderer.setViewport(window.innerWidth - 130, 60, 110, 110);
        renderer.setScissor(window.innerWidth - 130, 60, 110, 110);
        renderer.setScissorTest(true); renderer.clearDepth();
        renderer.render(cubeScene, cubeCamera);
    }
};