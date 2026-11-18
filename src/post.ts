import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform vec3 ink;
uniform float strength;
uniform vec3 tint;
uniform float grade;
varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float viewZ(float d) {
  return near * far / (far - d * (far - near));
}

void main() {
  vec4 col = texture2D(tColor, vUv);
  float c = texture2D(tDepth, vUv).x;
  float l = texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x;
  float r = texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x;
  float u = texture2D(tDepth, vUv + vec2(0.0, texel.y)).x;
  float d = texture2D(tDepth, vUv - vec2(0.0, texel.y)).x;
  // 깊이 버퍼 값은 평평한 면 위에서 화면 좌표에 대해 직선으로 변하므로, 이웃과의 차이(라플라시안)는 면이 끊기는 곳에서만 커진다.
  float lap = abs(l + r + u + d - 4.0 * c);
  float z = viewZ(min(c, min(min(l, r), min(u, d))));
  float gap = lap * z * z * (far - near) / (near * far);
  float edge = smoothstep(0.02, 0.07, gap / z);
  // 멀리 있는 물체는 안개에 묻히므로 선도 함께 옅어지게 한다.
  edge *= 1.0 - smoothstep(45.0, 130.0, z);
  col.rgb = mix(col.rgb, ink, edge * strength);
  // 구간의 메인 색을 얇게 씌운다: 채도를 조금 빼고, 메인 색으로 물들이고, 같은 색의 옅은 막을 덮어 어두운 곳을 띄운다.
  vec3 g = mix(col.rgb, vec3(luma(col.rgb)), grade * 0.9);
  g = mix(g, g * tint / max(luma(tint), 0.001), grade * 1.6);
  g = mix(g, tint, grade * 0.42);
  // 붉은 경고 표시는 어느 구간에서나 같은 색으로 눈에 띄어야 하므로 필터를 덜 씌운다.
  float warn = smoothstep(0.1, 0.32, col.r - max(col.g, col.b));
  col.rgb = mix(g, col.rgb, warn * 0.85);
  gl_FragColor = col;
  #include <colorspace_fragment>
}`;

/** 장면을 한 번 그린 뒤 물체의 가장자리에 만화풍 외곽선을 덧그리고, 구간의 메인 색을 화면 전체에 얇게 씌우는 후처리 */
export class Outline {
  private target: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;

  /**
   * 외곽선 후처리에 쓸 그림판과 화면 전체를 덮는 사각형을 준비한다.
   * @author heojeehaeng(claude)
   * @param {THREE.WebGLRenderer} renderer 렌더러
   * @param {THREE.PerspectiveCamera} camera 게임 카메라. 깊이 값을 거리로 바꿀 때 가까운 면과 먼 면을 읽는다
   */
  constructor(private renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) {
    // 어두운 탄광에서 색이 층지지 않도록 색은 반정밀 실수로 담고, 계단 현상은 다중 표본으로 줄인다.
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.target.depthTexture = new THREE.DepthTexture(4, 4);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        texel: { value: new THREE.Vector2(1, 1) },
        near: { value: camera.near },
        far: { value: camera.far },
        ink: { value: new THREE.Color(0x1d1712) },
        strength: { value: 0.78 },
        tint: { value: new THREE.Color(0xffffff) },
        grade: { value: 0 },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  /**
   * 화면 크기가 바뀌면 그림판 크기와 선 굵기를 다시 맞춘다.
   * @author heojeehaeng(claude)
   * @param {number} w 화면 가로(px)
   * @param {number} h 화면 세로(px)
   * @param {number} ratio 화면 배율
   */
  setSize(w: number, h: number, ratio: number): void {
    const pw = Math.max(2, Math.floor(w * ratio));
    const ph = Math.max(2, Math.floor(h * ratio));
    this.target.setSize(pw, ph);
    // 선 굵기는 화면 배율과 상관없이 비슷하게 보이도록 배율만큼 넓게 읽는다.
    const px = Math.max(1, ratio * 0.9);
    this.mat.uniforms.texel.value.set(px / pw, px / ph);
  }

  /**
   * 화면 전체에 씌울 구간의 메인 색과 세기, 외곽선 색을 정한다.
   * @author heojeehaeng(claude)
   * @param {THREE.Color} tint 구간의 메인 색
   * @param {number} grade 씌우는 세기(0~1)
   * @param {THREE.Color} ink 외곽선 색
   */
  setGrade(tint: THREE.Color, grade: number, ink: THREE.Color): void {
    this.mat.uniforms.tint.value.copy(tint);
    this.mat.uniforms.grade.value = grade;
    this.mat.uniforms.ink.value.copy(ink);
  }

  /**
   * 장면을 그림판에 그린 뒤 외곽선을 입혀 화면에 내보낸다.
   * @author heojeehaeng(claude)
   * @param {THREE.Scene} scene 게임 장면
   * @param {THREE.Camera} camera 게임 카메라
   */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
