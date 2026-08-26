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

// The adoption scripts name every token they replace, so they always "contain
// placeholders" — they are the things that remove them. setup.mjs deletes
// adopt.mjs on adoption, but a repo may still be mid-flight when this runs.
const SKIP_PATHS = new Set(['scripts/setup.mjs', 'scripts/adopt.mjs', 'scripts/check-template.mjs']);

const SKIP_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|mp4|webm|zip|ico|woff2?)$/i;

const PLACEHOLDER = /__[A-Z][A-Z0-9_]*__/g;

/*
 * Overridable so this can be run against a local hub while developing the
 * validator itself — `PCFHUB_URL=http://localhost:8000 npm run check`.
 */
const HUB = (process.env.PCFHUB_URL ?? 'https://pcfhub.dev').replace(/\/+$/, '');

// Short. This runs in front of a Windows solution pack that takes minutes, and
// a hub that is slow to answer should cost seconds and a warning, not a stalled
// build.
const HUB_TIMEOUT_MS = 10_000;

const problems = [];

/*
 * Findings that print but do not fail. Everything in `problems` is something
 * the hub or the build will get wrong; a warning is something a human should
 * look at, reached by a heuristic that can be wrong. Keeping the two apart is
 * the point — a check that fails on a guess gets disabled, and takes the
 * reliable checks with it.
 */
const warnings = [];

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
    /*
     * Two different failures wear the same shape.
     *
     * A repository that has not been through setup carries placeholders
     * everywhere. A repository that has carries them only where a human still
     * has to write something — the README's three hand-written sections. Both
     * are placeholders; telling the second one to run `npm run setup` sends
     * somebody to re-run a script that will not help.
     */
    const onlyProse = problems.every((problem) => problem.startsWith('README.md'));

    console.error(onlyProse
        ? '\nThe README still has sections to write. Replace each placeholder with\n'
            + 'prose, and delete the comment explaining what belongs there:\n'
        : '\nThis repository is still the template. Run:\n\n  npm run setup\n');

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

// ------------------------------------------------ the hub's own rules
//
// Asked, not reimplemented. This file's opening comment has always said
// PCFHub's ManifestValidator is the one definition of the pcfhub.json contract
// and that a second copy here would drift — and then, over several phases, a
// second copy grew here anyway: required keys, the control-type and framework
// enums, the demo-host rules. All of it accurate when written, all of it
// one hub change away from disagreeing with the thing that actually decides.
//
// P6 gave the hub an endpoint for exactly this, so those checks are gone and
// this asks instead. What stays below is only what the hub genuinely cannot
// see: files on disk, and pcfhub.json's claims measured against the
// ControlManifest.Input.xml sitting next to it.
const hub = await askTheHub(manifest);

