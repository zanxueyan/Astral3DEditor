import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer";
import {TransformControls} from "three/examples/jsm/controls/TransformControls";
import {SetPositionCommand} from "@/core/commands/SetPositionCommand";
import {SetRotationCommand} from "@/core/commands/SetRotationCommand";
import {SetScaleCommand} from "@/core/commands/SetScaleCommand";
import {useDispatchSignal} from "@/hooks/useSignal";
import {GRID_COLORS_DARK, GRID_COLORS_LIGHT} from "@/utils/common/constant";
import {getMousePosition} from "@/utils/common/scenes";
import {ViewportEffect} from "@/core/Viewport.Effect";
import ViewCube from "@/core/Viewport.Cube";
import {XR} from '@/core/Viewport.XR';
import {ViewportSignals} from "@/core/Viewport.Signals";
import {ShaderMaterialManager} from "@/core/shaderMaterial/ShaderMaterialManager";
import {Package} from "@/core/loader/Package";

CameraControls.install({
    THREE: {
        Vector2: THREE.Vector2,
        Vector3: THREE.Vector3,
        Vector4: THREE.Vector4,
        Quaternion: THREE.Quaternion,
        Matrix4: THREE.Matrix4,
        Spherical: THREE.Spherical,
        Box3: THREE.Box3,
        Sphere: THREE.Sphere,
        Raycaster: THREE.Raycaster,
    }
});

const onDownPosition = new THREE.Vector2();
const onUpPosition = new THREE.Vector2();
const onDoubleClickPosition = new THREE.Vector2();

let mouseUpFn;

// animations
let prevActionsInUse = 0;
const clock = new THREE.Clock();

// 计算帧时
let startTime = 0;
let endTime = 0;

export class Viewport {
    container: HTMLDivElement;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    private sceneHelpers: THREE.Scene;
    renderer: THREE.WebGLRenderer | undefined; 
    css3DRenderer: CSS3DRenderer = new CSS3DRenderer();
    private pmremGenerator: THREE.PMREMGenerator | null = null;

    private showSceneHelpers: boolean = true;
    private grid: THREE.Group;
    private box = new THREE.Box3();
    private selectionBox: THREE.Box3Helper;
    private raycaster: THREE.Raycaster;

    private modules: {
        xr: XR,
        controls: CameraControls,
        transformControls: TransformControls,
        effect:ViewportEffect,
        viewCube: ViewCube,
        package: Package,
        registerSignal: ViewportSignals,
        shaderMaterialManager: ShaderMaterialManager
    };

    /**
     * 整个主场景的box3
     */
    sceneBox3 = new THREE.Box3();

    constructor(container: HTMLDivElement) {
        this.container = container;

        this.scene = window.editor.scene;
        this.camera = window.editor.camera;
        this.sceneHelpers = window.editor.sceneHelpers;

        /** helpers **/
        this.grid = new THREE.Group();
        this.grid.ignore = true;
        this.initGrid();
        this.scene.add(this.grid);

        //选中时的包围框
        this.selectionBox = new THREE.Box3Helper(this.box);
        (this.selectionBox.material as THREE.Material).depthTest = false;
        (this.selectionBox.material as THREE.Material).transparent = true;
        this.selectionBox.visible = false;
        // @ts-ignore
        this.sceneHelpers.add(this.selectionBox);

        // 拾取对象
        this.raycaster = new THREE.Raycaster();
        //Raycaster 将只从它遇到的第一个对象中获取信息
        //this.raycaster.firstHitOnly = true;

        this.modules = this.initModules();

        this.container.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.container.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.container.addEventListener('dblclick', this.onDoubleClick.bind(this));
    }

    protected initRenderer(newRenderer: THREE.WebGLRenderer) {
        if (this.renderer) {
            this.renderer.setAnimationLoop(null);
            this.renderer.dispose();
            this.pmremGenerator?.dispose();
            this.pmremGenerator = null;

            this.modules.controls.disconnect();
            this.container.removeChild(this.renderer.domElement);
        }

        this.renderer = newRenderer;

        this.renderer.setAnimationLoop(this.animate.bind(this));

        if (window.matchMedia) {
            const grid1 = this.grid.children[0];
            const grid2 = this.grid.children[1];

            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (event) => {
                this.renderer?.setClearColor(event.matches ? 0x333333 : 0xaaaaaa);
                updateGridColors(grid1, grid2, event.matches ? GRID_COLORS_DARK : GRID_COLORS_LIGHT);
                this.render();
            });

            this.renderer.setClearColor(mediaQuery.matches ? 0x333333 : 0xAAAAAA);
            updateGridColors(grid1, grid2, mediaQuery.matches ? GRID_COLORS_DARK : GRID_COLORS_LIGHT);
        }

