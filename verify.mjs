// Checks that index.html really is the app's current policy.
//
// THE RULE THIS FILE OBEYS: where a check asserts that two things agree, at
// least one side is READ, never described. The first draft of this verifier
// asserted the Arabic date-of-birth sentence against a phrase invented from
// memory in Modern Standard Arabic; the real text is Kuwaiti dialect, so a
// correct page failed. A test that describes what it expects is testing the
// author's recollection.
//
// So: the phrases that must be GONE are read out of the superseded page, and
// the phrases that must be PRESENT are read out of the app's source module.
//
// Usage:
//   node verify.mjs /path/to/max-ai/src/terms-content.js [old-page.html]

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const termsPath = process.argv[2]
const oldPath = process.argv[3]
if (!termsPath) {
  console.error('usage: node verify.mjs /path/to/max-ai/src/terms-content.js [old-page.html]')
  process.exit(1)
}

const src = await import(pathToFileURL(resolve(termsPath)).href)
const html = readFileSync(resolve(here, 'index.html'), 'utf8')

let failed = 0
const t = (label, ok, extra = '') => {
  console.log((ok ? '  ok   ' : ' FAIL  ') + label + (extra ? '   ' + extra : ''))
  if (!ok) failed++
}

// Markup out, entities back, whitespace flattened. Both sides of every text
// comparison below go through this, including the source, so a list item
// rendered as <li> compares equal to a "- " line.
const flat = (s) =>
  String(s)
    // Style and script CONTENTS are text too, and stripping only their tags
    // left ~3.9k of CSS and JS in the "visible" string. That silently broke
    // the no-extra-text check below, which is the one check whose whole job
    // is noticing content that is not in the policy.
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/^[-\s]+|\n\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const visible = flat(html)
const sourceText = flat(
  [
    src.TERMS_INTRO_EN,
    src.TERMS_INTRO_AR,
    ...src.TERMS_EN.flatMap((s) => [s.h, s.p]),
    ...src.TERMS_AR.flatMap((s) => [s.h, s.p]),
  ].join(' '),
)

// ── THE DENOMINATOR ───────────────────────────────────────────────────────
// Every check below reads `visible`. If that is not the document, they all
// pass over nothing and this file certifies an empty page.
console.log('— denominator —')
t('index.html is the document', html.length > 35000, `${html.length} bytes`)
t('visible text is substantial', visible.length > 30000, `${visible.length} chars`)
t('24 sections rendered', (html.match(/<section>/g) || []).length === 24, `${(html.match(/<section>/g) || []).length}`)

console.log('— version —')
const wantEn = `Version ${src.TERMS_VERSION} · Last updated ${src.TERMS_UPDATED}`
const wantAr = `الإصدار ${src.TERMS_VERSION} · آخر تحديث ${src.TERMS_UPDATED_AR}`
t('English meta matches the app', html.includes(wantEn), wantEn)
t('Arabic meta matches the app', html.includes(wantAr), wantAr)
// Three visible mentions, not more: the header meta, and the version line at
// the top of each language. The data-en/data-ar attribute copies are markup
// and are stripped, so counting them was wrong.
t('English intro carries the version', visible.includes(`Version ${src.TERMS_VERSION}`))
t('Arabic intro carries the version', visible.includes(`الإصدار ${src.TERMS_VERSION}`))
t('no stale version string anywhere', !/Version 1\.7|الإصدار 1\.7/.test(visible))

console.log('— nothing was dropped in generation —')
let verified = 0
for (const s of [...src.TERMS_EN, ...src.TERMS_AR]) {
  const body = flat(s.p)
  const head = body.slice(0, 90)
  const tail = body.slice(-90)
  if (!visible.includes(flat(s.h))) t(`heading present: ${s.h}`, false)
  else if (!visible.includes(head)) t(`section opens correctly: ${s.h}`, false, JSON.stringify(head))
  else if (!visible.includes(tail)) t(`section ends correctly: ${s.h}`, false, JSON.stringify(tail))
  else verified += 1
}
t('every section head and tail survived', verified === 24, `${verified}/24`)
t('no text beyond the source crept in', visible.length <= sourceText.length * 1.1, `${visible.length} vs ${sourceText.length}`)

console.log('— links —')
const hrefs = [...html.matchAll(/href="(http[^"]+)"/g)].map((x) => x[1])
t('external links were found', hrefs.length >= 2, `${hrefs.length}`)
t('no href swallowed sentence punctuation', !hrefs.some((h) => /[.,;:]$/.test(h)))
for (const u of new Set(hrefs)) {
  t(`link is in the source text: ${u}`, sourceText.includes(u))
}

