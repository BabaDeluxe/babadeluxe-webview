import type { Postprocessor, Rule } from 'unocss'
import {
  defineConfig,
  presetWind4,
  presetWebFonts,
  presetIcons,
  transformerDirectives,
} from 'unocss'
import type { IconifyJSON } from '@iconify/types'

const createPxToRemPostprocessor = (baseFontSize = 16): Postprocessor => {
  const pxRegex = /(-?[\d.]+)px/g

  return (util) => {
    for (const entry of util.entries) {
      const value = entry[1]
      if (typeof value !== 'string' || !pxRegex.test(value)) continue

      pxRegex.lastIndex = 0

      entry[1] = value.replace(pxRegex, (_, pxValue: string) => {
        const numericPx = Number(pxValue)
        if (!Number.isFinite(numericPx)) return _
        const remValue = numericPx / baseFontSize
        return `${remValue}rem`
      })
    }
  }
}

const cssZoomRules: Rule[] = [
  // zoom-1.5 => zoom: 1.5
  [
    /^zoom-(\d+(?:\.\d+)?)$/,
    ([, v]) => ({
      zoom: v,
    }),
  ],
]

export default defineConfig({
  postprocess: [createPxToRemPostprocessor(16)],
  theme: {
    colors: {
      slate: 'var(--color-slate)',
      panel: 'var(--color-panel)',
      accent: 'var(--color-accent)',
      accentButton: 'var(--color-accent-button)',
      accentHover: 'var(--color-accent-hover)',
      deepText: 'var(--color-deep-text)',
      subtleText: 'var(--color-subtle-text)',
      codeBg: 'var(--color-code-bg)',
      borderMuted: 'var(--color-border-muted)',
      error: 'var(--color-error)',
      warning: 'var(--color-warning)',
      headingText: 'var(--color-heading-text)',
      bodyText: 'var(--color-body-text)',
    },
    fontFamily: {
      onest: 'Onest, Roboto, Arial Nova, Arial, sans-serif',
      mono: 'Victor Mono, Lucida Console, Consolas, monospace',
    },
  },
  extendTheme: (theme) => {
    return {
      ...theme,
      breakpoint: {
        ...theme.breakpoint,
        xs: '400px',
        mobile: '500px',
      },
    }
  },
  presets: [
    presetWind4({
      preflights: {
        reset: true,
      },
    }),
    presetWebFonts({
      fonts: {
        onest: 'Onest',
        mono: 'Victor Mono',
      },
    }),
    presetIcons({
      extraProperties: {
        width: '18px',
        height: '18px',
        display: 'inline-flex',
        'justify-content': 'center',
        'align-items': 'center',
        'flex-shrink': '0',
      },
      prefix: 'i-',
      warn: true,
      collections: {
        bi: async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/bi/icons.json')).default as IconifyJSON,
        weui: async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/weui/icons.json')).default as IconifyJSON,
        'ant-design': async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/ant-design/icons.json')).default as IconifyJSON,
        fluent: async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/fluent/icons.json')).default as IconifyJSON,
        ri: async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/ri/icons.json')).default as IconifyJSON,
        hugeicons: async (): Promise<IconifyJSON> =>
          (await import('@iconify-json/hugeicons/icons.json')).default as IconifyJSON,
      },
    }),
  ],
  rules: [...cssZoomRules],
  transformers: [transformerDirectives()],
})
