<template>
  <div class="matrix-container h-full w-full relative overflow-hidden" aria-hidden="true">
    <canvas ref="canvasRef" class="matrix-canvas w-full h-full block"></canvas>
    <div class="scanlines"></div>
    <div class="vignette"></div>
    <div class="right-edge-fade"></div>
    <div class="glitch-line"></div>
    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>
    <div class="cyber-overlay">
      <div class="cyber-tagline">
        ACCESS PROTOCOL ACTIVE
        <span>▓▒░ AUTHENTICATION REQUIRED ░▒▓</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null

const CHARS = '日本語文字電脳未来世界機械人工知能量子暗号解読侵入防衛端末接続通信情報デジタルサイバーネット力夢幻影血炎光風水地天神鬼龍虎狐狼鳳凰玄武朱雀青龍白虎ΔΩΨλφ∞∑∫≈≡∈⊕⊗□△○◆◇▲▼░▒▓01'
const FONT_SIZE = 16
const TRAIL_LEN = 22

interface Column {
  x: number
  head: number
  trail: string[]
  interval: number
  tick: number
}

let columns: Column[] = []

function rndChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

function initColumns(w: number, h: number) {
  const num = Math.floor(w / FONT_SIZE)
  columns = Array.from({ length: num }, (_, i) => ({
    x: i * FONT_SIZE,
    head: Math.floor(Math.random() * -(h / FONT_SIZE)),
    trail: [],
    interval: 5 + Math.floor(Math.random() * 9),
    tick: Math.floor(Math.random() * 13),
  }))
}

function resize(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.offsetWidth
  const h = canvas.offsetHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  initColumns(w, h)
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.offsetWidth
  const h = canvas.offsetHeight

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#06000e'
  ctx.fillRect(0, 0, w, h)

  ctx.font = `${FONT_SIZE}px 'Share Tech Mono', monospace`
  ctx.imageSmoothingEnabled = false
  ctx.textBaseline = 'top'

  for (const col of columns) {
    col.tick++

    if (col.tick >= col.interval) {
      col.tick = 0
      col.head++
      col.trail.unshift(rndChar())
      if (col.trail.length > TRAIL_LEN) col.trail.length = TRAIL_LEN

      if (col.head * FONT_SIZE > h + TRAIL_LEN * FONT_SIZE) {
        col.head = -3 - Math.floor(Math.random() * 20)
        col.trail = []
        col.interval = 5 + Math.floor(Math.random() * 9)
      }
    }

    if (col.trail.length > 2 && Math.random() < 0.04) {
      const idx = 1 + Math.floor(Math.random() * (col.trail.length - 1))
      col.trail[idx] = rndChar()
    }

    for (let t = 0; t < col.trail.length; t++) {
      const y = (col.head - t) * FONT_SIZE
      if (y < -FONT_SIZE * 2 || y > h) continue

      if (t === 0) {
        ctx.shadowBlur = 10
        ctx.shadowColor = 'rgba(230, 160, 255, 0.9)'
        ctx.fillStyle = 'rgba(255, 240, 255, 1.0)'
      } else if (t === 1) {
        ctx.shadowBlur = 6
        ctx.shadowColor = 'rgba(180, 80, 255, 0.7)'
        ctx.fillStyle = 'rgba(210, 120, 255, 0.92)'
      } else {
        const p = (t - 2) / (TRAIL_LEN - 2)
        const inv = 1 - p
        ctx.shadowBlur = 0
        const r = Math.round(40 + 120 * Math.pow(inv, 1.6))
        const g = Math.round(5 + 35 * Math.pow(inv, 2.0))
        const b = Math.round(60 + 180 * Math.pow(inv, 1.3))
        const a = Math.pow(inv, 0.9) * 0.9
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`
      }

      ctx.fillText(col.trail[t], col.x, y)
    }
  }

  ctx.shadowBlur = 0
  rafId = requestAnimationFrame(draw)
}

onMounted(() => {
  if (canvasRef.value) {
    resize(canvasRef.value)
    rafId = requestAnimationFrame(draw)
    window.addEventListener('resize', () => canvasRef.value && resize(canvasRef.value))
  }
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  window.removeEventListener('resize', () => canvasRef.value && resize(canvasRef.value))
})
</script>

<style scoped>
.matrix-container {
  background: #06000e;
}

.scanlines {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent 50%,
    rgba(180, 80, 255, 0.04) 50%
  );
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 10;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle,
    transparent 40%,
    rgba(6, 0, 14, 0.7) 100%
  );
  pointer-events: none;
  z-index: 15;
}

.right-edge-fade {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 120px;
  background: linear-gradient(to right, #06000e 0%, transparent 100%);
  z-index: 20;
}

.glitch-line {
  position: absolute;
  width: 100%;
  height: 1px;
  background: rgba(220, 150, 255, 0.15);
  top: 30%;
  animation: glitch-v 8s infinite;
  z-index: 25;
}

@keyframes glitch-v {
  0%, 100% { transform: translateY(0); opacity: 0; }
  10% { opacity: 0.2; }
  11% { transform: translateY(400%); opacity: 0; }
  50% { transform: translateY(100%); opacity: 0.1; }
}

.corner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(180, 80, 255, 0.3);
  z-index: 30;
}
.corner-tl { top: 30px; left: 30px; border-right: 0; border-bottom: 0; }
.corner-tr { top: 30px; right: 30px; border-left: 0; border-bottom: 0; }
.corner-bl { bottom: 30px; left: 30px; border-right: 0; border-top: 0; }
.corner-br { bottom: 30px; right: 30px; border-left: 0; border-top: 0; }

.cyber-overlay {
  position: absolute;
  bottom: 60px;
  right: 60px;
  text-align: right;
  z-index: 40;
  pointer-events: none;
}

.cyber-tagline {
  font-family: 'Share Tech Mono', monospace;
  color: rgba(180, 80, 255, 0.6);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.cyber-tagline span {
  display: block;
  font-size: 14px;
  margin-top: 4px;
  color: rgba(220, 160, 255, 0.8);
  text-shadow: 0 0 8px rgba(180, 80, 255, 0.5);
}
</style>
