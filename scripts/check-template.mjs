#!/usr/bin/env node
/**
 * Fail while the repository still carries template placeholders.
 *
 * This runs first in CI, ahead of the Windows build, because a repository that
 * has not been through `npm run setup` fails everything downstream for one
 * reason — and the reason is much easier to read here than in an msbuild log.
 *
 * It also does a light structural read of `pcfhub.json`: enough to catch the
 * mistakes that would otherwise be discovered by an ingestion run failing on
 * the hub. Deliberately *not* a copy of the hub's schema — PCFHub's
 * `ManifestValidator` is the one definition of that contract, and a second copy
 * here would drift, then disagree, and the one nothing executes always loses.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'bin', 'obj', 'generated']);

// The setup script names every token it replaces, so it always "contains
// placeholders" — it is the thing that removes them.
const SKIP_PATHS = new Set(['scripts/setup.mjs', 'scripts/check-template.mjs']);

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|mp4|webm|zip|ico|woff2?)$/i;

const PLACEHOLDER = /__[A-Z][A-Z0-9_]*__/g;

const problems = [];

// ------------------------------------------------------------- placeholders

for (const path of walk(root)) {
    const relative = path.slice(root.length + 1).replace(/\\/g, '/');

    if (SKIP_PATHS.has(relative)) {
        continue;
    }

    const found = new Set();

    if (!SKIP_EXTENSIONS.test(path)) {
        for (const match of readFileSync(path, 'utf8').matchAll(PLACEHOLDER)) {
            found.add(match[0]);
        }
    }

    for (const match of basename(path).matchAll(PLACEHOLDER)) {
        found.add(match[0]);
    }

    if (found.size > 0) {
        problems.push(`${relative} still contains ${[...found].join(', ')}`);
    }
}

if (problems.length > 0) {
    console.error('\nThis repository is still the template. Run:\n\n  npm run setup\n');
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    console.error('');
    process.exit(1);
}

// -------------------------------------------------------------- pcfhub.json

let manifest;

try {
    manifest = JSON.parse(readFileSync(join(root, 'pcfhub.json'), 'utf8'));
} catch (error) {
    fail(`pcfhub.json is not readable as JSON: ${error.message}`);
}

const required = ['schemaVersion', 'slug', 'name', 'control'];

for (const key of required) {
    if (manifest[key] === undefined) {
        problems.push(`pcfhub.json is missing "${key}".`);
    }
}

for (const key of ['namespace', 'constructor', 'type']) {
    if (manifest.control?.[key] === undefined) {
        problems.push(`pcfhub.json is missing "control.${key}".`);
    }
}

// The path is declared rather than discovered, so a typo in it costs the whole
// API reference — every release imports with no properties at all.
const manifestPath = manifest.control?.manifestPath;

if (manifestPath && !exists(join(root, manifestPath))) {
    problems.push(`pcfhub.json points control.manifestPath at "${manifestPath}", which does not exist.`);
}

// ------------------------------------------------------- the control shape
//
// `control.type` and `control.framework` are the repository claiming what the
// control is. The hub re-derives the type from the manifest at every release
// regardless, so a disagreement changes nothing on the hub and quietly misleads
// every reader of the repository — which is precisely the class of mistake that
// survives a review, because nothing fails.
//
// Still a light structural read: the manifest is matched, not parsed.

const TYPES = ['field', 'dataset', 'virtual'];
const FRAMEWORKS = ['standard', 'react', 'react_virtual'];

const type = manifest.control?.type;
const framework = manifest.control?.framework;

if (type !== undefined && !TYPES.includes(type)) {
    problems.push(`pcfhub.json has control.type "${type}". Expected one of: ${TYPES.join(', ')}.`);
}

if (framework !== undefined && !FRAMEWORKS.includes(framework)) {
    problems.push(
        `pcfhub.json has control.framework "${framework}". Expected one of: ${FRAMEWORKS.join(', ')}.`,
    );
}

if (manifestPath && exists(join(root, manifestPath))) {
    const xml = readFileSync(join(root, manifestPath), 'utf8');
    const declared = /control-type\s*=\s*"([^"]*)"/.exec(xml)?.[1] ?? '';

    // The hub's ControlManifestParser resolves dataset -> virtual -> field, in
    // that order. So a virtual *dataset* control records as "dataset" and a
    // virtual *field* control records as "virtual".
    const derived = /<data-set[\s>]/.test(xml)
        ? 'dataset'
        : declared === 'virtual'
          ? 'virtual'
          : 'field';

    if (type !== undefined && TYPES.includes(type) && type !== derived) {
        problems.push(
            `pcfhub.json says control.type is "${type}", but ${manifestPath} describes a "${derived}" control. ` +
            'The hub derives it from the manifest at every release, so the manifest wins.',
        );
    }

    if (framework === 'react_virtual' && declared !== 'virtual') {
        problems.push(
            `pcfhub.json says control.framework is "react_virtual", but ${manifestPath} has ` +
            `control-type="${declared}". A React virtual control needs control-type="virtual" and the ` +
            'React/Fluent <platform-library> entries.',
        );
    }

    if (framework === 'standard' && declared === 'virtual') {
        problems.push(
            `pcfhub.json says control.framework is "standard", but ${manifestPath} has control-type="virtual".`,
        );
    }
}

// The hub reads docs from the default branch and reports any file it does not
// recognise, so a misnamed page is published nowhere and mentioned only in an
// ingestion run nobody is watching.
const SECTIONS = [
    'overview.md', 'installation.md', 'canvas.md', 'model-driven.md', 'api.md',
    'examples.md', 'limitations.md', 'faq.md', 'migration.md',
];

const docsPath = manifest.docs?.path ?? 'docs';

if (exists(join(root, docsPath))) {
    for (const entry of readdirSync(join(root, docsPath))) {
        if (entry.endsWith('.md') && !SECTIONS.includes(entry.toLowerCase())) {
            problems.push(
                `${docsPath}/${entry} is not one of the hub's sections and would be skipped. ` +
                `Expected one of: ${SECTIONS.join(', ')}.`,
            );
        }
    }

    if (exists(join(root, docsPath, 'changelog.md'))) {
        problems.push(
            `${docsPath}/changelog.md is ignored — the hub builds the changelog from release notes.`,
        );
    }
} else {
    problems.push(`No ${docsPath}/ directory, so this component would publish with no documentation.`);
}

// ------------------------------------------------------------------- media
//
// A missing image is one of the quietest failures the hub has: ingestion drops
// the file and the component page renders without it, with nothing in the
// repository to suggest anything is wrong. It costs a `statSync` to catch here.
//
// Only paths declared in pcfhub.json are checked. Images referenced from the
// docs are the hub's to resolve at render time, and guessing at Markdown here
// would produce false failures.

const media = [
    ...(manifest.media?.logo ? [['media.logo', manifest.media.logo]] : []),
    ...(manifest.media?.screenshots ?? []).map((path, index) => [`media.screenshots[${index}]`, path]),
];

for (const [key, path] of media) {
    if (!exists(join(root, path))) {
        problems.push(`pcfhub.json names ${key} as "${path}", which does not exist.`);
    }
}

// --------------------------------------------------------------------- demo
//
// `fidelity` decides whether the hub runs the control at all, and only the
// author knows which value is true. What can be checked is that it is one of
// the four, and that "limited" carries the explanation that is its entire
// point — an unexplained "limited" tells a visitor the demo is broken without
// telling them how.

const FIDELITIES = ['full', 'mocked', 'limited', 'none'];
const fidelity = manifest.demo?.fidelity;

if (fidelity !== undefined && !FIDELITIES.includes(fidelity)) {
    problems.push(
        `pcfhub.json has demo.fidelity "${fidelity}". Expected one of: ${FIDELITIES.join(', ')}.`,
    );
}

if (fidelity === 'limited' && !(manifest.demo?.limitations?.length > 0)) {
    problems.push(
        'pcfhub.json sets demo.fidelity to "limited" but lists no demo.limitations. ' +
        'Name each interaction that does not work in the demo, and why.',
    );
}

// The demo bundle is written by the build, so it is only checked when one has
// already run — otherwise a clean checkout would fail for having built nothing.
const demoPaths = [
    ...(manifest.demo?.bundle ? [['demo.bundle', manifest.demo.bundle]] : []),
    ...(manifest.demo?.styles ?? []).map((path, index) => [`demo.styles[${index}]`, path]),
];

if (fidelity && fidelity !== 'none' && exists(join(root, 'out'))) {
    for (const [key, path] of demoPaths) {
        if (!exists(join(root, path))) {
            problems.push(
                `pcfhub.json names ${key} as "${path}", which the build did not produce. ` +
                'The path is out/controls/<Constructor>/… — the constructor alone, with no namespace prefix.',
            );
        }
    }
}

if (problems.length > 0) {
    console.error('');
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    console.error('');
    process.exit(1);
}

console.log(
    'Template adopted, pcfhub.json readable, control shape agrees with the manifest, ' +
        'docs named correctly, media present.',
);

// ------------------------------------------------------------------ helpers

function* walk(dir) {
    for (const entry of readdirSync(dir).sort()) {
        if (SKIP_DIRS.has(entry)) {
            continue;
        }

        const path = join(dir, entry);

        if (statSync(path).isDirectory()) {
            yield* walk(path);
        } else {
            yield path;
        }
    }
}

function exists(path) {
    try {
        statSync(path);

        return true;
    } catch {
        return false;
    }
}

function fail(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}
