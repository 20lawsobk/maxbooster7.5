import type {
  LayerConfig,
  TransformConfig,
  VideoFrame,
  RenderProgress,
} from '../../../../shared/video/VideoRendererEngine';

export type BlendMode = 
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colorDodge'
  | 'colorBurn'
  | 'hardLight'
  | 'softLight'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'add'
  | 'subtract';

export interface ShaderProgram {
  program: WebGLProgram;
  vertexShader: WebGLShader;
  fragmentShader: WebGLShader;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

export interface Framebuffer {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface RenderTarget {
  framebuffer: Framebuffer | null;
  viewport: { x: number; y: number; width: number; height: number };
}

export interface RenderState {
  currentProgram: ShaderProgram | null;
  currentFramebuffer: Framebuffer | null;
  blendMode: BlendMode;
  viewport: { x: number; y: number; width: number; height: number };
}

export interface VertexBuffer {
  buffer: WebGLBuffer;
  itemSize: number;
  numItems: number;
}

export interface TextureInfo {
  texture: WebGLTexture;
  width: number;
  height: number;
  format: number;
}

export interface WebGLRendererOptions {
  width: number;
  height: number;
  antialias?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'default' | 'high-performance' | 'low-power';
  useOffscreen?: boolean;
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl: WebGL2RenderingContext;
  private width: number;
  private height: number;
  
  private shaderPrograms: Map<string, ShaderProgram> = new Map();
  private framebuffers: Map<string, Framebuffer> = new Map();
  private textures: Map<string, TextureInfo> = new Map();
  private vertexBuffers: Map<string, VertexBuffer> = new Map();
  
  private renderState: RenderState;
  private quadBuffer: VertexBuffer | null = null;
  private defaultProgram: ShaderProgram | null = null;
  
  private isOffscreen: boolean = false;
  private extensionsLoaded: boolean = false;
  private maxTextureSize: number = 0;
  private maxTextureUnits: number = 0;

  constructor(options: WebGLRendererOptions) {
    this.width = options.width;
    this.height = options.height;
    this.isOffscreen = options.useOffscreen ?? false;

    if (this.isOffscreen && typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(this.width, this.height);
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    const contextOptions: WebGLContextAttributes = {
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? true,
      premultipliedAlpha: options.premultipliedAlpha ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
      powerPreference: options.powerPreference ?? 'high-performance',
    };

    const gl = this.canvas.getContext('webgl2', contextOptions);
    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser');
    }
    this.gl = gl;

    this.renderState = {
      currentProgram: null,
      currentFramebuffer: null,
      blendMode: 'normal',
      viewport: { x: 0, y: 0, width: this.width, height: this.height },
    };

    this.initialize();
  }

  private initialize(): void {
    const gl = this.gl;

    this.loadExtensions();
    
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);

    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    this.setBlendMode('normal');

    this.createQuadBuffer();
    this.createDefaultProgram();
  }

  private loadExtensions(): void {
    const gl = this.gl;
    
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('EXT_float_blend');
    
    this.extensionsLoaded = true;
  }

  private createQuadBuffer(): void {
    const gl = this.gl;
    
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Failed to create quad buffer');
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    this.quadBuffer = {
      buffer,
      itemSize: 4,
      numItems: 4,
    };
  }

