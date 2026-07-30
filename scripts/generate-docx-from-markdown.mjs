import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeInline(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
}

function paragraphXml(text, style = null) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''

  if (!text) {
    return `<w:p>${styleXml}</w:p>`
  }

  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

function buildDocumentXml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const paragraphs = []
  let firstHeadingHandled = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()

    if (!line.trim()) {
      paragraphs.push(paragraphXml(''))
      continue
    }

    if (line.startsWith('### ')) {
      paragraphs.push(paragraphXml(normalizeInline(line.slice(4)), 'Heading3'))
      continue
    }

    if (line.startsWith('## ')) {
      paragraphs.push(paragraphXml(normalizeInline(line.slice(3)), 'Heading2'))
      continue
    }

    if (line.startsWith('# ')) {
      paragraphs.push(paragraphXml(normalizeInline(line.slice(2)), firstHeadingHandled ? 'Heading1' : 'Title'))
      firstHeadingHandled = true
      continue
    }

    paragraphs.push(paragraphXml(normalizeInline(line)))
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${paragraphs.join('\n    ')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:after="120"/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="120" w:after="240"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="34"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="180" w:after="80"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="24"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr>
      <w:spacing w:before="120" w:after="60"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="22"/>
    </w:rPr>
  </w:style>
</w:styles>`
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
}

function buildPackageRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
}

function buildDocumentRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

function buildCoreXml(title) {
  const now = new Date().toISOString()
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>OpenCode</dc:creator>
  <cp:lastModifiedBy>OpenCode</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`
}

function buildAppXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>OpenCode</Application>
</Properties>`
}

function toPowerShellLiteral(value) {
  return String(value).replace(/'/g, "''")
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2)

  if (!inputArg || !outputArg) {
    throw new Error('Uso: node scripts/generate-docx-from-markdown.mjs <input.md> <output.docx>')
  }

  const inputPath = path.resolve(inputArg)
  const outputPath = path.resolve(outputArg)
  const markdown = await fs.readFile(inputPath, 'utf8')
  const title = markdown.split(/\r?\n/).find((line) => line.startsWith('# '))?.slice(2).trim() || 'Documento'
  const tempRoot = path.join('C:\\Users\\vasqu\\AppData\\Local\\Temp\\opencode', `docx-${Date.now()}`)

  await writeFileEnsured(path.join(tempRoot, '[Content_Types].xml'), buildContentTypesXml())
  await writeFileEnsured(path.join(tempRoot, '_rels', '.rels'), buildPackageRelsXml())
  await writeFileEnsured(path.join(tempRoot, 'docProps', 'core.xml'), buildCoreXml(title))
  await writeFileEnsured(path.join(tempRoot, 'docProps', 'app.xml'), buildAppXml())
  await writeFileEnsured(path.join(tempRoot, 'word', 'document.xml'), buildDocumentXml(markdown))
  await writeFileEnsured(path.join(tempRoot, 'word', 'styles.xml'), buildStylesXml())
  await writeFileEnsured(path.join(tempRoot, 'word', '_rels', 'document.xml.rels'), buildDocumentRelsXml())
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  const command = [
    `$src = '${toPowerShellLiteral(tempRoot)}'`,
    `$dst = '${toPowerShellLiteral(outputPath)}'`,
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    'if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }',
    '[System.IO.Compression.ZipFile]::CreateFromDirectory($src, $dst)',
  ].join('; ')

  execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'inherit' })
  await fs.rm(tempRoot, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
