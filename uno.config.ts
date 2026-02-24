import type { Postprocessor } from 'unocss'
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
    // util.entries is [property, value][]
    for (const entry of util.entries) {
      const value = entry[1]
      if (typeof value !== 'string' || !pxRegex.test(value)) continue

      // Reset lastIndex for global regex reuse
      pxRegex.lastIndex = 0
      console.log('Manipulating value')
      entry[1] = value.replace(pxRegex, (_, pxValue: string) => {
        const numericPx = Number(pxValue)
        if (!Number.isFinite(numericPx)) return _
        const remValue = numericPx / baseFontSize
        return `${remValue}rem`
      })
    }
  }
}

export default defineConfig({
  postprocess: [createPxToRemPostprocessor(16)],
  theme: {
    colors: {
      slate: '#161925',
      panel: '#1A1E2D',
      accent: '#B67EE6',
      accentButton: '#8854C0',
      accentHover: '#A36FDB',
      deepText: '#ECEAFF',
      subtleText: '#B3B3E6',
      codeBg: '#131422',
      borderMuted: '#55437B',
      error: '#E74C5C',
      warning: '#F59E0B',
      headingText: '#dcd8ff',
      bodyText: '#f6f4ff',
    },
    fontFamily: {
      onest: 'Onest, sans-serif',
      mono: 'Victor Mono, monospace',
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
        width: '1em',
        height: '1em',
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
  transformers: [transformerDirectives()],
})
