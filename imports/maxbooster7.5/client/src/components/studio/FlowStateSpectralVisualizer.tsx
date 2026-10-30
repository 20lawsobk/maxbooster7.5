// @ts-nocheck
import { logger } from "@/lib/logger";
import { useRef, useEffect, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FlowStateSpectralVisualizerProps {
  audioContext: AudioContext | null;
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  width?: number;
  height?: number;
  mode?: "spectrum" | "waveform" | "circular";
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const SPECTRUM_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_frequencies[128];
  uniform float u_freqCount;
  
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  
  void main() {
    int index = int(v_uv.x * u_freqCount);
    float freq = 0.0;
    for (int i = 0; i < 128; i++) {
      if (i == index) {
        freq = u_frequencies[i];
        break;
      }
    }
    
    float normalizedFreq = freq / 255.0;
    float barHeight = normalizedFreq * 0.85;
    
    if (v_uv.y < barHeight) {
      float hue = mix(0.55, 0.9, v_uv.x) + sin(u_time * 0.5) * 0.05;
      float saturation = 0.8;
      float brightness = 0.9 - (barHeight - v_uv.y) * 0.3;
      
      vec3 color = hsv2rgb(vec3(hue, saturation, brightness));
      
      float glow = exp(-pow((v_uv.y - barHeight) * 10.0, 2.0)) * 0.5;
      color += vec3(glow);
      
      gl_FragColor = vec4(color, 0.95);
    } else {
      float gridLine = step(0.99, fract(v_uv.x * u_freqCount));
      float horizontalGrid = step(0.98, fract(v_uv.y * 10.0));
      float grid = max(gridLine, horizontalGrid) * 0.1;
      gl_FragColor = vec4(vec3(grid), 0.3);
    }
  }
`;

const WAVEFORM_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_frequencies[128];
  uniform float u_freqCount;
  
  void main() {
    int index = int(v_uv.x * u_freqCount);
    float freq = 0.0;
    for (int i = 0; i < 128; i++) {
      if (i == index) {
        freq = u_frequencies[i];
        break;
      }
    }
    
    float waveY = 0.5 + (freq / 255.0 - 0.5) * 0.8;
    float dist = abs(v_uv.y - waveY);
    
    float wave = smoothstep(0.02, 0.0, dist);
    float glow = exp(-dist * 15.0) * 0.6;
    
    vec3 waveColor = mix(
      vec3(0.4, 0.8, 1.0),
      vec3(1.0, 0.4, 0.8),
      v_uv.x + sin(u_time * 0.3) * 0.2
    );
    
    vec3 color = waveColor * (wave + glow);
    float alpha = wave + glow * 0.5;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

const CIRCULAR_FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_frequencies[128];
  uniform float u_freqCount;
  
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  
  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 pos = v_uv - center;
    float angle = atan(pos.y, pos.x);
    float radius = length(pos);
    
    float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);
    int index = int(normalizedAngle * u_freqCount);
    
    float freq = 0.0;
    for (int i = 0; i < 128; i++) {
      if (i == index) {
        freq = u_frequencies[i];
        break;
      }
    }
    
    float normalizedFreq = freq / 255.0;
    float innerRadius = 0.15;
    float maxRadius = innerRadius + normalizedFreq * 0.35;
    
    if (radius > innerRadius && radius < maxRadius) {
      float hue = normalizedAngle + u_time * 0.1;
      float brightness = 1.0 - (radius - innerRadius) / (maxRadius - innerRadius) * 0.3;
      vec3 color = hsv2rgb(vec3(hue, 0.8, brightness));
      
      float edge = smoothstep(maxRadius, maxRadius - 0.01, radius);
      gl_FragColor = vec4(color * edge, edge * 0.9);
    } else if (radius <= innerRadius) {
      float pulse = 0.3 + sin(u_time * 2.0) * 0.1;
      gl_FragColor = vec4(vec3(pulse), 0.5);
    } else {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  }
`;

interface WebGLResources {
  program: WebGLProgram;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  positionBuffer: WebGLBuffer;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    logger.error("Failed to create shader");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    logger.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) {
    logger.error("Failed to create program");
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    logger.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function cleanupWebGL(
  gl: WebGLRenderingContext,
  resources: WebGLResources | null,
) {
  if (!resources) return;

  gl.deleteProgram(resources.program);
  gl.deleteShader(resources.vertexShader);
  gl.deleteShader(resources.fragmentShader);
  gl.deleteBuffer(resources.positionBuffer);
}

export function FlowStateSpectralVisualizer({
  _audioContext,
  analyserNode,
  isPlaying,
  width = 400,
  height = 200,
  mode = "spectrum",
}: FlowStateSpectralVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const resourcesRef = useRef<WebGLResources | null>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);
  const [currentMode, setCurrentMode] = useState(mode);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [glError, setGlError] = useState<string | null>(null);

  const getFragmentShader = useCallback((m: typeof mode) => {
    switch (m) {
      case "waveform":
        return WAVEFORM_FRAGMENT_SHADER;
      case "circular":
        return CIRCULAR_FRAGMENT_SHADER;
      default:
        return SPECTRUM_FRAGMENT_SHADER;
    }
  }, []);

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      logger.warn("WebGL not supported");
      setHasWebGL(false);
      return false;
    }

    glRef.current = gl;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    if (!vertexShader) {
      setGlError("Failed to compile vertex shader");
      return false;
    }

    const fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      getFragmentShader(currentMode),
    );
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      setGlError("Failed to compile fragment shader");
      return false;
    }

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      setGlError("Failed to create WebGL program");
      return false;
    }

    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      setGlError("Failed to create buffer");
      return false;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resourcesRef.current = {
      program,
      vertexShader,
      fragmentShader,
      positionBuffer,
    };

    setGlError(null);
    return true;
  }, [currentMode, getFragmentShader]);

  const render = useCallback(() => {
    const gl = glRef.current;
    const resources = resourcesRef.current;

    if (!gl || !resources || gl.isContextLost()) {
      return;
    }

    timeRef.current += 0.016;

    const frequencies = new Uint8Array(128);
    if (analyserNode && isPlaying) {
      analyserNode.getByteFrequencyData(frequencies);
    } else {
      for (let i = 0; i < 128; i++) {
        const base = Math.sin(timeRef.current * 2 + i * 0.1) * 30 + 40;
        const harmonic = Math.sin(timeRef.current * 3 + i * 0.15) * 15;
        frequencies[i] = Math.max(0, Math.min(255, base + harmonic));
      }
    }

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(resources.program);

    const timeLocation = gl.getUniformLocation(resources.program, "u_time");
    gl.uniform1f(timeLocation, timeRef.current);

    const freqCountLocation = gl.getUniformLocation(
      resources.program,
      "u_freqCount",
    );
    gl.uniform1f(freqCountLocation, 128);

    const freqLocation = gl.getUniformLocation(
      resources.program,
      "u_frequencies",
    );
    const floatFreqs = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      floatFreqs[i] = frequencies[i];
    }
    gl.uniform1fv(freqLocation, floatFreqs);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationRef.current = requestAnimationFrame(render);
  }, [analyserNode, isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      logger.warn("WebGL context lost");
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      resourcesRef.current = null;
    };

    const handleContextRestored = () => {
      logger.info("WebGL context restored");
      if (initGL()) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    if (initGL()) {
      animationRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }

      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);

      if (glRef.current && resourcesRef.current) {
        cleanupWebGL(glRef.current, resourcesRef.current);
        resourcesRef.current = null;
      }
    };
  }, [initGL, render]);

  useEffect(() => {
    if (
      resourcesRef.current &&
      glRef.current &&
      !glRef.current.isContextLost()
    ) {
      animationRef.current = requestAnimationFrame(render);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [render]);

  useEffect(() => {
    if (currentMode !== mode) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      if (glRef.current && resourcesRef.current) {
        cleanupWebGL(glRef.current, resourcesRef.current);
        resourcesRef.current = null;
      }
      setCurrentMode(mode);
    }
  }, [mode, currentMode]);

  useEffect(() => {
    if (
      !resourcesRef.current &&
      glRef.current &&
      hasWebGL &&
      !glRef.current.isContextLost()
    ) {
      if (initGL()) {
        animationRef.current = requestAnimationFrame(render);
      }
    }
  }, [currentMode, initGL, hasWebGL, render]);

  const modes: { id: typeof mode; label: string }[] = [
    { id: "spectrum", label: "Spectrum" },
    { id: "waveform", label: "Waveform" },
    { id: "circular", label: "Circular" },
  ];

  if (!hasWebGL) {
    return (
      <div
        style={{ width, height }}
        className="rounded-xl bg-black/40 backdrop-blur-sm border border-white/5 flex items-center justify-center"
      >
        <span className="text-xs text-white/50">WebGL not available</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width * 2}
        height={height * 2}
        style={{ width, height }}
        className="rounded-xl bg-black/40 backdrop-blur-sm border border-white/5"
      />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
          <span className="text-xs text-red-400">{glError}</span>
        </div>
      )}

      <div className="absolute top-2 right-2 flex gap-1 bg-black/50 rounded-lg p-1 backdrop-blur-sm">
        {modes.map((m) => (
          <motion.button
            key={m.id}
            onClick={() => setCurrentMode(m.id)}
            className={cn(
              "px-2 py-1 text-[10px] font-medium rounded transition-all",
              currentMode === m.id
                ? "bg-purple-600 text-white"
                : "text-white/50 hover:text-white hover:bg-white/10",
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {m.label}
          </motion.button>
        ))}
      </div>

      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            isPlaying ? "bg-green-500 animate-pulse" : "bg-white/30",
          )}
        />
        <span className="text-[10px] text-white/50">
          {isPlaying && analyserNode ? "Analyzing..." : "Demo Mode"}
        </span>
      </div>
    </div>
  );
}
