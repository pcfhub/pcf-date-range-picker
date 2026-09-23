/*
 * Loads the control bundle for a virtual control, and defines the globals it
 * expects to already be there.
 *
 * A standard control's bundle is loaded with a `<script src>` and needs nothing
 * from the page. A virtual one cannot be: `<platform-library>` compiles React
 * and Fluent *out* of the bundle into references on globals, and those globals
 * have to exist before the bundle's first line runs.
 *
 * **The names are version-encoded, which is why this fetches instead.**
 * `pcf-scripts` maps a declared `<platform-library>` version onto the platform
 * build that supports it, so React 16.14.0 arrives as `Reactv16` and Fluent
 * 9.46.2 as `FluentUIReactv940` — a number that appears nowhere in this
 * repository. Writing those names down here is a trap that springs on the next
 * version bump, with an error naming a global nobody has ever heard of. So the
 * bundle is fetched as text, the names are read out of it, and only then is it
 * evaluated. `dev/smoke.js` does the same thing for the same reason.
 *
 * Everything React sees on this page is a stand-in — see `dev/fluent-stub.js`
 * for the three ways it differs from the real Fluent, and `dev/harness.html`
 * for what the page as a whole is and is not.
 */

(function () {
    'use strict';

    var BUNDLE = '../out/controls/DateRangePicker/bundle.js';

    function fail(message) {
        var status = document.getElementById('harness-status');

        if (status) {
            status.textContent = message;
        }

        // Also to the console: the status line is one sentence, and a stack is
        // what tells you which import threw.
        console.error(message);
    }

    fetch(BUNDLE)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('no bundle at ' + BUNDLE + ' — run npm run build first');
            }

            return response.text();
        })
        .then(function (source) {
            /*
             * The globals, read out of the bundle rather than written down.
             *
             * Both patterns are deliberately loose: any `Reactv…` and any
             * `FluentUIReact…` identifier. A bundle that references two of
             * either — which happens when a dependency declares its own
             * platform library — gets both defined rather than half of them.
             */
            var react = source.match(/\bReactv[\w]*\b/g) || [];
            var fluent = source.match(/\bFluentUIReact[\w]*\b/g) || [];

            react.forEach(function (name) {
                window[name] = window.__harnessReact;
            });

            fluent.forEach(function (name) {
                window[name] = window.__harnessFluent;
            });

            var found = [].concat(react, fluent).filter(function (name, at, all) {
                return all.indexOf(name) === at;
            });

            var globals = document.getElementById('harness-globals');

            if (globals) {
                globals.textContent = found.join(', ') || '(none found)';
            }

            // The bundle registers itself with `host.js`'s `registerControl`
            // the moment it runs, which is why `host.js` and `harness.js` are
            // both loaded ahead of this file.
            //
            // eslint-disable-next-line no-new-func
            new Function(source)();

            window.__harnessStart();
        })
        .catch(function (error) {
            fail(String(error.message || error));
        });
})();
