/**
 * @author MaHaiBing
 * @email  mlt131220@163.com
 * @date   2024/8/4 20:55
 * @description 预览
 */
import * as THREE from "three";
import CameraControls from 'camera-controls';
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer";
import { CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer";
// import WebGPURenderer from "three/examples/jsm/renderers/webgpu/WebGPURenderer";
import { XRButton } from "three/examples/jsm/webxr/XRButton";
import { useDispatchSignal } from "@/hooks/useSignal";
import { XR } from "@/core/Viewport.XR";
import ViewCube from "@/core/Viewport.Cube";
import { Package } from "@/core/loader/Package";
import { ShaderMaterialManager } from "@/core/shaderMaterial/ShaderMaterialManager";
import Helper from "@/core/script/Helper";
import { ViewportSignals } from "@/core/preview/Viewport.Signals";
import { ViewportOperation } from "@/core/preview/Viewport.Operation";
import { getMousePosition } from "@/utils/common/scenes";
import { ClippedEdgesBox } from "@/core/utils/ClippedEdgesBox";
import EsDragControls from "@/core/controls/EsDragControls";
import Measure, { MeasureMode } from "@/core/utils/Measure";
import { MiniMap } from "@/core/utils/MiniMap";
import Roaming from "@/core/utils/Roaming";
import { useProjectConfigStoreWithOut } from "@/store/modules/projectConfig";
import { ViewportEffect } from "@/core/Viewport.Effect";
import { usePreviewOperationStoreWithOut } from "@/store/modules/previewOperation";

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

const operationStore = usePreviewOperationStoreWithOut();

const onDownPosition = new THREE.Vector2();
const onUpPosition = new THREE.Vector2();

let onKeyDownFn, onKeyUpFn, onPointerDownFn, onPointerUpFn, onPointerMoveFn, animateFn;
let events = {
    init: [],
    start: [],
    stop: [],
    beforeUpdate: [],
    update: [],
    afterUpdate: [],
    beforeDestroy: [],
    destroy: [],
    onKeydown: [],
    onKeyup: [],
    onPointerdown: [],
    onPointerup: [],
    onPointermove: [],
    onPick: []
};

const projectConfigStore = useProjectConfigStoreWithOut();

export class Viewport {
    private container: HTMLDivElement;
    private scene: THREE.Scene;
    private sceneHelpers: THREE.Scene;
    camera: THREE.PerspectiveCamera;

    renderer: THREE.WebGLRenderer;

    css2DRenderer: CSS2DRenderer = new CSS2DRenderer();
    css3DRenderer: CSS3DRenderer = new CSS3DRenderer();

    clock: THREE.Clock = new THREE.Clock();
    private readonly xrButton: HTMLElement;
    private box = new THREE.Box3();
    private selectionBox: THREE.Box3Helper;
    private raycaster: THREE.Raycaster;

    modules: {
        xr: XR,
        controls: CameraControls,
        dragControl: EsDragControls,
        effect: ViewportEffect,
        viewCube: ViewCube,
        package: Package,
        shaderMaterialManager: ShaderMaterialManager,
        operation: ViewportOperation,
        registerSignal: ViewportSignals,
        clippedEdges: ClippedEdgesBox,
        measure: Measure,
        miniMap: MiniMap,
        roaming: Roaming
    };

    // animations
    prevActionsInUse = 0;

    // 场景box3
    sceneBox3 = new THREE.Box3();

    constructor(container: HTMLDivElement) {
        this.container = container;
        this.scene = window.editor.scene;
        this.sceneHelpers = window.editor.sceneHelpers;
        this.camera = window.editor.camera;

        // 设置为预览模式
        window.editor.isPreview = true;

        this.renderer = this.initEngine();

        this.xrButton = XRButton.createButton(this.renderer);

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

        this.initEvent();
    }

    initEngine() {
        let renderer: THREE.WebGLRenderer;
        // if (WebGPU.isAvailable()) {
        //     console.log("使用WebGPU渲染器");
        //     renderer = new WebGPURenderer({antialias: true});
        //     renderer.toneMapping = THREE.ACESFilmicToneMapping;
        //     renderer.toneMappingExposure = 1;
        // } else {
        renderer = new THREE.WebGLRenderer({
            antialias: projectConfigStore.renderer.antialias,
            alpha: true,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
        });
        // }

        // 开启模型对象的局部剪裁平面功能. 如果不设置为true，设置剪裁平面的模型不会被剪裁
        renderer.localClippingEnabled = true;

        renderer.autoClear = false;
        renderer.setClearColor(0x272727, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = projectConfigStore.renderer.shadows; // 允许在场景中使用阴影贴图
        renderer.shadowMap.type = projectConfigStore.renderer.shadowType; // 阴影贴图类型
        renderer.toneMapping = projectConfigStore.renderer.toneMapping; // 色调映射
        renderer.toneMappingExposure = projectConfigStore.renderer.toneMappingExposure;

        renderer.setViewport(0, 0, this.container.offsetWidth, this.container.offsetHeight);
        renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
        renderer.setPixelRatio(Math.max(Math.ceil(window.devicePixelRatio), 1));
        renderer.xr.enabled = projectConfigStore.xr;
        renderer.domElement.setAttribute("id", "es-3d-preview");
        renderer.domElement.style.touchAction = "none";
        this.container.appendChild(renderer.domElement);

        // 防止重复添加
        if (this.css2DRenderer.domElement.parentNode !== this.container) {
            this.css2DRenderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
            this.css2DRenderer.domElement.setAttribute("id", "astral-3d-preview-css2DRenderer");
            this.css2DRenderer.domElement.style.position = 'absolute';
            this.css2DRenderer.domElement.style.top = '0px';
            this.css2DRenderer.domElement.style.pointerEvents = 'none';

            this.container.appendChild(this.css2DRenderer.domElement);
        }

        // 防止重复添加
        if (this.css3DRenderer.domElement.parentNode !== this.container) {
            this.css3DRenderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
            this.css3DRenderer.domElement.setAttribute("id", "astral-3d-preview-css3DRenderer");
            this.css3DRenderer.domElement.style.position = 'absolute';
            this.css3DRenderer.domElement.style.top = '0px';
            this.css3DRenderer.domElement.style.pointerEvents = 'none';

            this.container.appendChild(this.css3DRenderer.domElement);
        }

        return renderer;
    }

    protected initModules() {
        let modules: any = {};

        modules.xr = new XR(modules.transformControls);

        modules.controls = new CameraControls(this.camera as THREE.PerspectiveCamera, this.renderer.domElement);
        modules.controls.addEventListener("update", () => {
            if (!this.modules.roaming || !this.modules.roaming.isRoaming) {
                requestIdleCallback(() => {
                    this.render();
                })
            } else {
                if (!this.modules.roaming.person) return;
                // 漫游模式下,玩家跟随旋转
                this.modules.roaming.person.rotation.y = this.modules.controls.azimuthAngle + Math.PI;
            }

            useDispatchSignal("cameraChanged", this.camera);
        });

        // 后处理
        modules.effect = new ViewportEffect(this);
        // 初始化后处理
        if (modules.effect.enabled) {
            modules.effect.createComposer();
        }

        // 注册拖拽组件
        modules.dragControl = new EsDragControls(this);

        modules.viewCube = new ViewCube(this.camera, this.container, modules.controls);

        modules.package = new Package();

        modules.shaderMaterialManager = new ShaderMaterialManager();

        // 注册signal
        modules.registerSignal = new ViewportSignals(this);

        // 底部操作栏对应的操作模块
        modules.operation = new ViewportOperation(this);

        // 剖切组件
        modules.clippedEdges = new ClippedEdgesBox(this, modules.controls);

        // 测量组件
        modules.measure = new Measure(this, MeasureMode.Distance);

        // 小地图
        modules.miniMap = new MiniMap(this, {
            mapSize: 100,
            mapRenderSize: 350,
            followTarget: this.camera,
            isShow: false,
        });

        // 人物漫游
        modules.roaming = new Roaming(this, modules.controls);

        return modules;
    }

    initEvent() {
        onKeyDownFn = this.onKeyDown.bind(this);
        onKeyUpFn = this.onKeyUp.bind(this);
        onPointerDownFn = this.onPointerDown.bind(this);
        onPointerUpFn = this.onPointerUp.bind(this);
        onPointerMoveFn = this.onPointerMove.bind(this);

        animateFn = this.animation.bind(this);
        this.renderer.setAnimationLoop(animateFn);
    }

    // 20250108：方法好似多余，上面通过projectConfigStore设置了，运行三个月无误后删除
    // load(json:IConfigJson) {
    //     if(!json) return;

    //     if (json.xr !== undefined) this.renderer.xr.enabled = json.xr;
    //     if (json.renderer.shadows !== undefined) this.renderer.shadowMap.enabled = json.renderer.shadows;
    //     if (json.renderer.shadowType !== undefined) this.renderer.shadowMap.type = json.renderer.shadowType;
    //     if (json.renderer.toneMapping !== undefined) this.renderer.toneMapping = json.renderer.toneMapping;
    //     if (json.renderer.toneMappingExposure !== undefined) this.renderer.toneMappingExposure = json.renderer.toneMappingExposure;

    //     useDispatchSignal("sceneResize");
    // }

    /**
     * 场景加载完成后调用
     */
    setup() {
        this.handleScripts()

        this.dispatch(events.init, arguments);

        if (this.renderer.xr.enabled) this.container.append(this.xrButton);

        window.addEventListener('keydown', onKeyDownFn);
        window.addEventListener('keyup', onKeyUpFn);
        this.container.addEventListener('pointerdown', onPointerDownFn);
        this.container.addEventListener('pointerup', onPointerUpFn);
        this.container.addEventListener('pointermove', onPointerMoveFn);

        this.dispatch(events.start, arguments);

        // 计算场景box
        this.sceneBox3.setFromObject(this.scene);
    }

    getIntersects(point: THREE.Vector2) {
        const mouse = new THREE.Vector2();
        mouse.set((point.x * 2) - 1, -(point.y * 2) + 1);
        this.raycaster.setFromCamera(mouse, this.camera);

        const objects: THREE.Object3D[] = [];
        this.scene.traverseByCondition(function (child) {
            objects.push(child);
        }, (child) => !child.ignore && child.visible);

        return this.raycaster.intersectObjects(objects, false);
    }

    handleScripts() {
        // 注册 Helper
        const helper = new Helper(this.scene as THREE.Scene);

        events = {
            init: [],
            start: [],
            stop: [],
            beforeUpdate: [],
            update: [],
            afterUpdate: [],
            beforeDestroy: [],
            destroy: [],
            onKeydown: [],
            onKeyup: [],
            onPointerdown: [],
            onPointerup: [],
            onPointermove: [],
            onPick: []
        };

        let scriptWrapParams = 'THREE,helper,renderer,scene,camera,controls,clock';
        const scriptWrapResultObj = {};

        for (const eventKey in events) {
            scriptWrapParams += ',' + eventKey;
            scriptWrapResultObj[eventKey] = eventKey;
        }

        const scriptWrapResult = JSON.stringify(scriptWrapResultObj).replace(/"/g, '');

        for (const uuid in window.editor.scripts) {
            const object = this.scene?.getObjectByProperty('uuid', uuid);

            if (object === undefined) {
                console.warn('Preview: Script without object.', uuid);
                continue;
            }

            const scripts = window.editor.scripts[uuid];

            for (let i = 0; i < scripts.length; i++) {
                const script = scripts[i];
                const functions = (new Function(scriptWrapParams, script.source + '\nreturn ' + scriptWrapResult + ';').bind(object))(THREE, helper, this.renderer, this.scene, this.camera, this.modules.controls, this.clock);

                for (const name in functions) {
                    if (functions[name] === undefined) continue;

                    if (events[name] === undefined) {
                        console.warn('Preview: Event type not supported (', name, ')');
                        continue;
                    }

                    events[name].push(functions[name].bind(object));
                }
            }
        }
    }

    handleClick() {
        if (onDownPosition.distanceTo(onUpPosition) === 0) {
            const intersects = this.getIntersects(onUpPosition);
            useDispatchSignal("intersectionsDetected", intersects);

            this.dispatch(events.onPick, {intersects,pickPosition: onUpPosition})
            this.render();
        }
    }

    animation() {
        const delta = this.clock.getDelta();

        let needsUpdate = this.modules.controls.update(delta)

        const mixer = Helper.mixer;
        if (mixer) {
            // @ts-ignore Animations
            const actions = mixer.stats.actions;
            if (actions.inUse > 0 || this.prevActionsInUse > 0) {
                this.prevActionsInUse = actions.inUse;

                mixer.update(delta);
                needsUpdate = true;

                if (window.editor.selected !== null) {
                    // 避免某些蒙皮网格的帧延迟效应(e.g. Michelle.glb)
                    window.editor.selected.updateWorldMatrix(false, true);

                    if (!this.modules.effect.enabled){
                        //  选择框应反映当前动画状态
                        this.selectionBox.box.setFromObject(window.editor.selected, true);
                    }
                }
            }
        }

        if (operationStore.menuList.autoRotate.active) {
            this.modules.controls.azimuthAngle += operationStore.autoRotateSpeed * delta * THREE.MathUtils.DEG2RAD;
        }

        this.modules.viewCube.update();
        this.modules.miniMap.update();
        this.modules.shaderMaterialManager.update();
        if (this.modules.shaderMaterialManager.needRender) {
            needsUpdate = true;
        }
        if (this.modules.dragControl.isDragging) {
            needsUpdate = true;
        }

        if (this.renderer?.xr.isPresenting) {
            needsUpdate = true;
        }

        if (this.modules.roaming?.isRoaming) {
            needsUpdate = true;
        }

        if (needsUpdate) {
            this.dispatch(events.beforeUpdate, arguments);
            this.render(delta);
        }
    }

    render(delta?: number) {
        if (!delta) {
            delta = Math.min(this.clock.getDelta(), 0.05);
        }

        try {
            this.dispatch(events.update, { time: this.clock.elapsedTime, delta: delta });
        } catch (e: any) {
            console.error((e.message || e), (e.stack || ''));
        }

        // this.renderer.autoClear = false;

        if (this.modules.roaming?.isRoaming) {
            const roamingDelta = delta / 3;
            for (let i = 0; i < 3; i++) {
                this.modules.roaming.render(roamingDelta);
            }
        }

        this.renderer.clearDepth();

        if (this.modules.effect.enabled) {
            this.modules.effect.render(delta);
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        this.renderer.render(this.sceneHelpers, this.camera);
        // css2d 在sceneHelpers内
        this.css2DRenderer.render(this.sceneHelpers, this.camera);

        this.css3DRenderer.render(this.scene, this.camera);

        // this.renderer.autoClear = true;

        this.dispatch(events.afterUpdate, arguments);
    }

    /**
     * 重置场景,会从window.editor.reset()中调用
     */
    reset() {
        // 清空 css2DRenderer
        this.css2DRenderer.domElement.innerHTML = "";
    }

    dispose() {
        this.dispatch(events.beforeDestroy, arguments);

        this.renderer.dispose();

        this.container.removeChild(this.renderer.domElement);
        this.container.removeChild(this.css2DRenderer.domElement);

        Object.keys(this.modules).forEach(key => {
            this.modules[key].dispose && this.modules[key].dispose();
        })

        onKeyDownFn = undefined;
        onKeyUpFn = undefined;
        onPointerDownFn = undefined;
        onPointerUpFn = undefined;
        onPointerMoveFn = undefined;

        animateFn = undefined;

        this.dispatch(events.destroy, arguments);
    }

    /* 事件 */
    dispatch(array: any[], event: any) {
        for (let i = 0, l = array.length; i < l; i++) {
            array[i](event);
        }
    }

    onKeyDown(event: Event) {
        this.dispatch(events.onKeydown, event);
    }

    onKeyUp(event: Event) {
        this.dispatch(events.onKeyup, event);
    }

    onPointerDown(event: MouseEvent) {
        this.dispatch(events.onPointerdown, event);

        // 右键不触发点击事件
        if (event.button === 2) return;
        // 正在执行测量时不触发点击事件(必须写在这，不记录点位数据，写在handleClick中的话，由于PointerUp事件触发顺序不同，测量角度时会触发点击事件)
        if (!this.modules.measure.isCompleted) return;

        event.preventDefault();
        const array = getMousePosition(this.container, event.clientX, event.clientY);
        onDownPosition.fromArray(array);
    }

    onPointerUp(event: MouseEvent) {
        this.dispatch(events.onPointerup, event);

        // 右键不触发点击事件
        if (event.button === 2) return;
        // 正在执行测量时不触发点击事件
        if (!this.modules.measure.isCompleted) return;

        const array = getMousePosition(this.container, event.clientX, event.clientY);
        onUpPosition.fromArray(array);
        this.handleClick();
    }

    onPointerMove(event: MouseEvent) {
        this.dispatch(events.onPointermove, event);
    }
}