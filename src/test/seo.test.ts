/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Tests run from the project root. (jsdom replaces the global URL class, so file URLs don't work here.)
const read = (file: string) => readFileSync(resolve(process.cwd(), file))
const html = read('index.html').toString('utf8')
const meta = (attr: 'property' | 'name', key: string) => new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1]

describe('link previews', () => {
  it('has the Open Graph and Twitter tags for a large image card', () => {
    expect(meta('property', 'og:type')).toBe('website')
    expect(meta('property', 'og:title')).toMatch(/Dogdex/)
    expect(meta('property', 'og:description')).toBeTruthy()
    expect(meta('property', 'og:image')).toBe('__SITE_URL__/og-image.png')
    expect(meta('property', 'og:image:width')).toBe('1200')
    expect(meta('property', 'og:image:height')).toBe('630')
    expect(meta('property', 'og:image:alt')).toBeTruthy()
    expect(meta('name', 'twitter:card')).toBe('summary_large_image')
    expect(meta('name', 'twitter:image')).toBe('__SITE_URL__/og-image.png')
  })

  it('ships a real 1200 x 630 PNG that matches the declared size', () => {
    const png = read('public/og-image.png')
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
    expect(png.length).toBeLessThan(5 * 1024 * 1024) // crawlers such as Facebook and X reject very large images
  })
})