        this.renderer.setPixelRatio(Math.max(Math.ceil(window.devicePixelRatio), 1));
        this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);

        if(this.scene.environment && this.scene.environment.isRenderTargetTexture){
            useDispatchSignal("sceneEnvironmentChanged",'ModelViewer');
        }

        // 在container中最前面插入渲染器的dom元素
        this.container.insertBefore(this.renderer.domElement, this.container.firstChild);

        // 控制器绑定
        this.modules.controls.connect(this.renderer.domElement);

        this.loadDefaultEnvAndBackground();

        // 初始化后处理
        if(this.modules.effect.enabled){
            this.modules.effect.createComposer();
        }

        // 防止重复添加
        if (this.css3DRenderer.domElement.parentNode !== this.container) {
            this.css3DRenderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
            this.css3DRenderer.domElement.setAttribute("id", "astral-3d-css3DRenderer");
            this.css3DRenderer.domElement.style.position = 'absolute';
            this.css3DRenderer.domElement.style.top = '0px';
            this.css3DRenderer.domElement.style.pointerEvents = 'none';

            this.container.appendChild(this.css3DRenderer.domElement);
        }

        this.render();
    }

    protected initGrid() {
        const grid1 = new THREE.GridHelper(1000, 1000);
        // @ts-ignore
        grid1.material.color.setHex(0x999999);
        (grid1.material as THREE.Material).vertexColors = false;
        this.grid.add(grid1);

        const grid2 = new THREE.GridHelper(1000, 2);
        // @ts-ignore
        grid2.material.color.setHex(0x777777);
        (grid2.material as THREE.Material).vertexColors = false;
        this.grid.add(grid2);
    }

    protected initModules() {
        const controls = new CameraControls(this.camera);
        controls.addEventListener("update", () => {
            useDispatchSignal("cameraChanged", this.camera);
        });

        let objectPositionOnDown = new THREE.Vector3();
        let objectRotationOnDown = new THREE.Euler();
        let objectScaleOnDown = new THREE.Vector3();
        const transformControls = new TransformControls(this.camera, this.container);
        transformControls.addEventListener("change", () => {
            const object = transformControls.object;

            if (object !== undefined) {
                this.box.setFromObject(object, true);

                useDispatchSignal("objectChanged", object);
            }

            this.render();
        })
        transformControls.addEventListener("mouseDown", () => {
            const object = transformControls.object as THREE.Object3D;

            objectPositionOnDown = object.position.clone();
            objectRotationOnDown = object.rotation.clone();
            objectScaleOnDown = object.scale.clone();

            this.modules.controls.enabled = false;
        })
        transformControls.addEventListener("mouseUp", () => {
            const object = transformControls.object as THREE.Object3D;

            if (object !== undefined) {
                switch (transformControls.getMode()) {
                    case 'translate':
                        if (!objectPositionOnDown.equals(object.position)) {
                            window.editor.execute(new SetPositionCommand(object, object.position, objectPositionOnDown));
                        }
                        break;
                    case 'rotate':
                        if (!objectRotationOnDown.equals(object.rotation)) {
                            window.editor.execute(new SetRotationCommand(object, object.rotation, objectRotationOnDown));
                        }
                        break;
                    case 'scale':
                        if (!objectScaleOnDown.equals(object.scale)) {
                            window.editor.execute(new SetScaleCommand(object, object.scale, objectScaleOnDown));
                        }
                        break;
                }
            }
            this.modules.controls.enabled = true;
        })
        const gizmo = transformControls.getHelper();
        this.sceneHelpers.add(gizmo);

        return {
            xr: new XR(transformControls),
            controls,
            transformControls,
            effect:new ViewportEffect(this),
            viewCube: new ViewCube(this.camera, this.container, controls),
            package: new Package(),
            // 注册signal
            registerSignal: new ViewportSignals(this),
            shaderMaterialManager: new ShaderMaterialManager()
        }
    }

    /**
     * 计算整个场景的Box3
     */
    computedSceneBox3() {
        this.sceneBox3.setFromObject(this.scene);
    }

    updateAspectRatio() {
        for (const uuid in window.editor.cameras) {
            const camera = window.editor.cameras[uuid];

            const aspect = this.container.offsetWidth / this.container.offsetHeight;

            if (camera.isPerspectiveCamera) {
                camera.aspect = aspect;
            }

            camera.updateProjectionMatrix();

            const cameraHelper = window.editor.helpers[camera.id];
            if (cameraHelper) cameraHelper.update();
        }
    }

    /**
     * 加载环境和背景
     */
    loadDefaultEnvAndBackground() {
        window.editor.resource.loadURLTexture(`/static/resource/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr`, (texture: THREE.Texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.environment = texture;
            this.scene.background = texture;

            useDispatchSignal("sceneGraphChanged");
        })
    }

    getIntersects(point: THREE.Vector2) {
        const mouse = new THREE.Vector2();
        mouse.set((point.x * 2) - 1, -(point.y * 2) + 1);
        this.raycaster.setFromCamera(mouse, this.camera);

        const objects: THREE.Object3D[] = [];
        this.scene.traverseByCondition(function (child) {
            objects.push(child);
        }, (child) => !child.ignore && child.visible);

        this.sceneHelpers.traverseVisible(function (child) {
            if (child.name === 'picker') objects.push(child);
        });

        return this.raycaster.intersectObjects(objects, false);
    }

    handleClick() {
        if (onDownPosition.distanceTo(onUpPosition) === 0) {
            const intersects = this.getIntersects(onUpPosition);
            useDispatchSignal("intersectionsDetected", intersects);
            this.render();
        }
    }

    onMouseDown(event: MouseEvent) {
        event.preventDefault();
        const array = getMousePosition(this.container, event.clientX, event.clientY);
        onDownPosition.fromArray(array);
        mouseUpFn = this.onMouseUp.bind(this);
        document.addEventListener('mouseup', mouseUpFn);
    }

    onMouseUp(event: MouseEvent) {
        const array = getMousePosition(this.container, event.clientX, event.clientY);
        onUpPosition.fromArray(array);
        this.handleClick();
        document.removeEventListener('mouseup', mouseUpFn);
        mouseUpFn = undefined;
    }

    onTouchStart(event: TouchEvent) {
        const touch = event.changedTouches[0];
        const array = getMousePosition(this.container, touch.clientX, touch.clientY);
        onDownPosition.fromArray(array);
        mouseUpFn = this.onTouchEnd.bind(this);
        document.addEventListener('touchend', mouseUpFn);
    }

    onTouchEnd(event: TouchEvent) {
        const touch = event.changedTouches[0];
        const array = getMousePosition(this.container, touch.clientX, touch.clientY);
        onUpPosition.fromArray(array);
        this.handleClick();
        document.removeEventListener('touchend', mouseUpFn);
        mouseUpFn = undefined;
    }

    onDoubleClick(event: MouseEvent) {
        const array = getMousePosition(this.container, event.clientX, event.clientY);
        onDoubleClickPosition.fromArray(array);
        const intersects = this.getIntersects(onDoubleClickPosition);
        if (intersects.length > 0) {
            const intersect = intersects[0];
            useDispatchSignal("objectFocused", intersect.object);
        }
    }

    animate() {
        const mixer = window.editor.mixer;
        const delta = clock.getDelta();

        let needsUpdate = this.modules.controls.update(delta);

        // Animations
        const actions = mixer.stats.actions;
        if (actions.inUse > 0 || prevActionsInUse > 0) {
            prevActionsInUse = actions.inUse;

            mixer.update(delta);
            needsUpdate = true;

            if (window.editor.selected !== null) {
                // 避免某些蒙皮网格的帧延迟效应(e.g. Michelle.glb)
                window.editor.selected.updateWorldMatrix(false, true);
                //  选择框应反映当前动画状态
                this.selectionBox.box.setFromObject(window.editor.selected, true);
            }
        }

        this.modules.viewCube.update();
        this.modules.shaderMaterialManager.update();
        if (this.modules.shaderMaterialManager.needRender) {
            needsUpdate = true;
        }

        if (this.renderer?.xr.isPresenting) {
            needsUpdate = true;
        }

        if (needsUpdate) this.render();
    }

    render() {
        if (!this.renderer) return;

        startTime = performance.now();
        const deltaTime = endTime - startTime;

        this.renderer.clearDepth();

        if(this.modules.effect.enabled){
            this.modules.effect.render(deltaTime);
        }else{
            this.renderer.render(this.scene, window.editor.viewportCamera);
        }

        // 非默认相机不渲染辅助
        if (this.camera === window.editor.viewportCamera) {
            if (this.showSceneHelpers) this.renderer.render(this.sceneHelpers, this.camera);
        }

        this.css3DRenderer.render(this.scene, window.editor.viewportCamera);

        endTime = performance.now();
        useDispatchSignal("sceneRendered", endTime - startTime);
    }
}

function updateGridColors(grid1, grid2, colors) {
    grid1.material.color.setHex(colors[0]);
    grid2.material.color.setHex(colors[1]);
}