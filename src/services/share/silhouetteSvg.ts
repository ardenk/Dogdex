import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Silhouette } from '../../components/Silhouette'

/** The same silhouette used in the app, as a standalone SVG data URL in the given color (for drawing on a canvas). */
export function silhouetteDataUrl(variant: string, color: string): string {
  const svg = renderToStaticMarkup(createElement(Silhouette, { variant }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" ')
    .replaceAll('currentColor', color)
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
