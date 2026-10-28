import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { toMercator } from '@/lib/geo'
import { buildLookup } from './colormaps'
import { CHANNELS, type Channel, type DecodedHeatmap } from './decode'

/**
 * A MapLibre custom layer that draws the forecast heatmap with WebGL2.
 *
 * All 49 hourly frames live in one texture on the GPU. For each pixel the fragment shader
 * interpolates between the four nearest grid cells (ignoring cells outside the corridor)
 * for the two hours either side of the slider, blends them, and looks the result up in a
 * colour table. Moving the slider or switching variable only updates uniforms, so scrubbing
 * costs no CPU work and no uploads.
 */

const VERTEX_SHADER = `#version 300 es
uniform mat4 u_matrix;
in vec2 a_pos;
in vec2 a_uv;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_data;   // RGBA bytes, frames stacked vertically, NEAREST
uniform sampler2D u_mask;   // corridor fade, LINEAR
uniform sampler2D u_lut;    // 256 x 4 colour table, LINEAR
uniform ivec2 u_grid;       // cols, rows
uniform int u_frame0;
uniform int u_frame1;
uniform float u_mix;
uniform int u_channel;
uniform float u_opacity;

in vec2 v_uv;
out vec4 fragColor;

float channelOf(vec4 t) {
  if (u_channel == 0) return t.r;
  if (u_channel == 1) return t.g;
  if (u_channel == 2) return t.b;
  return t.a;
}

float fetchByte(ivec2 cell, int frame) {
  cell = clamp(cell, ivec2(0), u_grid - 1);
  return channelOf(texelFetch(u_data, ivec2(cell.x, cell.y + frame * u_grid.y), 0)) * 255.0;
}

// Bilinear interpolation over neighbours that have data. Returns (value, weight).
vec2 bilinear(vec2 g, int frame) {
  vec2 base = floor(g);
  vec2 f = g - base;
  ivec2 i = ivec2(base);
  float acc = 0.0;
  float total = 0.0;
  for (int dy = 0; dy <= 1; dy++) {
    for (int dx = 0; dx <= 1; dx++) {
      float v = fetchByte(i + ivec2(dx, dy), frame);
      float w = (dx == 1 ? f.x : 1.0 - f.x) * (dy == 1 ? f.y : 1.0 - f.y);
      if (v < 254.5) {
        acc += v * w;
        total += w;
      }
    }
  }
  return vec2(total > 0.0 ? acc / total : 0.0, total);
}

void main() {
  float mask = texture(u_mask, v_uv).r;
  if (mask < 0.004) discard;
  vec2 g = v_uv * vec2(u_grid) - 0.5;
  vec2 a = bilinear(g, u_frame0);
  vec2 b = bilinear(g, u_frame1);
  if (a.y <= 0.0 && b.y <= 0.0) discard;
  float v = a.y <= 0.0 ? b.x : (b.y <= 0.0 ? a.x : mix(a.x, b.x, u_mix));
  vec4 color = texture(u_lut, vec2((v + 0.5) / 256.0, (float(u_channel) + 0.5) / 4.0));
  fragColor = color * (mask * u_opacity);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Heatmap shader failed to compile: ${log}`)
  }
  return shader
}

type Uniform =
  | 'u_matrix'
  | 'u_data'
  | 'u_mask'
  | 'u_lut'
  | 'u_grid'
  | 'u_frame0'
  | 'u_frame1'
  | 'u_mix'
  | 'u_channel'
  | 'u_opacity'

export class HeatmapLayer implements CustomLayerInterface {
  readonly id: string
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const

  private map: MapLibreMap | null = null
  private program: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private quad: WebGLBuffer | null = null
  private dataTexture: WebGLTexture | null = null
  private maskTexture: WebGLTexture | null = null
  private lutTexture: WebGLTexture | null = null
  private uniforms = {} as Record<Uniform, WebGLUniformLocation | null>

  private heat: DecodedHeatmap | null = null
  private uploaded = false
  private hour = 0
  private channel = 0
  private opacity = 0

