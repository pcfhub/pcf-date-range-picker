#!/usr/bin/env node
/**
 * Adopt this template: replace every placeholder, rename the files that carry
 * one, and generate the identifiers that must be unique per repository.
 *
 *   node scripts/setup.mjs
 *   node scripts/setup.mjs --yes \
 *     --control ColorPicker --namespace PCFHub --slug pcf-color-picker \
 *     --title "Color Picker" --tagline "A WCAG-compliant colour picker." \
 *     --category pickers --owner pcfhub --repo pcf-color-picker \
 *     --publisher PCFHub --prefix pcfhu
 *
 * Under `--yes` every value must be answerable without a prompt, and TAGLINE,
 * CATEGORY and OWNER have no `derive` — so a short example that omits them does
 * not "use the defaults", it exits 1. SLUG derives from CONTROL as
 * `color-picker`, which is probably not the slug you want either.
 *
 * Add `--framework react` for a React (virtual) control instead of a standard
 * DOM one; see applyFramework() below for exactly what that changes.
 *
 * Run it once, review the diff, commit. `scripts/check-template.mjs` fails the
 * build until it has been run, so a half-adopted template cannot reach a
 * release — which matters because two of the values below (the solution's
 * unique name and the publisher prefix) are permanent once a customer has
 * installed the solution.
 */

import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Never walked: build output, dependencies, and git's own storage. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out', 'bin', 'obj', 'generated']);

/**
 * React and Fluent are resolved by the host at runtime, not bundled, so these
 * are devDependencies. The React version is not arbitrary: pcf-scripts maps a
 * declared 16.8–16.14.0 onto the platform's 16.14.0 build, and
 * @fluentui/react-components requires react >=16.14.0 — so pinning 16.8.6 here
 * makes `npm install` refuse the pair even though both resolve identically at
 * runtime.
 */
const REACT_VERSION = '16.14.0';
const FLUENT_VERSION = '9.46.2';

/** Binary-ish or generated files whose contents must not be rewritten. */
const SKIP_FILES = new Set(['package-lock.json']);

const args = parseArgs(process.argv.slice(2));

const framework = args.framework ?? 'standard';

if (framework !== 'standard' && framework !== 'react') {
    fail(`--framework must be "standard" or "react", not "${framework}".`);
}

const rules = {
    CONTROL: {
        question: 'Control name (PascalCase, becomes the constructor)',
        example: 'ColorPicker',
        test: /^[A-Za-z][A-Za-z0-9_]*$/,
        hint: 'letters, digits and underscores, starting with a letter',
    },
    NAMESPACE: {
        question: 'Namespace',
        example: 'PCFHub',
        test: /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/,
        hint: 'a PCF namespace such as "PCFHub" or "Contoso.Controls"',
    },
    SLUG: {
        question: 'Hub slug (the /components/… URL, and the pcfhub.json slug)',
        derive: (a) => kebab(a.CONTROL),
        test: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        hint: 'lowercase words separated by single hyphens',
    },
    TITLE: {
        question: 'Display name',
        derive: (a) => title(a.CONTROL),
        test: /^.{1,191}$/,
        hint: 'up to 191 characters',
    },
    TAGLINE: {
        question: 'One-line description',
        example: 'A WCAG-compliant colour picker for model-driven forms.',
        test: /^.{1,255}$/,
        hint: 'up to 255 characters',
    },
    CATEGORY: {
        question: 'Hub category slug',
        example: 'pickers',
        test: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        hint: 'lowercase words separated by single hyphens',
    },
    OWNER: {
        question: 'GitHub owner',
        example: 'pcfhub',
        test: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/,
        hint: 'a GitHub user or organisation',
    },
    REPO: {
        question: 'GitHub repository name',
        derive: (a) => a.SLUG,
        test: /^[A-Za-z0-9._-]+$/,
        hint: 'the repository name only, not the URL',
    },
    PUBLISHER: {
        question: 'Dataverse publisher unique name (permanent)',
        derive: (a) => a.NAMESPACE.replace(/\./g, ''),
        test: /^[A-Za-z][A-Za-z0-9]*$/,
        hint: 'letters and digits, starting with a letter',
    },
    PREFIX: {
        question: 'Publisher customization prefix (permanent, 2–8 chars)',
        derive: (a) => a.PUBLISHER.toLowerCase().slice(0, 5),
        test: /^[a-z][a-z0-9]{1,7}$/,
        hint: '2 to 8 lowercase characters, starting with a letter',
    },
};

