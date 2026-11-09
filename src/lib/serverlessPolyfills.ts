/**
 * Serverless Environment Polyfills (Node.js / Vercel Lambda / Next.js)
 *
 * Ensures browser DOM / Canvas APIs (DOMMatrix, ImageData, Path2D, navigator)
 * required by PDF parsing engines (like pdfjs-dist / pdf-parse) are available
 * globally in headless serverless environments without requiring native binary
 * bindings such as @napi-rs/canvas.
 */

// 1. Polyfill DOMMatrix
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    get m11() { return this.a; }
    set m11(v: number) { this.a = v; }
    get m12() { return this.b; }
    set m12(v: number) { this.b = v; }
    m13 = 0;
    m14 = 0;

    get m21() { return this.c; }
    set m21(v: number) { this.c = v; }
    get m22() { return this.d; }
    set m22(v: number) { this.d = v; }
    m23 = 0;
    m24 = 0;

    m31 = 0;
    m32 = 0;
    m33 = 1;
    m34 = 0;

    get m41() { return this.e; }
    set m41(v: number) { this.e = v; }
    get m42() { return this.f; }
    set m42(v: number) { this.f = v; }
    m43 = 0;
    m44 = 1;

    is2D = true;
    get isIdentity() {
      return (
        this.a === 1 &&
        this.b === 0 &&
        this.c === 0 &&
        this.d === 1 &&
        this.e === 0 &&
        this.f === 0
      );
    }

    constructor(init?: any) {
      if (init && typeof init === 'object') {
        if (Array.isArray(init)) {
          if (init.length >= 6) {
            this.a = Number(init[0]) || 0;
            this.b = Number(init[1]) || 0;
            this.c = Number(init[2]) || 0;
            this.d = Number(init[3]) || 0;
            this.e = Number(init[4]) || 0;
            this.f = Number(init[5]) || 0;
          }
          if (init.length === 16) {
            this.a = Number(init[0]) || 0;
            this.b = Number(init[1]) || 0;
            this.c = Number(init[4]) || 0;
            this.d = Number(init[5]) || 0;
            this.e = Number(init[12]) || 0;
            this.f = Number(init[13]) || 0;
          }
        } else {
          if ('a' in init) this.a = Number(init.a) || 0;
          if ('b' in init) this.b = Number(init.b) || 0;
          if ('c' in init) this.c = Number(init.c) || 0;
          if ('d' in init) this.d = Number(init.d) || 0;
          if ('e' in init) this.e = Number(init.e) || 0;
          if ('f' in init) this.f = Number(init.f) || 0;
          if ('m11' in init) this.a = Number(init.m11) || 0;
          if ('m12' in init) this.b = Number(init.m12) || 0;
          if ('m21' in init) this.c = Number(init.m21) || 0;
          if ('m22' in init) this.d = Number(init.m22) || 0;
          if ('m41' in init) this.e = Number(init.m41) || 0;
          if ('m42' in init) this.f = Number(init.m42) || 0;
        }
      }
    }

    static fromMatrix(other: any) {
      return new DOMMatrixPolyfill(other);
    }

    static fromFloat32Array(array32: Float32Array) {
      return new DOMMatrixPolyfill(Array.from(array32));
    }

    static fromFloat64Array(array64: Float64Array) {
      return new DOMMatrixPolyfill(Array.from(array64));
    }

    translate(tx = 0, ty = 0) {
      this.e += tx * this.a + ty * this.c;
      this.f += tx * this.b + ty * this.d;
      return this;
    }

    scale(sx = 1, sy = sx) {
      this.a *= sx;
      this.b *= sx;
      this.c *= sy;
      this.d *= sy;
      return this;
    }

    multiply(other: any) {
      if (!other) return this;
      const oa = other.a ?? 1;
      const ob = other.b ?? 0;
      const oc = other.c ?? 0;
      const od = other.d ?? 1;
      const oe = other.e ?? 0;
      const of = other.f ?? 0;

      const a = this.a * oa + this.c * ob;
      const b = this.b * oa + this.d * ob;
      const c = this.a * oc + this.c * od;
      const d = this.b * oc + this.d * od;
      const e = this.a * oe + this.c * of + this.e;
      const f = this.b * oe + this.d * of + this.f;

      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }

    multiplySelf(other: any) {
      return this.multiply(other);
    }

    preMultiplySelf(other: any) {
      if (!other) return this;
      const oa = other.a ?? 1;
      const ob = other.b ?? 0;
      const oc = other.c ?? 0;
      const od = other.d ?? 1;
      const oe = other.e ?? 0;
      const of = other.f ?? 0;

      // Mathematically correct product: M_other * M_this
      const a = oa * this.a + oc * this.b;
      const b = ob * this.a + od * this.b;
      const c = oa * this.c + oc * this.d;
      const d = ob * this.c + od * this.d;
      const e = oa * this.e + oc * this.f + oe;
      const f = ob * this.e + od * this.f + of;

      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }

    invertSelf() {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) return this;
      const a = this.d / det;
      const b = -this.b / det;
      const c = -this.c / det;
      const d = this.a / det;
      const e = (this.c * this.f - this.d * this.e) / det;
      const f = (this.b * this.e - this.a * this.f) / det;

      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }

    setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.e = e;
      this.f = f;
      return this;
    }

    transformPoint(p: { x: number; y: number }) {
      return {
        x: p.x * this.a + p.y * this.c + this.e,
        y: p.x * this.b + p.y * this.d + this.f
      };
    }

    toFloat32Array() {
      return new Float32Array([
        this.a, this.b, 0, 0,
        this.c, this.d, 0, 0,
        0, 0, 1, 0,
        this.e, this.f, 0, 1
      ]);
    }

    toFloat64Array() {
      return new Float64Array([
        this.a, this.b, 0, 0,
        this.c, this.d, 0, 0,
        0, 0, 1, 0,
        this.e, this.f, 0, 1
      ]);
    }
  }

  (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
}

