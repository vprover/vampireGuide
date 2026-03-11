// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import path from 'path';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {themes as prismThemes} from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readVampireVersion() {
  const fallback = {
    repo: 'https://github.com/vprover/vampire',
    tag: '',
    ref: '',
  };
  const versionPath = path.resolve(__dirname, '..', 'vampire-version.env');
  if (!fs.existsSync(versionPath)) return fallback;
  const raw = fs.readFileSync(versionPath, 'utf8');
  const entries = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
  );
  return {
    repo: entries.VAMPIRE_REPO || fallback.repo,
    tag: entries.VAMPIRE_TAG || fallback.tag,
    ref: entries.VAMPIRE_REF || fallback.ref,
  };
}

const vampireVersion = readVampireVersion();
const vampireShortRef = vampireVersion.ref ? vampireVersion.ref.slice(0, 8) : '';
const vampireTagHtml = vampireVersion.tag
  ? `<a href="${vampireVersion.repo}/releases/tag/${vampireVersion.tag}">${vampireVersion.tag}</a>`
  : '';
const vampireCommitHtml = vampireVersion.ref
  ? `<a href="${vampireVersion.repo}/commit/${vampireVersion.ref}">${vampireShortRef}</a>`
  : '';
const vampireFooterVersion = vampireTagHtml && vampireCommitHtml
  ? `Vampire WASM source: ${vampireTagHtml} (${vampireCommitHtml}).`
  : (vampireCommitHtml ? `Vampire WASM source: ${vampireCommitHtml}.` : '');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Online Vampire Guide',
  tagline: '',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://vprover.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/vampireGuide',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'vprover', // Usually your GitHub org/user name.
  projectName: 'vampireGuide', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/vprover/vampireGuide/edit/main/docusaurus-site',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: 'img/docusaurus-social-card.jpg',
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Vampire Guide',
        logo: {
          alt: 'Vampire Guide',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Tutorial',
          },
          {
            type: 'docSidebar',
            sidebarId: 'playgroundSidebar',
            position: 'left',
            label: 'Playground',
          },
          {
            to: 'proof-search-visualization',
            position: 'left',
            label: 'Proof Search Visualization',
          },
          {
            type: 'docSidebar',
            sidebarId: 'lecturesSidebar',
            position: 'left',
            label: 'Lectures',
          },
          {
            type: 'docSidebar',
            sidebarId: 'exercisesSidebar',
            position: 'left',
            label: 'Exercises',
          },
          {
            href: 'https://github.com/vprover/vampireGuide',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'light',
        links: [],
        copyright: `Copyright © ${new Date().getFullYear()}. Built with Docusaurus. ${vampireFooterVersion}`,
      },

      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),

    scripts: [
      {'src': '/vampireGuide/coi-serviceworker.min.js', 'type': 'text/javascript', defer:true},
      {
        src: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js',
        async: true
      },
      
      // Prism core (keeps window.Prism available for Prism-Live)
      {src: 'https://unpkg.com/prismjs@1/components/prism-core.min.js', defer: true},
      {src: 'https://unpkg.com/prismjs@1/plugins/keep-markup/prism-keep-markup.min.js', defer: true},
      
    ],

    stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
  
  ],
};

export default config;