const answers = {};

const rl = args.yes ? null : createInterface({ input: process.stdin, output: process.stdout });

for (const [token, rule] of Object.entries(rules)) {
    const fallback = args[token.toLowerCase()] ?? rule.derive?.(answers) ?? null;

    for (;;) {
        let value = fallback;

        if (rl) {
            const suffix = fallback ? ` [${fallback}]` : rule.example ? ` (e.g. ${rule.example})` : '';
            const typed = (await rl.question(`${rule.question}${suffix}: `)).trim();
            value = typed === '' ? fallback : typed;
        }

        if (value && rule.test.test(value)) {
            answers[token] = value;
            break;
        }

        const problem = value ? `"${value}" is not valid — expected ${rule.hint}.` : 'A value is required.';

        if (!rl) {
            fail(`${token}: ${problem}`);
        }

        console.error(`  ${problem}`);
    }
}

rl?.close();

/*
 * Generated rather than asked for.
 *
 * The two project GUIDs only have to be unique, and the option-value prefix
 * only has to not collide with another publisher in the same environment —
 * nobody has an opinion about any of them, and a template that ships fixed ones
 * gives every repository the same identity.
 */
answers.PCF_PROJECT_GUID = randomUUID();
answers.SOLUTION_PROJECT_GUID = randomUUID();
answers.OPTION_VALUE_PREFIX = String(10000 + Math.floor(Math.random() * 90000));

const tokens = Object.keys(answers).map((name) => [`__${name}__`, answers[name]]);

// Longest first, so `DateRangePicker` cannot eat the front of a longer token that
// happens to share its prefix.
tokens.sort((a, b) => b[0].length - a[0].length);

const rewritten = [];
const renamed = [];

for (const file of walk(root)) {
    const original = readFileSync(file, 'utf8');
    let updated = original;

    for (const [token, value] of tokens) {
        updated = updated.split(token).join(value);
    }

    if (updated !== original) {
        writeFileSync(file, updated);
        rewritten.push(relative(file));
    }
}

/*
 * Depth-first, children before parents — which is the order `walkPaths` already
 * yields, and the reason it yields a directory *after* recursing into it.
 *
 * The paths were collected before the first rename, so renaming a parent early
 * would invalidate every path still queued underneath it.
 */
for (const path of walkPaths(root)) {
    const base = basename(path);
    let next = base;

    for (const [token, value] of tokens) {
        next = next.split(token).join(value);
    }

    if (next !== base) {
        const target = join(dirname(path), next);
        renameSync(path, target);
        renamed.push(`${relative(path)} → ${next}`);
    }
}

applyFramework(answers.CONTROL);

/*
 * The variants directory has done its job either way — the react sources have
 * been copied into place, or they were never wanted. Leaving it behind would
 * ship a second, unreferenced copy of the control in every adopted repository.
 */
rmSync(join(root, 'variants'), { recursive: true, force: true });

/*
 * `migration.md` ships with `appliesTo: ">=1.0.0"`, which matches no release of
 * a control that starts at 0.1.0. The hub reports the range as matching nothing
 * and skips the page, and `check-template.mjs` cannot catch it because it only
 * validates filenames. There is nothing to migrate from on a new control, so
 * the page is removed rather than shipped broken. Write it when the first
 * breaking change lands.
 */
rmSync(join(root, 'docs', 'migration.md'), { force: true });

const templateDoc = join(root, 'TEMPLATE.md');

if (existsSync(templateDoc)) {
    rmSync(templateDoc);
}

console.log('');
for (const [token, value] of tokens) {
    console.log(`  ${token.padEnd(24)} ${value}`);
}
console.log(`\n  ${rewritten.length} files rewritten, ${renamed.length} renamed:`);
for (const line of renamed) {
    console.log(`    ${line}`);
}

console.log(`
Adopted as a ${framework} control.

Next:
  1. Review the diff — the publisher prefix and the solution unique name are
     permanent once this ships.
  2. npm install — then COMMIT package-lock.json. Both workflows run "npm ci",
     which fails outright without it, and this template ships none.
  3. npm run build
  4. Fill in docs/*.md. Every file there becomes a page on the hub; the ones you
     do not write simply do not appear.
  5. Replace media/logo.png — the one here is a placeholder, and nothing in CI
     checks what it looks like.
  6. Add the repository to PCFHub with the slug "${answers.SLUG}", then tag v0.1.0.
`);