// 2. Polyfill Path2D
if (typeof (globalThis as any).Path2D === 'undefined') {
  class Path2DPolyfill {
    constructor(path?: any) {}
    addPath(path?: any, transform?: any) {}
    closePath() {}
    moveTo(x?: number, y?: number) {}
    lineTo(x?: number, y?: number) {}
    bezierCurveTo(
      cp1x?: number,
      cp1y?: number,
      cp2x?: number,
      cp2y?: number,
      x?: number,
      y?: number
    ) {}
    quadraticCurveTo(cpx?: number, cpy?: number, x?: number, y?: number) {}
    arc(
      x?: number,
      y?: number,
      radius?: number,
      startAngle?: number,
      endAngle?: number,
      counterclockwise?: boolean
    ) {}
    arcTo(x1?: number, y1?: number, x2?: number, y2?: number, radius?: number) {}
    ellipse(
      x?: number,
      y?: number,
      radiusX?: number,
      radiusY?: number,
      rotation?: number,
      startAngle?: number,
      endAngle?: number,
      counterclockwise?: boolean
    ) {}
    rect(x?: number, y?: number, w?: number, h?: number) {}
  }

  (globalThis as any).Path2D = Path2DPolyfill;
}

// 3. Polyfill ImageData
if (typeof (globalThis as any).ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = 'srgb';

    constructor(widthOrData: any, widthOrHeight: number, maybeHeight?: number) {
      if (widthOrData instanceof Uint8ClampedArray) {
        this.data = widthOrData;
        this.width = Number(widthOrHeight) || 0;
        this.height =
          Number(maybeHeight) ||
          (this.width > 0 ? widthOrData.length / (this.width * 4) : 0);
      } else {
        this.width = Number(widthOrData) || 0;
        this.height = Number(widthOrHeight) || 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  }

  (globalThis as any).ImageData = ImageDataPolyfill;
}

// 4. Ensure navigator language is available for pdfjs-dist
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = {
    language: 'en-US',
    languages: ['en-US'],
    userAgent: 'Node'
  };
}

export const isServerlessPolyfilled = true;