  constructor(id = 'weather-heatmap') {
    this.id = id
  }

  setData(heat: DecodedHeatmap | null): void {
    this.heat = heat
    this.uploaded = false
    this.map?.triggerRepaint()
  }

  setHour(hour: number): void {
    this.hour = hour
    this.map?.triggerRepaint()
  }

  setVariable(channel: Channel): void {
    this.channel = CHANNELS.indexOf(channel)
    this.map?.triggerRepaint()
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity
    this.map?.triggerRepaint()
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext): void {
    this.map = map
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Heatmap program failed to link: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    for (const name of [
      'u_matrix',
      'u_data',
      'u_mask',
      'u_lut',
      'u_grid',
      'u_frame0',
      'u_frame1',
      'u_mix',
      'u_channel',
      'u_opacity',
    ] as Uniform[]) {
      this.uniforms[name] = gl.getUniformLocation(program, name)
    }
    this.quad = gl.createBuffer()
    this.vao = gl.createVertexArray()
    this.dataTexture = gl.createTexture()
    this.maskTexture = gl.createTexture()
    this.lutTexture = gl.createTexture()
  }

  onRemove(_map: MapLibreMap, gl: WebGL2RenderingContext): void {
    gl.deleteProgram(this.program)
    gl.deleteBuffer(this.quad)
    gl.deleteVertexArray(this.vao)
    gl.deleteTexture(this.dataTexture)
    gl.deleteTexture(this.maskTexture)
    gl.deleteTexture(this.lutTexture)
    this.map = null
  }

  private upload(gl: WebGL2RenderingContext, heat: DecodedHeatmap): void {
    const { cols, rows, hours, bounds } = heat
    const [x0, y0] = toMercator([bounds.west, bounds.north])
    const [x1, y1] = toMercator([bounds.east, bounds.south])
    // x, y (mercator), u, v
    const vertices = new Float32Array([x0, y0, 0, 0, x1, y0, 1, 0, x0, y1, 0, 1, x1, y1, 1, 1])

    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(this.program!, 'a_pos')
    const uv = gl.getAttribLocation(this.program!, 'a_uv')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.bindVertexArray(null)

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    const setup = (texture: WebGLTexture | null, filter: number) => {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    setup(this.dataTexture, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows * hours, 0, gl.RGBA, gl.UNSIGNED_BYTE, heat.texture)
    setup(this.maskTexture, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, heat.mask)
    setup(this.lutTexture, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLookup(heat.scales))
    gl.bindTexture(gl.TEXTURE_2D, null)
    this.uploaded = true
  }

  render(gl: WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    const heat = this.heat
    if (!heat || !this.program || this.opacity <= 0.001) return
    if (!this.uploaded) this.upload(gl, heat)

    const u = this.uniforms
    const frame0 = Math.min(Math.floor(this.hour), heat.hours - 1)
    const frame1 = Math.min(frame0 + 1, heat.hours - 1)

    gl.useProgram(this.program)
    gl.uniformMatrix4fv(
      u.u_matrix,
      false,
      new Float32Array(args.defaultProjectionData.mainMatrix as ArrayLike<number>),
    )
    gl.uniform2i(u.u_grid, heat.cols, heat.rows)
    gl.uniform1i(u.u_frame0, frame0)
    gl.uniform1i(u.u_frame1, frame1)
    gl.uniform1f(u.u_mix, this.hour - frame0)
    gl.uniform1i(u.u_channel, this.channel)
    gl.uniform1f(u.u_opacity, this.opacity)

    const bind = (unit: number, texture: WebGLTexture | null, location: WebGLUniformLocation | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(location, unit)
    }
    bind(0, this.dataTexture, u.u_data)
    bind(1, this.maskTexture, u.u_mask)
    bind(2, this.lutTexture, u.u_lut)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) // colours are premultiplied
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    gl.activeTexture(gl.TEXTURE0)
  }
}