// ------------------------------------------------------------------ helpers

/**
 * Turn the standard DOM control into a React (virtual) one.
 *
 * This is a patch rather than a second full template on purpose: the manifest's
 * comments, the CSS, the resx and the workflows are the same either way, and
 * they are most of what the template is actually for. Duplicating them into a
 * parallel tree guarantees the two drift.
 *
 * Everything here was learned by doing the conversion by hand for
 * pcf-choices-picker. Each edit below is one that build actually required.
 */
function applyFramework(control) {
    if (framework !== 'react') {
        return;
    }

    const source = join(root, 'variants', 'react');
    const target = join(root, control);

    mkdirSync(join(target, 'components'), { recursive: true });
    cpSync(join(source, 'index.ts'), join(target, 'index.ts'));
    cpSync(join(source, 'components'), join(target, 'components'), { recursive: true });

    // control-type drives which interface the platform expects the class to
    // implement, and pcfhub.json has to agree with it on two keys, not one.
    //
    // `control.type` is the one people miss. The hub's ControlManifestParser
    // resolves dataset -> virtual -> field in that order, so a virtual *field*
    // control is recorded as "virtual" — "field" would be re-derived as
    // "virtual" at every release and quietly disagree with the repository.
    // `npm run check` enforces this now.
    edit('pcfhub.json', (text) =>
        text
            .replace('"type": "field"', '"type": "virtual"')
            .replace('"framework": "standard"', '"framework": "react_virtual"'));

    edit(join(control, 'ControlManifest.Input.xml'), (text) =>
        text
            .replace('control-type="standard"', 'control-type="virtual"')
            .replace(
                '<resx path=',
                `<platform-library name="React" version="${REACT_VERSION}" />\n      <platform-library name="Fluent" version="${FLUENT_VERSION}" />\n      <resx path=`,
            ));

    edit('package.json', (text) => {
        const pkg = JSON.parse(text);

        pkg.devDependencies = Object.fromEntries(
            Object.entries({
                ...pkg.devDependencies,
                '@fluentui/react-components': FLUENT_VERSION,
                '@types/react': '^16.14.62',
                '@types/react-dom': '^16.9.24',
                'eslint-plugin-react-hooks': '^4.6.0',
                react: REACT_VERSION,
                'react-dom': REACT_VERSION,
            }).sort(([a], [b]) => a.localeCompare(b)),
        );

        return `${JSON.stringify(pkg, null, 2)}\n`;
    });

    // Without the plugin, an `eslint-disable react-hooks/exhaustive-deps`
    // comment fails the build with "Definition for rule was not found" — which
    // reads as a config error rather than a missing dependency.
    edit('.eslintrc.json', (text) => {
        const config = JSON.parse(text);

        config.parserOptions = { ...config.parserOptions, ecmaFeatures: { jsx: true } };
        config.plugins = [...(config.plugins ?? []), 'react-hooks'];
        config.rules = {
            ...config.rules,
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        };

        return `${JSON.stringify(config, null, 4)}\n`;
    });
}

function edit(relative, transform) {
    const path = join(root, relative);
    const before = readFileSync(path, 'utf8');
    const after = transform(before);

    if (after === before) {
        fail(`Could not apply the react framework patch to ${relative}.`);
    }

    writeFileSync(path, after);
}

function* walkPaths(dir) {
    for (const entry of readdirSync(dir).sort()) {
        if (SKIP_DIRS.has(entry)) {
            continue;
        }

        const path = join(dir, entry);

        if (statSync(path).isDirectory()) {
            yield* walkPaths(path);
            yield path;
        } else {
            yield path;
        }
    }
}

function* walk(dir) {
    for (const path of walkPaths(dir)) {
        if (!statSync(path).isDirectory() && !SKIP_FILES.has(basename(path))) {
            yield path;
        }
    }
}

function relative(path) {
    return path.slice(root.length + 1).replace(/\\/g, '/');
}

function kebab(value) {
    return value
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
}

function title(value) {
    return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
}

function parseArgs(argv) {
    const out = {};

    for (let i = 0; i < argv.length; i += 1) {
        if (!argv[i].startsWith('--')) {
            continue;
        }

        const key = argv[i].slice(2);

        if (key === 'yes') {
            out.yes = true;
        } else {
            out[key] = argv[i + 1];
            i += 1;
        }
    }

    return out;
}

function fail(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}
