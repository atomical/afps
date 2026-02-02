export class FakeVector3 {
  x = 0;
  y = 0;
  z = 0;

  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class FakeEuler {
  x = 0;
  y = 0;
  z = 0;
}

export class FakeVector2 {
  x = 0;
  y = 0;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export class FakeObject3D {
  position = new FakeVector3();
  rotation = new FakeEuler();
}

export class FakeColor {
  value: number;

  constructor(hex: number) {
    this.value = hex;
  }
}

export class FakeScene extends FakeObject3D {
  children: FakeObject3D[] = [];
  background?: FakeColor | null;

  add(child: FakeObject3D) {
    this.children.push(child);
  }

  remove(child: FakeObject3D) {
    this.children = this.children.filter((entry) => entry !== child);
  }
}

export class FakeCamera extends FakeObject3D {
  aspect: number;
  fov: number;
  near: number;
  far: number;
  updateProjectionMatrixCalls = 0;

  constructor(fov: number, aspect: number, near: number, far: number) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }

  updateProjectionMatrix() {
    this.updateProjectionMatrixCalls += 1;
  }
}

export class FakeRenderer {
  size = { width: 0, height: 0 };
  pixelRatio = 1;
  renderCalls = 0;
  disposeCalls = 0;
  canvas?: HTMLCanvasElement;
  antialias = false;
  outputColorSpace?: unknown;
  toneMapping?: unknown;

  constructor(options: { canvas: HTMLCanvasElement; antialias: boolean }) {
    this.canvas = options.canvas;
    this.antialias = options.antialias;
  }

  setSize(width: number, height: number) {
    this.size = { width, height };
  }

  setPixelRatio(ratio: number) {
    this.pixelRatio = ratio;
  }

  render() {
    this.renderCalls += 1;
  }

  dispose() {
    this.disposeCalls += 1;
  }
}

export class FakeGeometry {
  width: number;
  height: number;
  depth: number;

  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
  }
}

export class FakeMaterial {
  color: number;
  gradientMap?: FakeDataTexture;

  constructor(params: { color: number; gradientMap?: FakeDataTexture }) {
    this.color = params.color;
    this.gradientMap = params.gradientMap;
  }
}

export class FakeMesh extends FakeObject3D {
  geometry: FakeGeometry;
  material: FakeMaterial;

  constructor(geometry: FakeGeometry, material: FakeMaterial) {
    super();
    this.geometry = geometry;
    this.material = material;
  }
}

export class FakeLight extends FakeObject3D {
  color: number;
  intensity: number;

  constructor(color: number, intensity: number) {
    super();
    this.color = color;
    this.intensity = intensity;
  }
}

export class FakeDataTexture {
  data: Uint8Array;
  width: number;
  height: number;
  minFilter?: unknown;
  magFilter?: unknown;
  generateMipmaps?: boolean;
  needsUpdate?: boolean;

  constructor(data: Uint8Array, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

export class FakeEffectComposer {
  static instances: FakeEffectComposer[] = [];
  renderer: FakeRenderer;
  passes: unknown[] = [];
  renderCalls = 0;
  size = { width: 0, height: 0 };

  constructor(renderer: FakeRenderer) {
    this.renderer = renderer;
    FakeEffectComposer.instances.push(this);
  }

  addPass(pass: unknown) {
    this.passes.push(pass);
  }

  render() {
    this.renderCalls += 1;
    this.renderer.render();
  }

  setSize(width: number, height: number) {
    this.size = { width, height };
  }
}

export class FakeRenderPass {
  scene: FakeScene;
  camera: FakeCamera;

  constructor(scene: FakeScene, camera: FakeCamera) {
    this.scene = scene;
    this.camera = camera;
  }
}

export class FakeOutlinePass {
  resolution: FakeVector2;
  scene: FakeScene;
  camera: FakeCamera;
  selectedObjects: FakeObject3D[] = [];
  edgeStrength?: number;
  edgeThickness?: number;
  edgeGlow?: number;
  pulsePeriod?: number;
  downSampleRatio?: number;
  visibleEdgeColor?: FakeColor;
  hiddenEdgeColor?: FakeColor;
  size = { width: 0, height: 0 };

  constructor(resolution: FakeVector2, scene: FakeScene, camera: FakeCamera) {
    this.resolution = resolution;
    this.scene = scene;
    this.camera = camera;
  }

  setSize(width: number, height: number) {
    this.size = { width, height };
  }
}

export const createFakeThree = () => ({
  Scene: FakeScene,
  PerspectiveCamera: FakeCamera,
  WebGLRenderer: FakeRenderer,
  BoxGeometry: FakeGeometry,
  MeshStandardMaterial: FakeMaterial,
  MeshToonMaterial: FakeMaterial,
  Mesh: FakeMesh,
  Color: FakeColor,
  DirectionalLight: FakeLight,
  AmbientLight: FakeLight,
  DataTexture: FakeDataTexture,
  NearestFilter: 'NearestFilter',
  SRGBColorSpace: 'SRGBColorSpace',
  NoToneMapping: 'NoToneMapping',
  Vector2: FakeVector2,
  EffectComposer: FakeEffectComposer,
  RenderPass: FakeRenderPass,
  OutlinePass: FakeOutlinePass
});
