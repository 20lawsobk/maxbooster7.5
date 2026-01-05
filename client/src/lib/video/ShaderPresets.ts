export interface ShaderSource {
  vertex: string;
  fragment: string;
  uniforms: string[];
}

export const COMMON_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;
out vec2 v_position;

uniform mat4 u_transform;

void main() {
  v_texCoord = a_texCoord;
  v_position = a_position;
  gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
}
`;

export const PARTICLE_SHADER: ShaderSource = {
  vertex: `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_velocity;
in float a_life;
in float a_size;
in vec4 a_color;

out vec4 v_color;
out float v_life;

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_gravity;
uniform float u_friction;
uniform float u_audioReactivity;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;

void main() {
  float lifeProgress = 1.0 - a_life;
  
  vec2 velocity = a_velocity;
  velocity.y += u_gravity * u_time * lifeProgress;
  velocity *= pow(u_friction, u_time);
  
  vec2 pos = a_position + velocity * lifeProgress;
  
  float audioScale = 1.0 + u_audioReactivity * (u_bass * 0.5 + u_mid * 0.3 + u_treble * 0.2);
  
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = a_size * a_life * audioScale;
  
  v_color = a_color;
  v_color.a *= a_life;
  v_life = a_life;
}
`,
  fragment: `#version 300 es
precision highp float;

in vec4 v_color;
in float v_life;

out vec4 fragColor;

uniform int u_shape;
uniform float u_softness;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  
  float alpha = v_color.a;
  
  if (u_shape == 0) {
    alpha *= smoothstep(0.5, 0.5 - u_softness, dist);
  } else if (u_shape == 1) {
    float box = max(abs(center.x), abs(center.y));
    alpha *= smoothstep(0.5, 0.5 - u_softness, box);
  } else if (u_shape == 2) {
    float angle = atan(center.y, center.x);
    float star = cos(angle * 5.0) * 0.4 + 0.1;
    alpha *= smoothstep(star + 0.1, star, dist);
  }
  
  if (alpha < 0.01) discard;
  
  fragColor = vec4(v_color.rgb, alpha);
}
`,
  uniforms: ['u_time', 'u_resolution', 'u_gravity', 'u_friction', 'u_audioReactivity', 'u_bass', 'u_mid', 'u_treble', 'u_shape', 'u_softness']
};

export const BLOOM_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_threshold;
uniform float u_intensity;
uniform float u_radius;
uniform int u_pass;

const int SAMPLES = 15;
const float WEIGHTS[15] = float[](
  0.0044, 0.0115, 0.0257, 0.0488, 0.0799,
  0.1133, 0.1394, 0.1494, 0.1394, 0.1133,
  0.0799, 0.0488, 0.0257, 0.0115, 0.0044
);

vec3 extractBright(vec3 color) {
  float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return color * smoothstep(u_threshold, u_threshold + 0.1, brightness);
}

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec4 color = texture(u_texture, v_texCoord);
  
  if (u_pass == 0) {
    fragColor = vec4(extractBright(color.rgb), color.a);
    return;
  }
  
  vec3 result = vec3(0.0);
  
  if (u_pass == 1) {
    for (int i = 0; i < SAMPLES; i++) {
      float offset = float(i - SAMPLES / 2) * u_radius;
      vec2 sampleCoord = v_texCoord + vec2(offset * texelSize.x, 0.0);
      result += texture(u_texture, sampleCoord).rgb * WEIGHTS[i];
    }
  } else if (u_pass == 2) {
    for (int i = 0; i < SAMPLES; i++) {
      float offset = float(i - SAMPLES / 2) * u_radius;
      vec2 sampleCoord = v_texCoord + vec2(0.0, offset * texelSize.y);
      result += texture(u_texture, sampleCoord).rgb * WEIGHTS[i];
    }
  } else {
    vec3 bloom = texture(u_texture, v_texCoord).rgb;
    fragColor = vec4(color.rgb + bloom * u_intensity, color.a);
    return;
  }
  
  fragColor = vec4(result, color.a);
}
`,
  uniforms: ['u_texture', 'u_resolution', 'u_threshold', 'u_intensity', 'u_radius', 'u_pass']
};

export const GRADIENT_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
in vec2 v_position;
out vec4 fragColor;

