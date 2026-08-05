import {
  BackSide,
  BoxGeometry,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';

/** Compact daytime sky inspired by Space Builder Skybox noon colors. */
const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uSunDirection;

varying vec3 vWorldPosition;

const vec3 noonSkyZenithColor = vec3(0.12, 0.32, 0.68);
const vec3 noonSkyHorizonColor = vec3(0.48, 0.62, 0.9);
const vec3 noonSkyNadirColor = vec3(0.06, 0.08, 0.12);
const vec3 sunNoonColor = vec3(1.0, 0.92, 0.42);

void main() {
  vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
  float y = viewDirection.y;
  float zenithMix = pow(max(y, 0.0), 0.55);
  // Keep horizon blue through the band just below y=0. A finite ground plane leaves
  // that band visible around the grass; the raw SB nadir (near-black) reads as a
  // broken sky whenever the orbit tips even slightly downward.
  float lower = smoothstep(0.08, 0.55, -y);
  float hemisphere = smoothstep(-0.08, 0.08, y);

  vec3 sky = mix(
    mix(noonSkyHorizonColor, noonSkyNadirColor, lower),
    mix(noonSkyHorizonColor, noonSkyZenithColor, zenithMix),
    hemisphere
  );

  float sunward = max(dot(viewDirection, uSunDirection), 0.0);
  float horiz = 1.0 - abs(y);
  sky += sunNoonColor * pow(sunward, 12.0) * 0.55;
  sky += vec3(0.08, 0.1, 0.14) * pow(sunward, 4.0) * pow(horiz, 1.8) * 0.35;

  gl_FragColor = vec4(sky, 1.0);
}
`;

export function createDemoSkybox(sunDirection = new Vector3(0.35, 0.82, 0.25).normalize()) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
    },
  });
  const sky = new Mesh(new BoxGeometry(1, 1, 1), material);
  sky.name = 'DemoSkybox';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
