import * as THREE from 'three';

/**
 * Single-pass "camera" look applied after tone mapping: vignette, film grain, chromatic aberration,
 * barrel distortion, fear desaturation, a damage tint, brightness lift, glitch tearing and fades.
 * Everything is subtle by default; the fear/glitch uniforms are driven by gameplay.
 */
export const HorrorFxShader = {
  name: 'HorrorFxShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.045 },
    uChroma: { value: 0.0012 },
    uDistort: { value: 0.035 },
    uFear: { value: 0 },
    uDamage: { value: 0 },
    uBrightness: { value: 1 },
    uGlitch: { value: 0 },
    uFade: { value: 0 },
    uDim: { value: 0 },
    uQuality: { value: 2 },
    uCctv: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uChroma;
    uniform float uDistort;
    uniform float uFear;
    uniform float uDamage;
    uniform float uBrightness;
    uniform float uGlitch;
    uniform float uFade;
    uniform float uDim;
    uniform float uQuality;
    uniform float uCctv;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      // Lens (barrel) distortion, stronger when afraid.
      float r2 = dot(c, c);
      float k = uDistort + uFear * 0.05 + uCctv * 0.18;
      uv = 0.5 + c * (1.0 + k * r2);

      // Glitch tearing: horizontal slices shift sideways.
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 38.0 + floor(uTime * 24.0));
        float n = hash(vec2(band, floor(uTime * 30.0)));
        if (n < uGlitch * 0.6) uv.x += (hash(vec2(band, 3.7)) - 0.5) * 0.08 * uGlitch;
      }

      vec3 col;
      if (uQuality > 0.5) {
        float ca = uChroma * (1.0 + uFear * 3.0 + uGlitch * 6.0);
        vec2 dir = c * ca * 2.0;
        col.r = texture2D(tDiffuse, uv + dir).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - dir).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      // Brightness setting: lift shadows without washing out highlights.
      col = pow(max(col, 0.0), vec3(1.0 / uBrightness));

      // Fear: desaturate and cool down, slight pulse.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum) * vec3(0.92, 0.97, 1.05), uFear * 0.45);

      // Damage / caught: red bleed from the edges.
      float edge = smoothstep(0.15, 0.75, length(c) * 1.4);
      col = mix(col, vec3(0.35, 0.0, 0.0) + col * 0.3, uDamage * edge);

      // Vignette, tightening with fear.
      float v = 1.0 - smoothstep(0.2 - uFear * 0.12, 0.85, length(c) * (1.0 + uVignette * 0.6 + uFear * 0.35));
      col *= mix(1.0, v, 0.85);

      // Film grain (luma-weighted so blacks stay inky).
      float g = hash(vUv * uResolution * 0.5 + fract(uTime * 13.7)) - 0.5;
      col += g * uGrain * (0.35 + lum) * (1.0 + uFear);

      // Scanline shimmer during glitches.
      col *= 1.0 - uGlitch * 0.15 * step(0.5, fract(vUv.y * uResolution.y * 0.5));

      // Security camera look: wide lens, desaturated green phosphor, scanlines, rolling bar.
      if (uCctv > 0.0) {
        float l = dot(col, vec3(0.3, 0.59, 0.11));
        l = pow(l * 1.6, 0.8);
        vec3 cc = vec3(0.75, 1.0, 0.82) * l;
        cc += (hash(vUv * uResolution + uTime * 60.0) - 0.5) * 0.18;
        cc *= 0.85 + 0.15 * sin(vUv.y * uResolution.y * 1.2);
        float bar = smoothstep(0.0, 0.08, abs(fract(vUv.y - uTime * 0.07) - 0.5));
        cc *= 0.8 + 0.2 * bar;
        col = mix(col, cc, uCctv);
      }
      col *= 1.0 - uDim * 0.75;
      col *= 1.0 - uFade;
      // Clip the barrel-distorted border.
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