uniform int u_type;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform vec4 u_color4;
uniform float u_angle;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_time;
uniform int u_animated;
uniform float u_stops[8];
uniform int u_numStops;

vec4 mixColors(float t) {
  if (u_numStops <= 2) {
    return mix(u_color1, u_color2, t);
  } else if (u_numStops == 3) {
    if (t < 0.5) {
      return mix(u_color1, u_color2, t * 2.0);
    } else {
      return mix(u_color2, u_color3, (t - 0.5) * 2.0);
    }
  } else {
    if (t < 0.333) {
      return mix(u_color1, u_color2, t * 3.0);
    } else if (t < 0.666) {
      return mix(u_color2, u_color3, (t - 0.333) * 3.0);
    } else {
      return mix(u_color3, u_color4, (t - 0.666) * 3.0);
    }
  }
}

void main() {
  vec2 uv = v_texCoord;
  float t = 0.0;
  
  if (u_animated == 1) {
    uv += vec2(sin(u_time * 0.5) * 0.1, cos(u_time * 0.3) * 0.1);
  }
  
  if (u_type == 0) {
    float angle = u_angle;
    vec2 dir = vec2(cos(angle), sin(angle));
    vec2 centered = uv - 0.5;
    t = dot(centered, dir) + 0.5;
  } else if (u_type == 1) {
    vec2 diff = uv - u_center;
    t = length(diff) / u_radius;
  } else if (u_type == 2) {
    vec2 diff = uv - u_center;
    t = (atan(diff.y, diff.x) / 3.14159 + 1.0) * 0.5;
  } else if (u_type == 3) {
    vec2 diff = uv - u_center;
    float angle = atan(diff.y, diff.x) + u_time * 0.5;
    t = (sin(angle * 4.0) + 1.0) * 0.5;
  } else if (u_type == 4) {
    vec2 centered = uv - 0.5;
    t = max(abs(centered.x), abs(centered.y)) * 2.0;
  }
  
  t = clamp(t, 0.0, 1.0);
  
  fragColor = mixColors(t);
}
`,
  uniforms: ['u_type', 'u_color1', 'u_color2', 'u_color3', 'u_color4', 'u_angle', 'u_center', 'u_radius', 'u_time', 'u_animated', 'u_stops', 'u_numStops']
};

export const WAVE_DISTORTION_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_time;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_speed;
uniform int u_type;
uniform vec2 u_center;
uniform float u_audioReactivity;
uniform float u_bass;

void main() {
  vec2 uv = v_texCoord;
  float audioAmp = u_amplitude * (1.0 + u_audioReactivity * u_bass);
  
  if (u_type == 0) {
    uv.x += sin(uv.y * u_frequency + u_time * u_speed) * audioAmp;
    uv.y += sin(uv.x * u_frequency + u_time * u_speed) * audioAmp;
  } else if (u_type == 1) {
    uv.x += sin(uv.y * u_frequency + u_time * u_speed) * audioAmp;
  } else if (u_type == 2) {
    uv.y += sin(uv.x * u_frequency + u_time * u_speed) * audioAmp;
  } else if (u_type == 3) {
    vec2 diff = uv - u_center;
    float dist = length(diff);
    float wave = sin(dist * u_frequency - u_time * u_speed) * audioAmp;
    uv += normalize(diff) * wave;
  } else if (u_type == 4) {
    float angle = atan(uv.y - u_center.y, uv.x - u_center.x);
    float dist = length(uv - u_center);
    angle += sin(dist * u_frequency - u_time * u_speed) * audioAmp;
    uv = u_center + vec2(cos(angle), sin(angle)) * dist;
  } else if (u_type == 5) {
    float noise1 = sin(uv.x * u_frequency * 2.0 + u_time) * sin(uv.y * u_frequency * 3.0 + u_time * 1.5);
    float noise2 = sin(uv.x * u_frequency * 3.0 - u_time * 0.8) * sin(uv.y * u_frequency * 2.0 - u_time);
    uv.x += noise1 * audioAmp;
    uv.y += noise2 * audioAmp;
  }
  
  uv = clamp(uv, 0.0, 1.0);
  fragColor = texture(u_texture, uv);
}
`,
  uniforms: ['u_texture', 'u_time', 'u_amplitude', 'u_frequency', 'u_speed', 'u_type', 'u_center', 'u_audioReactivity', 'u_bass']
};

