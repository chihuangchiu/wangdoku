#!/usr/bin/env node
/*
 * 由 index.template.html + seo-content.js 產生各語言靜態頁：
 *   en  → /index.html（根目錄，x-default）
 *   其他 → /<lang>/index.html （每頁自帶在地化 title/meta/og/hreflang 與底部說明）
 * 執行：node build-i18n.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./seo-content.js');

const BASE = 'https://wangdoku.netlify.app';
const ORDER = ['en', 'zh-Hant', 'zh-Hans', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru',
  'id', 'vi', 'th', 'hi', 'tr', 'it', 'pl', 'ar'];
const RTL = ['ar'];
const ROOT = __dirname;

const tpl = fs.readFileSync(path.join(ROOT, 'index.template.html'), 'utf8');

// HTML 屬性值跳脫（值以雙引號包住）
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// HTML 文字節點跳脫
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const urlFor = (lang) => lang === 'en' ? BASE + '/' : BASE + '/' + lang + '/';

function hreflangBlock() {
  const lines = [`  <link rel="alternate" hreflang="x-default" href="${BASE}/" />`];
  for (const lang of ORDER) lines.push(`  <link rel="alternate" hreflang="${lang}" href="${urlFor(lang)}" />`);
  return lines.join('\n');
}

function jsonld(lang) {
  const v = C[lang];
  const webApp = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'WangDoKu',
    alternateName: 'WangDoKu Dog Logic Puzzle',
    url: urlFor(lang),
    image: BASE + '/og-image.jpg',
    applicationCategory: 'GameApplication',
    genre: ['Logic puzzle', 'Star Battle', 'Queens puzzle'],
    operatingSystem: 'Any (web browser)',
    inLanguage: ORDER,
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: v.description,
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      [v.a.q1, v.a.a1], [v.a.q2, v.a.a2], [v.a.q3, v.a.a3], [v.a.q4, v.a.a4],
    ].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const wrap = (o) => '  <script type="application/ld+json">\n  ' + JSON.stringify(o, null, 2).replace(/\n/g, '\n  ') + '\n  </script>';
  return wrap(webApp) + '\n' + wrap(faq);
}

function footer(lang) {
  const a = C[lang].a;
  const li = (x) => `        <li>${text(x)}</li>`;
  return [
    '    <article>',
    `      <h2>${text(a.h1)}</h2>`,
    `      <p>${text(a.intro)}</p>`,
    `      <h2>${text(a.howtoH)}</h2>`,
    `      <p>${text(a.howtoLead)}</p>`,
    '      <ul>',
    li(a.li1), li(a.li2), li(a.li3),
    '      </ul>',
    `      <p>${text(a.howtoTail)}</p>`,
    `      <h2>${text(a.featuresH)}</h2>`,
    '      <ul>',
    li(a.f1), li(a.f2), li(a.f3), li(a.f4), li(a.f5),
    '      </ul>',
    `      <h2>${text(a.faqH)}</h2>`,
    `      <h3>${text(a.q1)}</h3>`, `      <p>${text(a.a1)}</p>`,
    `      <h3>${text(a.q2)}</h3>`, `      <p>${text(a.a2)}</p>`,
    `      <h3>${text(a.q3)}</h3>`, `      <p>${text(a.a3)}</p>`,
    `      <h3>${text(a.q4)}</h3>`, `      <p>${text(a.a4)}</p>`,
    '    </article>',
  ].join('\n');
}

function render(lang) {
  const v = C[lang];
  const wdLang = lang === 'en' ? 'null' : JSON.stringify(lang); // 根頁保留自動偵測；子頁鎖定該語言
  const repl = {
    LANG: lang,
    DIR: RTL.includes(lang) ? 'rtl' : 'ltr',
    WD_LANG_JS: wdLang,
    TITLE: attr(v.title),
    DESCRIPTION: attr(v.description),
    CANONICAL: urlFor(lang),
    OG_TITLE: attr(v.title),
    OG_DESC: attr(v.ogDesc),
    OG_LOCALE: v.locale,
    TW_DESC: attr(v.twDesc),
    HREFLANG: hreflangBlock(),
    JSONLD: jsonld(lang),
    FOOTER: footer(lang),
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in repl ? repl[k] : m));
}

function sitemap() {
  const altLinks = [`      <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/"/>`]
    .concat(ORDER.map((l) => `      <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l)}"/>`))
    .join('\n');
  const urls = ORDER.map((lang) => [
    '  <url>',
    `    <loc>${urlFor(lang)}</loc>`,
    '    <changefreq>weekly</changefreq>',
    `    <priority>${lang === 'en' ? '1.0' : '0.9'}</priority>`,
    altLinks,
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

let count = 0;
for (const lang of ORDER) {
  const html = render(lang);
  const outDir = lang === 'en' ? ROOT : path.join(ROOT, lang);
  if (lang !== 'en') fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  count++;
  console.log('  ✓', lang === 'en' ? 'index.html' : lang + '/index.html');
}
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap());
console.log('  ✓ sitemap.xml');
console.log(`\nBuilt ${count} localized pages + sitemap.`);