// ── THE THREE CONTRADICTIONS ──────────────────────────────────────────────
// Read from the superseded page, not typed from memory. Skipped, loudly, if
// the old page is not supplied — a silent skip here is the whole point of the
// exercise going missing.
console.log('— the three contradictions against the app —')
if (!oldPath) {
  t('superseded page supplied for comparison', false, 'pass it as argv[3] or these checks do not run')
} else {
  const old = flat(readFileSync(resolve(oldPath), 'utf8'))
  t('superseded page loaded', old.length > 20000, `${old.length} chars`)

  const gone = [
    ['deletion by contacting us', 'You may request deletion of your account and data by contacting us'],
    ['date of birth listed as collected', 'profile information (name, email, gender, country, date of birth'],
    ['content goes only to Google Gemini', 'an AI service operated by Google, and only to Google Gemini'],
  ]
  for (const [label, phrase] of gone) {
    t(`the superseded page really said it: ${label}`, old.includes(phrase), 'if this fails, the phrase below proves nothing')
    t(`gone from the new page: ${label}`, !visible.includes(phrase))
  }

  // And the replacements are present — read out of the app's own text.
  const en4 = src.TERMS_EN.find((s) => s.h.startsWith('4.')).p
  const ar4 = src.TERMS_AR.find((s) => s.h.startsWith('4.')).p
  const sentence = (body, needle, before = 0, after = 90) => {
    const i = body.indexOf(needle)
    return i < 0 ? null : flat(body.slice(Math.max(0, i - before), i + after))
  }
  const replacements = [
    ['EN deletion is a button', sentence(en4, 'You can delete your account yourself')],
    ['AR deletion is a button', sentence(ar4, 'تقدر تحذف حسابك بنفسك')],
    ['EN date of birth not required', sentence(en4, 'we do not ask for your date of birth')],
    ['AR date of birth not required', sentence(ar4, 'ما نطلب تاريخ ميلادك')],
    ['EN screening service named', sentence(en4, 'where safety screening is enabled')],
  ]
  for (const [label, phrase] of replacements) {
    if (phrase === null) t(`the app's text contains: ${label}`, false, 'the phrase is not in terms-content.js — this check is pointed at nothing')
    else t(`present in the new page: ${label}`, visible.includes(phrase), JSON.stringify(phrase.slice(0, 60)))
  }
}

// ── THE SUPPORT PAGE ──────────────────────────────────────────────────────
// Apple's Support URL points here, so a reviewer who cannot sign in lands on
// it. Everything it must carry is asserted, and the delete instructions are
// compared against the labels the app actually renders — read from the app's
// strings module, not typed from memory. If a button is renamed in the app,
// this fails rather than leaving the support page telling people to tap
// something that is not there.
console.log('— support page —')
const support = readFileSync(resolve(here, 'support.html'), 'utf8')
const supportText = flat(support)
t('support.html exists and is a page', support.length > 6000, `${support.length} bytes`)
t('support text is substantial', supportText.length > 2000, `${supportText.length} chars`)

const strings = await import(pathToFileURL(resolve(dirname(resolve(termsPath)), 'i18n/strings.js')).href)
const ST = strings.STRINGS || strings.default
t("the app's strings module was read", Boolean(ST?.settings?.en?.dangerZone), ST?.settings?.en?.dangerZone || 'MISSING')

for (const lang of ['en', 'ar']) {
  const st = ST.settings[lang]
  for (const key of ['dangerZone', 'deleteAccount', 'deleteWord', 'deleteForever', 'title']) {
    const label = st[key]
    if (!label) { t(`app string exists: settings.${lang}.${key}`, false, 'cannot check a label the app does not define'); continue }
    t(`support page names the ${lang} "${label}"`, supportText.includes(label))
  }
}

t('contact email present', supportText.includes('maxcapitalkw@gmail.com'))
t('mailto link present', support.includes('mailto:maxcapitalkw@gmail.com'))
t('links to the policy', /href="index\.html"/.test(support))
t('links to the deletion page', /href="delete\.html"/.test(support))
t('links to the in-app terms', support.includes('https://maxaikw.com/terms'))
t('links to the services page', support.includes('https://maxaikw.com/services'))
t('both language panes present', /id="doc-en"/.test(support) && /id="doc-ar"/.test(support))
t('Arabic pane starts hidden, English does not', /id="doc-ar"[^>]*hidden/.test(support) && !/id="doc-en"[^>]*hidden/.test(support))
t('says what Aalim is', /What Aalim is/.test(support) && support.includes('شنو هو عالِم'))
t('says it can be wrong', /it can be wrong/.test(support) && support.includes('يمكن يغلط'))
t('no login is required to read it', !/login|sign in to|authenticate/i.test(supportText.replace(/cannot sign in|تسجّل دخول/g, '')))

// One stylesheet, two pages. Drift here is a visual break nobody would catch.
const styleOf = (html) => html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
t('support and policy share one stylesheet', styleOf(support) === styleOf(html), `${styleOf(support).length} vs ${styleOf(html).length} chars`)

// Every relative link must resolve to a file that exists in this repo — the
// support page is the one page a reviewer reaches when nothing else works.
for (const rel of new Set([...support.matchAll(/href="(?!https?:|mailto:|#)([^"]+)"/g)].map((x) => x[1]))) {
  let ok = true
  try { readFileSync(resolve(here, rel)) } catch { ok = false }
  t(`relative link resolves: ${rel}`, ok)
}

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
process.exit(failed === 0 ? 0 : 1)