if (hub.reachable) {
    for (const issue of hub.errors) {
        problems.push(`pcfhub.json ${issue.pointer || '/'} — ${issue.message}`);
    }

    for (const issue of hub.warnings) {
        warnings.push(`pcfhub.json ${issue.pointer || '/'} — ${issue.message}`);
    }
} else {
    /*
     * A warning, not a failure. The hub being unreachable is not evidence that
     * this repository is wrong, and failing a release build because someone
     * else's site is down would teach people to pass --no-verify. The manifest
     * is validated again at ingestion regardless, so the worst case is finding
     * out a few minutes later instead of now.
     */
    warnings.push(
        `Could not reach ${HUB} to validate pcfhub.json (${hub.reason}). `
        + 'The structural checks below still ran; the schema itself was not verified. '
        + 'Set PCFHUB_URL to point at a different hub.',
    );
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

// Membership in these two lists is the hub's to enforce; they are kept here
// only because the manifest cross-check below needs to know the vocabulary.

// Hoisted, because the demo-host checks further down need the manifest too —
// a grid host has a hard requirement on <platform-library name="React" />.
let manifestXml = null;

if (manifestPath && exists(join(root, manifestPath))) {
    const xml = readFileSync(join(root, manifestPath), 'utf8');
    manifestXml = xml;
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

// ------------------------------------------------------- declared features
//
// Every <uses-feature> becomes an install-time permission prompt for the
// customer, so a control that declares a feature it never calls is asking for
// consent it does not need. That costs nothing to detect and is invisible
// otherwise: nothing fails, the prompt just appears.
//
// Note this is *not* the stock `pac pcf init` manifest, which ships the
// feature list inside an <!-- UNCOMMENT TO ENABLE --> block. Those are not
// declared and cost nothing. This fires only on a feature-usage block someone
// actually enabled and then stopped using.
//
// A warning rather than a problem, because this is a regex over source and a
// feature can be reached in ways it cannot see — destructured off `context`,
// or from a helper outside the control directory. The test is deliberately
// weak: the accessor name appearing *anywhere* in the control sources,
// comments included, is enough to stay quiet. Over-matching costs a missed
// warning; under-matching would fail a build that is fine.

const ACCESSORS = { WebAPI: 'webAPI', Utility: 'utils' };

if (manifestPath && exists(join(root, manifestPath))) {
    // Comments stripped first. A commented-out <uses-feature> is not declared,
    // and this template ships its examples inside a comment — scanning the raw
    // file would warn about every freshly scaffolded control, which is the
    // fastest way to teach people to ignore the warning.
    const xml = readFileSync(join(root, manifestPath), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const declared = [...xml.matchAll(/<uses-feature\s+name="([^"]+)"/g)].map((match) => match[1]);

    if (declared.length > 0) {
        const controlDir = manifestPath.split(/[\\/]/)[0];
        let sources = '';

        for (const path of walk(join(root, controlDir))) {
            if (/\.tsx?$/.test(path)) {
                sources += readFileSync(path, 'utf8');
            }
        }

        // Every Device.* feature is reached through the one accessor, so they
        // stand or fall together. A feature this map does not know is skipped
        // rather than guessed at.
        const unused = declared.filter((feature) => {
            const accessor = feature.startsWith('Device.') ? 'device' : ACCESSORS[feature];

            return accessor !== undefined && !new RegExp(`\\b${accessor}\\b`).test(sources);
        });

        if (unused.length > 0) {
            warnings.push(
                `${manifestPath} declares ${unused.length} <uses-feature> that nothing appears to use: ` +
                `${unused.join(', ')}. Each one is an install-time permission prompt for the customer. ` +
                'Delete the ones the control does not call.',
            );
        }
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
    /*
     * The video trio too. `captions` arrived with P6, and a captions track that
     * points at nothing is the worst of the three to lose silently: the video
     * still plays, so nothing looks broken, and the only people who notice are
     * the ones who cannot hear it.
     */
    ...(manifest.media?.video ? [['media.video', manifest.media.video]] : []),
    ...(manifest.media?.poster ? [['media.poster', manifest.media.poster]] : []),
    ...(manifest.media?.captions ? [['media.captions', manifest.media.captions]] : []),
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

// Both of those are the hub's rules and it reports them by JSON Pointer, so
// they are not repeated here. What is left is reading the value, because the
// local file checks below still need to know it.
const fidelity = manifest.demo?.fidelity;

// The fixture is the entire dataset the demo runs against, and it is committed
// source rather than build output — so unlike demo.bundle below, there is no
// "clean checkout has not built yet" case to exempt. A typo costs the whole
// demo: the hub notes it in an ingestion run nobody is watching and the control
// renders no rows.
const datasetFixture = manifest.demo?.datasetFixture;

if (datasetFixture && !exists(join(root, datasetFixture))) {
    problems.push(
        `pcfhub.json names demo.datasetFixture as "${datasetFixture}", which does not exist.`,
    );
}

// ---------------------------------------------------------------- demo host
//
// Which surface the harness stands up around the control: `form` (the default,
// and every demo before the key existed) or `grid`, for a grid customizer,
// where the harness renders a grid over the fixture and the control's overrides
// draw and edit its cells.
//
// Declared, never inferred, and the hub says why: the only sniffable signal is
// "has a bound SingleLine.Text property", which is true of a great many
// ordinary field controls. Every rule below mirrors the hub's own
// ManifestValidator — keep them in step, because a local check that disagrees
// with the ingester is worse than no local check.

// Read, not validated — the hub owns whether the value is legal. Kept because
// nothing below needs it any more except to stay readable if a rule returns.
const host = manifest.demo?.host ?? 'form';

// Deliberately not checked: that a dataset control *has* a fixture. A dataset
// control with fidelity "none" is a legitimate state, and a rule forcing one
// would be wrong more often than right.
//
// Two shapes read a fixture, not one. A dataset control receives it as its
// bound dataset property; a grid customizer has no dataset property at all —
// there the fixture is the *grid's* rows, and the control only decides how
// their cells look. Miss the second and this check fails a correct repository.

// The inverse, and the one that produces a demo which looks fine and is empty.
// A grid with no rows is a legitimate authored state — an unconfigured view
// looks the same in the platform — so the hub warns rather than failing, and so
// does this.

// The grid is a stand-in for the Power Apps grid, so `full` is a claim it
// cannot support whatever the control does.

// The harness refuses to boot a grid host whose control does not declare React
// as a platform library, and it is right to: cell renderers dispatch their
// hooks through the React instance their own bundle imported, so the harness
// mounts them with that same instance. A control bundling its own React fails
// with `Invalid hook call` thrown from inside somebody else's minified bundle,
// which names nothing. Catching it here costs one regex.
if (host === 'grid' && manifestXml !== null && !/<platform-library\s+name="React"/.test(manifestXml)) {
    problems.push(
        `pcfhub.json sets demo.host to "grid", but ${manifestPath} declares no ` +
        '<platform-library name="React" />. The hub\'s harness refuses to boot a grid host ' +
        'without it.',
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

for (const warning of warnings) {
    console.warn(`\n  warning: ${warning}`);
}

console.log(
    `${warnings.length > 0 ? '\n' : ''}Template adopted, pcfhub.json readable, control shape agrees ` +
        'with the manifest, docs named correctly, media present.',
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

/**
 * Ask PCFHub what it makes of this manifest.
 *
 * The hub validates with the same class ingestion uses, so the answer here is
 * the answer at import time rather than an approximation of it — which is the
 * whole reason this replaced a local copy of those rules.
 *
 * Never throws. Every failure — offline, DNS, a 500, a timeout, a body that is
 * not the shape expected — comes back as `reachable: false` with a reason, and
 * the caller turns that into a warning. A check script that can fail a release
 * build because a website was briefly down is a check script people disable.
 */
async function askTheHub(manifest) {
    const url = `${HUB}/api/v1/manifest/validate`;

    let response;

    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(manifest),
            signal: AbortSignal.timeout(HUB_TIMEOUT_MS),
        });
    } catch (error) {
        return { reachable: false, reason: error.name === 'TimeoutError' ? `no answer in ${HUB_TIMEOUT_MS / 1000}s` : error.message };
    }

    /*
     * The endpoint answers 200 for an invalid manifest — `valid: false` is the
     * verdict, not the status. So a non-200 means something went wrong with the
     * *request*, not with the manifest, and must not be reported as if the
     * author had made a mistake.
     */
    if (!response.ok) {
        return { reachable: false, reason: `HTTP ${response.status}` };
    }

    let body;

    try {
        body = await response.json();
    } catch (error) {
        return { reachable: false, reason: `unreadable response: ${error.message}` };
    }

    const data = body?.data;

    if (typeof data?.valid !== 'boolean') {
        return { reachable: false, reason: 'unexpected response shape' };
    }

    return {
        reachable: true,
        errors: Array.isArray(data.errors) ? data.errors : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };
}
