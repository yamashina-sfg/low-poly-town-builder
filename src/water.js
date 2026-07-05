import * as THREE from 'three';

// 全ての水タイルで共有するシェーダーマテリアル。time uniformを毎フレーム
// 更新するだけで、頂点シェーダー内のsin波によって揺れて見える。
const waterUniforms = { time: { value: 0 } };

const waterMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  transparent: true,
  depthWrite: false,
  vertexShader: `
    uniform float time;
    varying float vWave;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      float wave = sin((worldPosition.x + time) * 1.6) * 0.05
                 + cos((worldPosition.z + time * 1.3) * 1.6) * 0.05;
      vWave = wave;
      vec3 displaced = position + vec3(0.0, wave, 0.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
    }
  `,
  fragmentShader: `
    varying float vWave;
    void main() {
      vec3 base = vec3(0.22, 0.48, 0.65);
      gl_FragColor = vec4(base + vWave * 0.6, 0.78);
    }
  `,
});

/**
 * 半透明で波打つ水タイルのメッシュを生成する。
 * マテリアルは全水タイルで共有し、ジオメトリのみタイルごとに個別。
 */
export function generateWater(tilePosition, tileSize) {
  const geometry = new THREE.PlaneGeometry(tileSize * 0.98, tileSize * 0.98, 6, 6);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, waterMaterial);
  mesh.position.set(tilePosition.x, 0.06, tilePosition.z);
  return mesh;
}

export function updateWaterTime(elapsedSeconds) {
  waterUniforms.time.value = elapsedSeconds;
}