export const CHROMATIC_ABERRATION_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_amount;
uniform float u_angle;
uniform vec2 u_center;
uniform int u_radial;
uniform float u_audioReactivity;
uniform float u_bass;

void main() {
  vec2 uv = v_texCoord;
  float amount = u_amount * (1.0 + u_audioReactivity * u_bass);
  
  vec2 offset;
  
  if (u_radial == 1) {
    vec2 diff = uv - u_center;
    float dist = length(diff);
    offset = normalize(diff) * amount * dist;
  } else {
    offset = vec2(cos(u_angle), sin(u_angle)) * amount;
  }
  
  float r = texture(u_texture, uv + offset).r;
  float g = texture(u_texture, uv).g;
  float b = texture(u_texture, uv - offset).b;
  float a = texture(u_texture, uv).a;
  
  fragColor = vec4(r, g, b, a);
}
`,
  uniforms: ['u_texture', 'u_amount', 'u_angle', 'u_center', 'u_radial', 'u_audioReactivity', 'u_bass']
};

export const VIGNETTE_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_intensity;
uniform float u_radius;
uniform float u_softness;
uniform vec2 u_center;
uniform vec4 u_color;
uniform int u_type;

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);
  
  vec2 uv = v_texCoord - u_center;
  float dist;
  
  if (u_type == 0) {
    dist = length(uv);
  } else if (u_type == 1) {
    dist = max(abs(uv.x), abs(uv.y));
  } else {
    dist = abs(uv.x) + abs(uv.y);
  }
  
  float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
  vignette = mix(1.0, vignette, u_intensity);
  
  vec3 finalColor = mix(u_color.rgb, texColor.rgb, vignette);
  
  fragColor = vec4(finalColor, texColor.a);
}
`,
  uniforms: ['u_texture', 'u_intensity', 'u_radius', 'u_softness', 'u_center', 'u_color', 'u_type']
};