  private createDefaultProgram(): void {
    const vertexShaderSource = `#version 300 es
      precision highp float;
      
      in vec2 a_position;
      in vec2 a_texCoord;
      
      out vec2 v_texCoord;
      
      uniform mat4 u_transform;
      
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentShaderSource = `#version 300 es
      precision highp float;
      
      in vec2 v_texCoord;
      out vec4 fragColor;
      
      uniform sampler2D u_texture;
      uniform float u_opacity;
      uniform vec4 u_color;
      uniform int u_useTexture;
      
      void main() {
        if (u_useTexture == 1) {
          vec4 texColor = texture(u_texture, v_texCoord);
          fragColor = texColor * u_opacity;
        } else {
          fragColor = u_color * u_opacity;
        }
      }
    `;

    this.defaultProgram = this.createShaderProgram('default', vertexShaderSource, fragmentShaderSource);
  }

  createShaderProgram(name: string, vertexSource: string, fragmentSource: string): ShaderProgram {
    const gl = this.gl;

    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create shader program');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      throw new Error(`Failed to link shader program: ${error}`);
    }

    const shaderProgram: ShaderProgram = {
      program,
      vertexShader,
      fragmentShader,
      uniforms: new Map(),
      attributes: new Map(),
    };

    this.extractUniforms(shaderProgram);
    this.extractAttributes(shaderProgram);
    this.shaderPrograms.set(name, shaderProgram);

    return shaderProgram;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      const shaderType = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      throw new Error(`Failed to compile ${shaderType} shader: ${error}`);
    }

    return shader;
  }

  private extractUniforms(shaderProgram: ShaderProgram): void {
    const gl = this.gl;
    const numUniforms = gl.getProgramParameter(shaderProgram.program, gl.ACTIVE_UNIFORMS);
    
    for (let i = 0; i < numUniforms; i++) {
      const uniformInfo = gl.getActiveUniform(shaderProgram.program, i);
      if (uniformInfo) {
        const location = gl.getUniformLocation(shaderProgram.program, uniformInfo.name);
        if (location) {
          shaderProgram.uniforms.set(uniformInfo.name, location);
        }
      }
    }
  }

  private extractAttributes(shaderProgram: ShaderProgram): void {
    const gl = this.gl;
    const numAttributes = gl.getProgramParameter(shaderProgram.program, gl.ACTIVE_ATTRIBUTES);
    
    for (let i = 0; i < numAttributes; i++) {
      const attributeInfo = gl.getActiveAttrib(shaderProgram.program, i);
      if (attributeInfo) {
        const location = gl.getAttribLocation(shaderProgram.program, attributeInfo.name);
        shaderProgram.attributes.set(attributeInfo.name, location);
      }
    }
  }

  useProgram(program: ShaderProgram): void {
    if (this.renderState.currentProgram !== program) {
      this.gl.useProgram(program.program);
      this.renderState.currentProgram = program;
    }
  }

  setUniform(program: ShaderProgram, name: string, value: number | number[] | Float32Array | Int32Array): void {
    const gl = this.gl;
    const location = program.uniforms.get(name);
    if (!location) return;

    this.useProgram(program);

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        gl.uniform1i(location, value);
      } else {
        gl.uniform1f(location, value);
      }
    } else if (value instanceof Float32Array || Array.isArray(value)) {
      const arr = value instanceof Float32Array ? value : new Float32Array(value);
      switch (arr.length) {
        case 2: gl.uniform2fv(location, arr); break;
        case 3: gl.uniform3fv(location, arr); break;
        case 4: gl.uniform4fv(location, arr); break;
        case 9: gl.uniformMatrix3fv(location, false, arr); break;
        case 16: gl.uniformMatrix4fv(location, false, arr); break;
        default: gl.uniform1fv(location, arr);
      }
    } else if (value instanceof Int32Array) {
      switch (value.length) {
        case 2: gl.uniform2iv(location, value); break;
        case 3: gl.uniform3iv(location, value); break;
        case 4: gl.uniform4iv(location, value); break;
        default: gl.uniform1iv(location, value);
      }
    }
  }

  setUniformMatrix4(program: ShaderProgram, name: string, matrix: Float32Array): void {
    const location = program.uniforms.get(name);
    if (location) {
      this.useProgram(program);
      this.gl.uniformMatrix4fv(location, false, matrix);
    }
  }

  createFramebuffer(name: string, width?: number, height?: number): Framebuffer {
    const gl = this.gl;
    const w = width ?? this.width;
    const h = height ?? this.height;

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('Failed to create framebuffer');

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create framebuffer texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer is incomplete: ${status}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const fb: Framebuffer = { framebuffer, texture, width: w, height: h };
    this.framebuffers.set(name, fb);
    return fb;
  }

  bindFramebuffer(framebuffer: Framebuffer | null): void {
    const gl = this.gl;
    if (framebuffer) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer.framebuffer);
      gl.viewport(0, 0, framebuffer.width, framebuffer.height);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
    }
    this.renderState.currentFramebuffer = framebuffer;
  }

  setBlendMode(mode: BlendMode): void {
    const gl = this.gl;
    this.renderState.blendMode = mode;

    switch (mode) {
      case 'normal':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case 'multiply':
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case 'screen':
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case 'add':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      case 'subtract':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        break;
      case 'overlay':
      case 'darken':
      case 'lighten':
      case 'colorDodge':
      case 'colorBurn':
      case 'hardLight':
      case 'softLight':
      case 'difference':
      case 'exclusion':
      case 'hue':
      case 'saturation':
      case 'color':
      case 'luminosity':
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
        break;
      default:
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.blendEquation(gl.FUNC_ADD);
    }
  }

  createTexture(name: string, source: ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageData): TextureInfo {
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.generateMipmap(gl.TEXTURE_2D);

    const width = 'width' in source ? source.width : (source as ImageData).width;
    const height = 'height' in source ? source.height : (source as ImageData).height;

    const textureInfo: TextureInfo = {
      texture,
      width,
      height,
      format: gl.RGBA,
    };

    this.textures.set(name, textureInfo);
    return textureInfo;
  }

  createEmptyTexture(name: string, width: number, height: number): TextureInfo {
    const gl = this.gl;

    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const textureInfo: TextureInfo = {
      texture,
      width,
      height,
      format: gl.RGBA,
    };

    this.textures.set(name, textureInfo);
    return textureInfo;
  }

  bindTexture(texture: TextureInfo | WebGLTexture, unit: number = 0): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if ('texture' in texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
  }

  createVertexBuffer(name: string, data: Float32Array, itemSize: number): VertexBuffer {
    const gl = this.gl;
    
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('Failed to create vertex buffer');

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const vertexBuffer: VertexBuffer = {
      buffer,
      itemSize,
      numItems: data.length / itemSize,
    };

    this.vertexBuffers.set(name, vertexBuffer);
    return vertexBuffer;
  }

  updateVertexBuffer(buffer: VertexBuffer, data: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    buffer.numItems = data.length / buffer.itemSize;
  }

  clear(r: number = 0, g: number = 0, b: number = 0, a: number = 0): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  drawQuad(program?: ShaderProgram): void {
    const gl = this.gl;
    const prog = program ?? this.defaultProgram;
    if (!prog || !this.quadBuffer) return;

    this.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer.buffer);

    const positionLoc = prog.attributes.get('a_position');
    const texCoordLoc = prog.attributes.get('a_texCoord');

    if (positionLoc !== undefined && positionLoc >= 0) {
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
    }

    if (texCoordLoc !== undefined && texCoordLoc >= 0) {
      gl.enableVertexAttribArray(texCoordLoc);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  drawPoints(program: ShaderProgram, count: number): void {
    this.useProgram(program);
    this.gl.drawArrays(this.gl.POINTS, 0, count);
  }

  drawTriangles(program: ShaderProgram, count: number): void {
    this.useProgram(program);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, count);
  }

  createTransformMatrix(transform: TransformConfig): Float32Array {
    const matrix = new Float32Array(16);
    
    const cos = Math.cos(transform.rotation);
    const sin = Math.sin(transform.rotation);
    
    const anchorX = transform.anchorX * 2 - 1;
    const anchorY = transform.anchorY * 2 - 1;
    
    const tx = (transform.x / (this.width / 2)) - anchorX * (1 - transform.scaleX);
    const ty = (transform.y / (this.height / 2)) - anchorY * (1 - transform.scaleY);

    matrix[0] = cos * transform.scaleX;
    matrix[1] = sin * transform.scaleX;
    matrix[2] = 0;
    matrix[3] = 0;
    
    matrix[4] = -sin * transform.scaleY;
    matrix[5] = cos * transform.scaleY;
    matrix[6] = 0;
    matrix[7] = 0;
    
    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = 1;
    matrix[11] = 0;
    
    matrix[12] = tx;
    matrix[13] = ty;
    matrix[14] = 0;
    matrix[15] = 1;

    return matrix;
  }

  renderLayer(layer: LayerConfig, transform: Float32Array, opacity: number): void {
    if (!this.defaultProgram) return;

    this.useProgram(this.defaultProgram);
    this.setUniformMatrix4(this.defaultProgram, 'u_transform', transform);
    this.setUniform(this.defaultProgram, 'u_opacity', opacity * layer.opacity);
    
    this.drawQuad();
  }

  renderToTexture(framebuffer: Framebuffer, renderCallback: () => void): void {
    this.bindFramebuffer(framebuffer);
    this.clear();
    renderCallback();
    this.bindFramebuffer(null);
  }

  postProcess(sourceTexture: TextureInfo | Framebuffer, program: ShaderProgram, outputFramebuffer?: Framebuffer): void {
    if (outputFramebuffer) {
      this.bindFramebuffer(outputFramebuffer);
    } else {
      this.bindFramebuffer(null);
    }

    this.useProgram(program);
    
    if ('texture' in sourceTexture) {
      this.bindTexture(sourceTexture.texture, 0);
    } else {
      this.bindTexture(sourceTexture, 0);
    }
    
    this.setUniform(program, 'u_texture', 0);
    this.drawQuad(program);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.width = width;
      this.canvas.height = height;
    } else {
      (this.canvas as OffscreenCanvas).width = width;
      (this.canvas as OffscreenCanvas).height = height;
    }

    this.gl.viewport(0, 0, width, height);
    this.renderState.viewport = { x: 0, y: 0, width, height };
  }

  getPixels(x?: number, y?: number, width?: number, height?: number): Uint8Array {
    const gl = this.gl;
    const px = x ?? 0;
    const py = y ?? 0;
    const w = width ?? this.width;
    const h = height ?? this.height;
    
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(px, py, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    return pixels;
  }

  getImageData(): ImageData {
    const pixels = this.getPixels();
    const flippedPixels = new Uint8ClampedArray(pixels.length);
    
    for (let y = 0; y < this.height; y++) {
      const srcRow = (this.height - y - 1) * this.width * 4;
      const dstRow = y * this.width * 4;
      for (let x = 0; x < this.width * 4; x++) {
        flippedPixels[dstRow + x] = pixels[srcRow + x];
      }
    }
    
    return new ImageData(flippedPixels, this.width, this.height);
  }

  async toBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    if (this.canvas instanceof HTMLCanvasElement) {
      return new Promise((resolve, reject) => {
        this.canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Failed to create blob'));
          },
          type,
          quality
        );
      });
    } else {
      return (this.canvas as OffscreenCanvas).convertToBlob({ type, quality });
    }
  }

  getCanvas(): HTMLCanvasElement | OffscreenCanvas {
    return this.canvas;
  }

  getContext(): WebGL2RenderingContext {
    return this.gl;
  }

  getProgram(name: string): ShaderProgram | undefined {
    return this.shaderPrograms.get(name);
  }

  getFramebuffer(name: string): Framebuffer | undefined {
    return this.framebuffers.get(name);
  }

  getTexture(name: string): TextureInfo | undefined {
    return this.textures.get(name);
  }

  getDefaultProgram(): ShaderProgram | null {
    return this.defaultProgram;
  }

  getMaxTextureSize(): number {
    return this.maxTextureSize;
  }

  getMaxTextureUnits(): number {
    return this.maxTextureUnits;
  }

  deleteTexture(name: string): void {
    const texture = this.textures.get(name);
    if (texture) {
      this.gl.deleteTexture(texture.texture);
      this.textures.delete(name);
    }
  }

  deleteFramebuffer(name: string): void {
    const framebuffer = this.framebuffers.get(name);
    if (framebuffer) {
      this.gl.deleteFramebuffer(framebuffer.framebuffer);
      this.gl.deleteTexture(framebuffer.texture);
      this.framebuffers.delete(name);
    }
  }

  deleteProgram(name: string): void {
    const program = this.shaderPrograms.get(name);
    if (program) {
      this.gl.deleteShader(program.vertexShader);
      this.gl.deleteShader(program.fragmentShader);
      this.gl.deleteProgram(program.program);
      this.shaderPrograms.delete(name);
    }
  }

  deleteVertexBuffer(name: string): void {
    const buffer = this.vertexBuffers.get(name);
    if (buffer) {
      this.gl.deleteBuffer(buffer.buffer);
      this.vertexBuffers.delete(name);
    }
  }

  dispose(): void {
    for (const name of this.textures.keys()) {
      this.deleteTexture(name);
    }
    
    for (const name of this.framebuffers.keys()) {
      this.deleteFramebuffer(name);
    }
    
    for (const name of this.shaderPrograms.keys()) {
      this.deleteProgram(name);
    }
    
    for (const name of this.vertexBuffers.keys()) {
      this.deleteVertexBuffer(name);
    }

    if (this.quadBuffer) {
      this.gl.deleteBuffer(this.quadBuffer.buffer);
      this.quadBuffer = null;
    }

    this.defaultProgram = null;
  }
}

export function createIdentityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
  const result = new Float32Array(16);
  
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result[i * 4 + j] = 
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  
  return result;
}

export function createTranslationMatrix(x: number, y: number, z: number = 0): Float32Array {
  const matrix = createIdentityMatrix();
  matrix[12] = x;
  matrix[13] = y;
  matrix[14] = z;
  return matrix;
}

export function createScaleMatrix(sx: number, sy: number, sz: number = 1): Float32Array {
  const matrix = createIdentityMatrix();
  matrix[0] = sx;
  matrix[5] = sy;
  matrix[10] = sz;
  return matrix;
}

export function createRotationMatrix(angle: number): Float32Array {
  const matrix = createIdentityMatrix();
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  matrix[0] = cos;
  matrix[1] = sin;
  matrix[4] = -sin;
  matrix[5] = cos;
  return matrix;
}

export function createOrthoMatrix(
  left: number, right: number,
  bottom: number, top: number,
  near: number = -1, far: number = 1
): Float32Array {
  const matrix = new Float32Array(16);
  
  matrix[0] = 2 / (right - left);
  matrix[5] = 2 / (top - bottom);
  matrix[10] = -2 / (far - near);
  matrix[12] = -(right + left) / (right - left);
  matrix[13] = -(top + bottom) / (top - bottom);
  matrix[14] = -(far + near) / (far - near);
  matrix[15] = 1;
  
  return matrix;
}
