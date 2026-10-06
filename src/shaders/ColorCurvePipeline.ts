import Phaser from 'phaser';

/**
 * GLSL Fragment Shader for Grayscale Color-Curve Filter.
 *
 * Maps each input pixel intensity x from 0–255 to an output intensity y.
 * Uses an adjustable power/exponential interpolation between two configurable control points:
 * (x0, y0) = lower control point
 * (x1, y1) = upper control point
 *
 * For values between the two points:
 *   y = y0 + (y1 - y0) * pow((x - x0) / (x1 - x0), exponent)
 *
 * Clamps normalized value to [0, 1] and final output to [0, 255].
 * - For pixels below x0, uses y0.
 * - For pixels above x1, uses y1.
 *
 * Exponent parameter:
 * - 1.0 = linear
 * - > 1.0 = darker/lower for most of the range, then rises toward endpoint
 * - < 1.0 = brighter/higher for most of the range, then approaches endpoint
 */
export const COLOR_CURVE_FRAG_SHADER = `
#define SHADER_NAME COLOR_CURVE_FS

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
varying vec2 outTexCoord;

// Lower control point (range 0.0 - 255.0)
uniform float uX0;
uniform float uY0;

// Upper control point (range 0.0 - 255.0)
uniform float uX1;
uniform float uY1;

// Power curve exponent (1.0 = linear, >1.0 darker, <1.0 brighter)
uniform float uExponent;

void main ()
{
    vec4 tex = texture2D(uMainSampler, outTexCoord);
    float a = tex.a;
    if (a < 0.001) {
        gl_FragColor = vec4(0.0);
        return;
    }

    // Luminance intensity x from un-premultiplied color in range [0.0, 255.0]
    vec3 rgb = tex.rgb / a;
    float x = dot(rgb, vec3(0.299, 0.587, 0.114)) * 255.0;

    // Normalized value between x0 and x1 clamped to [0.0, 1.0]
    // For x <= x0, norm = 0.0 -> y = y0
    // For x >= x1, norm = 1.0 -> y = y1
    float dx = max(uX1 - uX0, 0.0001);
    float norm = clamp((x - uX0) / dx, 0.0, 1.0);

    // y = y0 + (y1 - y0) * pow(norm, exponent), clamped to [0.0, 255.0]
    float expVal = max(uExponent, 0.0001);
    float y = clamp(uY0 + (uY1 - uY0) * pow(norm, expVal), 0.0, 255.0);

    // Output normalized grayscale intensity y / 255.0 with original alpha
    float outY = y / 255.0;
    gl_FragColor = vec4(vec3(outY) * a, a);
}
`;

/**
 * CPU evaluation of the color-curve filter formula.
 * Used for unit testing, CPU-side sampling, and verification.
 */
export function evaluateColorCurve(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  exponent: number,
): number {
  const dx = Math.max(x1 - x0, 0.0001);
  const norm = Phaser.Math.Clamp((x - x0) / dx, 0.0, 1.0);
  const expVal = Math.max(exponent, 0.0001);
  const y = y0 + (y1 - y0) * Math.pow(norm, expVal);
  return Phaser.Math.Clamp(y, 0.0, 255.0);
}

/**
 * Grayscale Color-Curve PostFX Pipeline for background rendering.
 */