export const COLOR_GRADING_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_exposure;
uniform float u_gamma;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
uniform float u_temperature;
uniform float u_tint;
uniform float u_vibrance;
uniform vec3 u_lift;
uniform vec3 u_gain;
uniform float u_filmGrain;
uniform float u_time;

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) / 2.0;
  
  if (maxC == minC) {
    return vec3(0.0, 0.0, l);
  }
  
  float d = maxC - minC;
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  
  float h;
  if (maxC == c.r) {
    h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  } else if (maxC == c.g) {
    h = (c.b - c.r) / d + 2.0;
  } else {
    h = (c.r - c.g) / d + 4.0;
  }
  h /= 6.0;
  
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0/2.0) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) {
    return vec3(hsl.z);
  }
  
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec4 color = texture(u_texture, v_texCoord);
  vec3 rgb = color.rgb;
  
  rgb *= pow(2.0, u_exposure);
  
  rgb = ((rgb - 0.5) * u_contrast) + 0.5;
  rgb += u_brightness;
  
  vec3 hsl = rgb2hsl(rgb);
  hsl.x = mod(hsl.x + u_hue, 1.0);
  hsl.y *= u_saturation;
  rgb = hsl2rgb(hsl);
  
  float maxChannel = max(max(rgb.r, rgb.g), rgb.b);
  float minChannel = min(min(rgb.r, rgb.g), rgb.b);
  float saturation = maxChannel - minChannel;
  float vibranceScale = u_vibrance * (1.0 - saturation);
  vec3 gray = vec3(dot(rgb, vec3(0.2126, 0.7152, 0.0722)));
  rgb = mix(gray, rgb, 1.0 + vibranceScale);
  
  float tempK = u_temperature * 0.1;
  rgb.r += tempK;
  rgb.b -= tempK;
  rgb.g += u_tint * 0.1;
  rgb.r -= u_tint * 0.05;
  rgb.b -= u_tint * 0.05;
  
  float luminance = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  float shadowWeight = 1.0 - smoothstep(0.0, 0.33, luminance);
  float highlightWeight = smoothstep(0.66, 1.0, luminance);
  float midtoneWeight = 1.0 - shadowWeight - highlightWeight;
  
  rgb += u_shadows * shadowWeight;
  rgb += u_midtones * midtoneWeight;
  rgb += u_highlights * highlightWeight;
  
  rgb = u_lift + rgb * u_gain;
  
  rgb = pow(rgb, vec3(1.0 / u_gamma));
  
  if (u_filmGrain > 0.0) {
    float grain = rand(v_texCoord * u_time) * u_filmGrain;
    rgb += grain - u_filmGrain * 0.5;
  }
  
  rgb = clamp(rgb, 0.0, 1.0);
  
  fragColor = vec4(rgb, color.a);
}
`,
  uniforms: [
    'u_texture', 'u_brightness', 'u_contrast', 'u_saturation', 'u_hue',
    'u_exposure', 'u_gamma', 'u_shadows', 'u_midtones', 'u_highlights',
    'u_temperature', 'u_tint', 'u_vibrance', 'u_lift', 'u_gain',
    'u_filmGrain', 'u_time'
  ]
};

export const NOISE_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform float u_time;
uniform float u_scale;
uniform int u_octaves;
uniform float u_persistence;
uniform float u_lacunarity;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform int u_type;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (i >= u_octaves) break;
    value += amplitude * noise(p * frequency);
    frequency *= u_lacunarity;
    amplitude *= u_persistence;
  }
  
  return value;
}

float ridgedNoise(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (i >= u_octaves) break;
    float n = noise(p * frequency);
    n = 1.0 - abs(n * 2.0 - 1.0);
    n = n * n;
    value += amplitude * n;
    frequency *= u_lacunarity;
    amplitude *= u_persistence;
  }
  
  return value;
}

float turbulence(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (i >= u_octaves) break;
    value += amplitude * abs(noise(p * frequency) * 2.0 - 1.0);
    frequency *= u_lacunarity;
    amplitude *= u_persistence;
  }
  
  return value;
}

void main() {
  vec2 uv = v_texCoord * u_scale;
  uv += u_time * 0.1;
  
  float n;
  if (u_type == 0) {
    n = fbm(uv);
  } else if (u_type == 1) {
    n = ridgedNoise(uv);
  } else if (u_type == 2) {
    n = turbulence(uv);
  } else {
    float n1 = fbm(uv);
    float n2 = fbm(uv + vec2(5.2, 1.3));
    n = fbm(uv + vec2(n1, n2) * 2.0);
  }
  
  fragColor = mix(u_color1, u_color2, n);
}
`,
  uniforms: ['u_time', 'u_scale', 'u_octaves', 'u_persistence', 'u_lacunarity', 'u_color1', 'u_color2', 'u_type']
};

export const BLUR_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform int u_direction;
uniform int u_type;

const int MAX_SAMPLES = 64;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec4 result = vec4(0.0);
  float total = 0.0;
  
  int samples = int(min(float(MAX_SAMPLES), u_radius * 2.0 + 1.0));
  
  if (u_type == 0) {
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= samples) break;
      float offset = float(i) - u_radius;
      float weight = exp(-offset * offset / (2.0 * u_radius * u_radius / 9.0));
      
      vec2 sampleOffset = u_direction == 0 
        ? vec2(offset * texelSize.x, 0.0)
        : vec2(0.0, offset * texelSize.y);
      
      result += texture(u_texture, v_texCoord + sampleOffset) * weight;
      total += weight;
    }
  } else if (u_type == 1) {
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= samples) break;
      float offset = float(i) - u_radius;
      
      vec2 sampleOffset = u_direction == 0 
        ? vec2(offset * texelSize.x, 0.0)
        : vec2(0.0, offset * texelSize.y);
      
      result += texture(u_texture, v_texCoord + sampleOffset);
      total += 1.0;
    }
  } else {
    vec2 center = v_texCoord - 0.5;
    float angle = atan(center.y, center.x);
    float dist = length(center);
    
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= samples) break;
      float offset = (float(i) / float(samples) - 0.5) * u_radius * 0.01;
      vec2 samplePos = vec2(
        cos(angle + offset) * dist,
        sin(angle + offset) * dist
      ) + 0.5;
      
      result += texture(u_texture, samplePos);
      total += 1.0;
    }
  }
  
  fragColor = result / total;
}
`,
  uniforms: ['u_texture', 'u_resolution', 'u_radius', 'u_direction', 'u_type']
};

export const KALEIDOSCOPE_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_segments;
uniform float u_rotation;
uniform vec2 u_center;
uniform float u_zoom;
uniform float u_time;
uniform int u_animated;

void main() {
  vec2 uv = (v_texCoord - u_center) * u_zoom;
  
  float angle = atan(uv.y, uv.x);
  float dist = length(uv);
  
  if (u_animated == 1) {
    angle += u_time * 0.5;
  }
  
  angle += u_rotation;
  
  float segmentAngle = 3.14159 * 2.0 / u_segments;
  angle = mod(angle, segmentAngle);
  
  if (angle > segmentAngle * 0.5) {
    angle = segmentAngle - angle;
  }
  
  vec2 newUV = vec2(cos(angle), sin(angle)) * dist + 0.5;
  newUV = clamp(newUV, 0.0, 1.0);
  
  fragColor = texture(u_texture, newUV);
}
`,
  uniforms: ['u_texture', 'u_segments', 'u_rotation', 'u_center', 'u_zoom', 'u_time', 'u_animated']
};

