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

  constructor(params: { color: number }) {
    this.color = params.color;
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

export const createFakeThree = () => ({
  Scene: FakeScene,
  PerspectiveCamera: FakeCamera,
  WebGLRenderer: FakeRenderer,
  BoxGeometry: FakeGeometry,
  MeshStandardMaterial: FakeMaterial,
  Mesh: FakeMesh,
  Color: FakeColor,
  DirectionalLight: FakeLight,
  AmbientLight: FakeLight
});