export class ColorCurvePipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  public static readonly PIPELINE_NAME = 'ColorCurvePipeline';

  // Configurable global control points and exponent (0-255 range)
  public static x0 = 0.0;
  public static y0 = 0.0;
  public static x1 = 255.0;
  public static y1 = 255.0;
  public static exponent = 1.0;

  // Instance-level override properties (null = use static global values)
  public x0: number | null = null;
  public y0: number | null = null;
  public x1: number | null = null;
  public y1: number | null = null;
  public exponent: number | null = null;

  constructor(game: Phaser.Game) {
    super({
      game,
      fragShader: COLOR_CURVE_FRAG_SHADER,
    });
  }

  /**
   * Set control points and exponent globally.
   * @param x0 Lower control point input intensity (0-255)
   * @param y0 Lower control point output intensity (0-255)
   * @param x1 Upper control point input intensity (0-255)
   * @param y1 Upper control point output intensity (0-255)
   * @param exponent Power curve exponent (1.0 = linear, >1.0 darker, <1.0 brighter)
   */
  public static setControlPoints(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    exponent = 1.0,
  ): void {
    ColorCurvePipeline.x0 = x0;
    ColorCurvePipeline.y0 = y0;
    ColorCurvePipeline.x1 = x1;
    ColorCurvePipeline.y1 = y1;
    ColorCurvePipeline.exponent = exponent;
  }

  /**
   * Map light level percentage (e.g. -0.50 for -50%, +0.20 for +20%) to curve control points and exponent.
   *
   * Contrast and inverse correlation model:
   * - White point is applied according to the X position (x1) with y1 locked at 255.0.
   *   This ensures highlights can always reach pure white without capping out into dark gray.
   * - Black point is applied according to the Y position (y0) with x0 locked at 0.0.
   *   This ensures shadows are anchored without cutting off input intensity.
   * - x1 (white point X) and y0 (black point Y) are inversely correlated across the light range:
   *   As scene brightens, x1 decreases (stretching highlights toward 255) while y0 subtly lifts (preventing washed-out fog).
   *   As scene darkens, x1 stays high (highlights remain crisp) while y0 stays anchored to 0 (deep gothic shadows).
   *   Together with exponent shaping, this adds dynamic contrast rather than turning flat white or flat black.
   */
  public static setLightLevel(level: number): void {
    const clampedLevel = Phaser.Math.Clamp(level, -1.00, 0.90);

    // Continuous inverse-correlation across light range [-1.00, +0.90]
    // u = 0.0 at -100%, u = 1.0 at +90%
    const u = (clampedLevel - (-1.00)) / 1.90;

    // White point applied to X position: decreases from 255.0 down to 180.0 as light increases
    ColorCurvePipeline.x1 = 255.0 - u * 75.0;
    ColorCurvePipeline.y1 = 255.0; // Never cap white down to gray

    // Black point applied to Y position: inversely correlated with x1 (increases from 0.0 up to 20.0)
    ColorCurvePipeline.x0 = 0.0;
    ColorCurvePipeline.y0 = u * 20.0; // Anchored near true black to preserve shadow contrast

    // Exponent curve shaping:
    // When clampedLevel < 0: exponent > 1.0 (deepens darks/midtones into moody gothic shadows)
    // When clampedLevel >= 0: exponent < 1.0 (lifts midtones smoothly into radiant illumination)
    if (clampedLevel >= 0) {
      ColorCurvePipeline.exponent = 1.0 / (1.0 + clampedLevel * 1.5);
    } else {
      ColorCurvePipeline.exponent = 1.0 + Math.abs(clampedLevel) * 2.2;
    }
  }

  public onPreRender(controller?: unknown, shader?: Phaser.Renderer.WebGL.WebGLShader): void {
    const x0 = this.x0 !== null ? this.x0 : ColorCurvePipeline.x0;
    const y0 = this.y0 !== null ? this.y0 : ColorCurvePipeline.y0;
    const x1 = this.x1 !== null ? this.x1 : ColorCurvePipeline.x1;
    const y1 = this.y1 !== null ? this.y1 : ColorCurvePipeline.y1;
    const exp = this.exponent !== null ? this.exponent : ColorCurvePipeline.exponent;

    this.set1f('uX0', x0, shader);
    this.set1f('uY0', y0, shader);
    this.set1f('uX1', x1, shader);
    this.set1f('uY1', y1, shader);
    this.set1f('uExponent', exp, shader);
  }

  public onDraw(renderTarget: Phaser.Renderer.WebGL.RenderTarget): void {
    const x0 = this.x0 !== null ? this.x0 : ColorCurvePipeline.x0;
    const y0 = this.y0 !== null ? this.y0 : ColorCurvePipeline.y0;
    const x1 = this.x1 !== null ? this.x1 : ColorCurvePipeline.x1;
    const y1 = this.y1 !== null ? this.y1 : ColorCurvePipeline.y1;
    const exp = this.exponent !== null ? this.exponent : ColorCurvePipeline.exponent;

    this.set1f('uX0', x0);
    this.set1f('uY0', y0);
    this.set1f('uX1', x1);
    this.set1f('uY1', y1);
    this.set1f('uExponent', exp);

    this.bindAndDraw(renderTarget);
  }
}