export const PIXELATE_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_pixelSize;
uniform int u_type;

void main() {
  vec2 uv = v_texCoord;
  
  if (u_type == 0) {
    vec2 pixels = u_resolution / u_pixelSize;
    uv = floor(uv * pixels) / pixels;
  } else if (u_type == 1) {
    vec2 pixels = u_resolution / u_pixelSize;
    uv = floor(uv * pixels) / pixels;
    vec2 centered = fract(v_texCoord * pixels) - 0.5;
    float circle = smoothstep(0.45, 0.35, length(centered));
    vec4 color = texture(u_texture, uv);
    fragColor = vec4(color.rgb * circle, color.a);
    return;
  } else {
    float size = u_pixelSize / u_resolution.x;
    float ratio = u_resolution.x / u_resolution.y;
    float s = size * sqrt(3.0);
    
    vec2 p = uv;
    p.y /= ratio;
    
    vec2 a = mod(p, vec2(size, s)) - vec2(size * 0.5, s * 0.5);
    vec2 b = mod(p - vec2(size * 0.5, s * 0.5), vec2(size, s)) - vec2(size * 0.5, s * 0.5);
    
    vec2 gv = length(a) < length(b) ? a : b;
    uv = p - gv;
    uv.y *= ratio;
  }
  
  fragColor = texture(u_texture, uv);
}
`,
  uniforms: ['u_texture', 'u_resolution', 'u_pixelSize', 'u_type']
};

export const GLITCH_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_time;
uniform float u_intensity;
uniform float u_speed;
uniform float u_blockSize;
uniform int u_seed;

float rand(vec2 co) {
  return fract(sin(dot(co.xy + float(u_seed), vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  float t = u_time * u_speed;
  
  float noise = rand(vec2(floor(t * 20.0), 0.0));
  
  if (noise < u_intensity) {
    float blockY = floor(uv.y / u_blockSize) * u_blockSize;
    float offsetX = (rand(vec2(blockY, t)) - 0.5) * u_intensity * 0.1;
    uv.x += offsetX;
    
    if (rand(vec2(t, blockY)) < 0.1 * u_intensity) {
      float rgbSplit = u_intensity * 0.02;
      vec4 r = texture(u_texture, uv + vec2(rgbSplit, 0.0));
      vec4 g = texture(u_texture, uv);
      vec4 b = texture(u_texture, uv - vec2(rgbSplit, 0.0));
      fragColor = vec4(r.r, g.g, b.b, 1.0);
      return;
    }
  }
  
  if (rand(vec2(floor(t * 50.0), uv.y * 100.0)) < 0.002 * u_intensity) {
    float scanlineIntensity = rand(vec2(t, uv.y));
    fragColor = texture(u_texture, uv) * (1.0 - scanlineIntensity * 0.5);
    return;
  }
  
  fragColor = texture(u_texture, uv);
}
`,
  uniforms: ['u_texture', 'u_time', 'u_intensity', 'u_speed', 'u_blockSize', 'u_seed']
};

