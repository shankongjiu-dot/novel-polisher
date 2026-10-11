import JSZip from 'jszip'
import type { Chapter, Source } from '../types'


function textOf(doc: Document, selector: string): string {
  const el = doc.querySelector(selector)
  return el ? (el.textContent ?? '').trim() : ''
}

function extractParagraphs(doc: Document): string[] {
  const ps = Array.from(doc.querySelectorAll('p'))
  if (ps.length > 0) {
    return ps
      .map((p) => (p.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0)
  }
  const body = doc.body ?? doc.documentElement
  const raw = (body.textContent ?? '').replace(/\r\n?/g, '\n')
  return raw
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export async function parseEpub(file: File): Promise<{ text: string; chapters: Chapter[] }> {
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)

  const containerXml = await zip.file('META-INF/container.xml')?.async('string')
  if (!containerXml) throw new Error('无效的 EPUB：缺少 container.xml')

  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/)
  if (!opfPathMatch) throw new Error('无效的 EPUB：未找到 OPF 路径')
  const opfPath = opfPathMatch[1]
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const opfXml = await zip.file(opfPath)?.async('string')
  if (!opfXml) throw new Error('无效的 EPUB：未找到 OPF 文件')

  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml')

  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const item of Array.from(opfDoc.querySelectorAll('manifest > item'))) {
    const id = item.getAttribute('id') ?? ''
    const href = item.getAttribute('href') ?? ''
    const mediaType = item.getAttribute('media-type') ?? ''
    if (id) manifest.set(id, { href, mediaType })
  }

  const spineIds: string[] = []
  for (const ref of Array.from(opfDoc.querySelectorAll('spine > itemref'))) {
    const idref = ref.getAttribute('idref') ?? ''
    if (idref) spineIds.push(idref)
  }

  const parser = new DOMParser()
  const chapters: Chapter[] = []
  const textParts: string[] = []

  for (const id of spineIds) {
    const entry = manifest.get(id)
    if (!entry || !/x?html/i.test(entry.mediaType)) continue
    const hrefPath = opfDir + entry.href
    const xhtml = await zip.file(hrefPath)?.async('string')
    if (!xhtml) continue
    const doc = parser.parseFromString(xhtml, 'text/html')
    const title = textOf(doc, 'h1') || textOf(doc, 'h2') || textOf(doc, 'title')
    const paragraphs = extractParagraphs(doc)
    if (paragraphs.length === 0) continue
    const ch: Chapter = {
      id: `c${chapters.length}`,
      title: title || `第 ${chapters.length + 1} 节`,
      paragraphs,
    }
    chapters.push(ch)
    textParts.push(ch.title, ...ch.paragraphs, '')
  }

  if (chapters.length === 0) throw new Error('EPUB 内未提取到任何正文')

  return { text: textParts.join('\n\n').trim(), chapters }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function chapterToXhtml(ch: Chapter): string {
  const paras = ch.paragraphs
    .filter((p) => p.length > 0)
    .map((p) => `    <p>${xmlEscape(p)}</p>`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"/><title>${xmlEscape(ch.title)}</title></head>
<body>
  <h1>${xmlEscape(ch.title)}</h1>
${paras}
</body>
</html>`
}

export async function generateEpub(source: Source): Promise<Blob> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  const bookId = `urn:uuid:${source.fingerprint || Date.now().toString(16)}`
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const chapters = source.chapters

  const manifestItems: string[] = []
  const spineItems: string[] = []
  const navLi: string[] = []

  chapters.forEach((ch, i) => {
    const id = `ch${i + 1}`
    const href = `chapter-${i + 1}.xhtml`
    zip.file(`OEBPS/${href}`, chapterToXhtml(ch))
    manifestItems.push(
      `    <item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`,
    )
    spineItems.push(`    <itemref idref="${id}"/>`)
    navLi.push(
      `      <li><a href="${href}">${xmlEscape(ch.title)}</a></li>`,
    )
  })

  manifestItems.push(
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
  )

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${xmlEscape(source.name)}</title></head>
<body>
  <nav epub:type="toc">
    <h1>${xmlEscape(source.name)}</h1>
    <ol>
${navLi.join('\n')}
    </ol>
  </nav>
</body>
</html>`,
  )

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package version="3.0" unique-identifier="bookid" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${xmlEscape(bookId)}</dc:identifier>
    <dc:title>${xmlEscape(source.name)}</dc:title>
    <dc:language>zh</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
${manifestItems.join('\n')}
  </manifest>
  <spine>
${spineItems.join('\n')}
  </spine>
</package>`,
  )

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}