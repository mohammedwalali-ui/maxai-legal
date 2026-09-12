// Generates index.html (Privacy Policy & Terms) from the APP's own terms text.
//
// WHY THIS EXISTS. This page drifted to three live contradictions against the
// app while both were maintained by hand: it claimed content went "only to
// Google Gemini" after a screening service was added, it told users to delete
// their account "by contacting us" after the app grew an in-app delete, and it
// listed date of birth as collected after signup stopped asking for it. None
// of those was a wrong decision — they were two copies of one document, and
// only one of them got updated.
//
// So the page is no longer written. It is GENERATED from src/terms-content.js
// in the max-ai repo, which is the text the app itself renders and the text
// users actually consent to. Retyping it here is what broke it.
//
// Usage, from anywhere:
//   node build.mjs /path/to/max-ai/src/terms-content.js
//
// It takes the path as an argument rather than assuming a checkout layout,
// because the two repositories are cloned independently.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const termsPath = process.argv[2]
if (!termsPath) {
  console.error('usage: node build.mjs /path/to/max-ai/src/terms-content.js')
  process.exit(1)
}

const mod = await import(pathToFileURL(resolve(termsPath)).href)
const {
  TERMS_VERSION,
  TERMS_UPDATED,
  TERMS_UPDATED_AR,
  TERMS_INTRO_EN,
  TERMS_INTRO_AR,
  TERMS_EN,
  TERMS_AR,
} = mod

// A generator that emits an empty document is the failure this whole file is
// about, and it would look like a success. So refuse to write one.
for (const [name, value] of Object.entries({ TERMS_VERSION, TERMS_UPDATED, TERMS_UPDATED_AR, TERMS_INTRO_EN, TERMS_INTRO_AR })) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is missing or empty in ${termsPath}`)
}
if (!Array.isArray(TERMS_EN) || !Array.isArray(TERMS_AR)) throw new Error('TERMS_EN / TERMS_AR must be arrays')
if (TERMS_EN.length < 10) throw new Error(`TERMS_EN has only ${TERMS_EN.length} sections — that is not the document`)
if (TERMS_EN.length !== TERMS_AR.length) {
  throw new Error(`language mismatch: ${TERMS_EN.length} English sections vs ${TERMS_AR.length} Arabic`)
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Bare URLs in the source become links. Trailing sentence punctuation must not
// be swallowed into the href — a policy whose Google link 404s on a full stop
// is worse than one with no link at all.
const linkify = (s) =>
  s.replace(/https?:\/\/[^\s<>()]+[^\s<>().,;:]/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`)

const inline = (s) => linkify(esc(s))

// The source encodes structure in whitespace: a blank line starts a new block,
// and a line opening "- " is a list item. Consecutive items form one list.
function renderBody(p) {
  const out = []
  for (const block of String(p).split(/\n\n+/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean)
    let items = null
    for (const line of lines) {
      if (line.startsWith('- ')) {
        items = items || []
        items.push(`<li>${inline(line.slice(2))}</li>`)
        continue
      }
      if (items) { out.push(`<ul>${items.join('')}</ul>`); items = null }
      out.push(`<p>${inline(line)}</p>`)
    }
    if (items) out.push(`<ul>${items.join('')}</ul>`)
  }
  return out.join('\n      ')
}

const renderSections = (sections) =>
  sections
    .map((s) => `    <section>\n      <h2>${esc(s.h)}</h2>\n      ${renderBody(s.p)}\n    </section>`)
    .join('\n\n')

const renderIntro = (intro) =>
  `<p>${intro.split('\n').map((l) => inline(l.trim())).filter(Boolean).join('<br />')}</p>`

const shell = readFileSync(resolve(here, 'shell.html'), 'utf8')

const html = shell
  .replace(/\{\{VERSION\}\}/g, esc(TERMS_VERSION))
  .replace(/\{\{META_EN\}\}/g, esc(`Version ${TERMS_VERSION} · Last updated ${TERMS_UPDATED}`))
  .replace(/\{\{META_AR\}\}/g, esc(`الإصدار ${TERMS_VERSION} · آخر تحديث ${TERMS_UPDATED_AR}`))
  .replace('{{INTRO_EN}}', renderIntro(TERMS_INTRO_EN))
  .replace('{{INTRO_AR}}', renderIntro(TERMS_INTRO_AR))
  .replace('{{SECTIONS_EN}}', renderSections(TERMS_EN))
  .replace('{{SECTIONS_AR}}', renderSections(TERMS_AR))

if (html.includes('{{')) throw new Error('unreplaced placeholder left in output: ' + html.match(/\{\{\w+\}\}/)[0])

writeFileSync(resolve(here, 'index.html'), html)
console.log(`index.html written from ${termsPath}`)
console.log(`  version  ${TERMS_VERSION}`)
console.log(`  sections ${TERMS_EN.length} English, ${TERMS_AR.length} Arabic`)
console.log(`  bytes    ${html.length}`)