export const AUDIO_VISUALIZER_SHADER: ShaderSource = {
  vertex: COMMON_VERTEX_SHADER,
  fragment: `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_audioData;
uniform float u_time;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform int u_type;
uniform float u_sensitivity;
uniform float u_smoothing;
uniform int u_barCount;
uniform float u_barWidth;
uniform float u_mirror;
uniform float u_radius;
uniform float u_lineWidth;
uniform vec2 u_center;

float getFrequency(float x) {
  return texture(u_audioData, vec2(x, 0.0)).r * u_sensitivity;
}

void main() {
  vec2 uv = v_texCoord;
  vec4 color = vec4(0.0);
  
  if (u_type == 0) {
    float barIndex = floor(uv.x * float(u_barCount));
    float barX = barIndex / float(u_barCount);
    float freq = getFrequency(barX);
    
    float barCenter = (barIndex + 0.5) / float(u_barCount);
    float barEdge = abs(uv.x - barCenter) * float(u_barCount);
    
    float y = uv.y;
    if (u_mirror > 0.5) {
      y = abs(y - 0.5) * 2.0;
    }
    
    if (barEdge < u_barWidth * 0.5 && y < freq) {
      float t = y / freq;
      color = mix(u_color1, u_color2, t);
    }
  } else if (u_type == 1) {
    float freq = getFrequency(uv.x);
    float waveY = 0.5 + (freq - 0.5) * 0.5;
    float dist = abs(uv.y - waveY);
    
    if (dist < u_lineWidth) {
      float alpha = 1.0 - dist / u_lineWidth;
      color = mix(u_color1, u_color2, uv.x) * alpha;
    }
  } else if (u_type == 2) {
    vec2 centered = uv - u_center;
    float angle = atan(centered.y, centered.x);
    float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);
    float freq = getFrequency(normalizedAngle);
    float dist = length(centered);
    
    float innerRadius = u_radius * 0.5;
    float outerRadius = u_radius * 0.5 + freq * u_radius * 0.5;
    
    if (dist > innerRadius && dist < outerRadius) {
      float t = (dist - innerRadius) / (outerRadius - innerRadius);
      color = mix(u_color1, u_color2, t);
    }
  } else if (u_type == 3) {
    float x = uv.x;
    float waveform = texture(u_audioData, vec2(x, 0.5)).r;
    float y = 0.5 + (waveform - 0.5) * u_sensitivity;
    float dist = abs(uv.y - y);
    
    if (dist < u_lineWidth) {
      float alpha = 1.0 - dist / u_lineWidth;
      color = mix(u_color1, u_color2, abs(waveform - 0.5) * 2.0) * alpha;
    }
  }
  
  fragColor = color;
}
`,
  uniforms: [
    'u_audioData', 'u_time', 'u_color1', 'u_color2', 'u_type', 'u_sensitivity',
    'u_smoothing', 'u_barCount', 'u_barWidth', 'u_mirror', 'u_radius', 'u_lineWidth', 'u_center'
  ]
};

export const SHADER_PRESETS = {
  particle: PARTICLE_SHADER,
  bloom: BLOOM_SHADER,
  gradient: GRADIENT_SHADER,
  waveDistortion: WAVE_DISTORTION_SHADER,
  chromaticAberration: CHROMATIC_ABERRATION_SHADER,
  vignette: VIGNETTE_SHADER,
  colorGrading: COLOR_GRADING_SHADER,
  noise: NOISE_SHADER,
  blur: BLUR_SHADER,
  kaleidoscope: KALEIDOSCOPE_SHADER,
  pixelate: PIXELATE_SHADER,
  glitch: GLITCH_SHADER,
  audioVisualizer: AUDIO_VISUALIZER_SHADER,
} as const;

export type ShaderPresetName = keyof typeof SHADER_PRESETS;

export function getShaderPreset(name: ShaderPresetName): ShaderSource {
  return SHADER_PRESETS[name];
}

export function createCustomShader(fragmentCode: string, additionalUniforms: string[] = []): ShaderSource {
  return {
    vertex: COMMON_VERTEX_SHADER,
    fragment: fragmentCode,
    uniforms: ['u_texture', 'u_time', 'u_resolution', ...additionalUniforms],
  };
}
