/*
 * The switch panel and the render loop for `dev/harness.html`.
 *
 * Three things happen here that are worth knowing about:
 *
 *   1. **The bundle is fetched as text and evaluated**, rather than loaded with
 *      a `<script src>`. The globals it expects are version-encoded —
 *      `pcf-scripts` maps a declared `<platform-library>` version onto the
 *      platform build it supports, so Fluent 9.46.2 arrives as
 *      `FluentUIReactv940` — and hardcoding that name is a trap that springs on
 *      the next version bump. Reading the names out of the bundle first, then
 *      defining them, then evaluating, is what `dev/smoke.js` does for the same
 *      reason.
 *
 *   2. **The strings come from the shipped `.resx`**, parsed in the browser.
 *      Not from a copy in this file: a copy drifts, and a screenshot taken from
 *      a copy is a picture of strings nobody ships. It also means this page
 *      fails visibly when a key is missing from a locale, which nothing else
 *      does short of importing the solution.
 *
 *   3. **Nothing here is the platform.** Every value on the panel is supplied
 *      by `dev/host.js`. A state you can produce here is a state worth
 *      handling; a state that works here has still only been seen in one
 *      browser with one set of fixtures.
 */

(function () {
    'use strict';

    var React = window.__harnessReact;
    var ReactDOM = window.__harnessReactDOM;
    var host = window.__pcfHost;

    var BUNDLE = '../out/controls/DateRangePicker/bundle.js';
    var LOCALES = {
        1033: 'English',
        3082: 'Español',
        1036: 'Français',
        1031: 'Deutsch',
        1041: '日本語',
    };

    var el = function (id) {
        return document.getElementById(id);
    };

    var state = {
        start: '2026-09-15',
        end: '2026-09-20',
        min: '',
        max: '',
        sameDay: 'allow',
        duration: 'show',
        /* 0.3.0: the columns' Format, the time Enum, the Behavior, and the
           Dataverse user's offset in the platform's sign (blank = the
           browser's own zone, which hides every conversion bug). */
        format: 'date',
        time: 'auto',
        behavior: '1',
        userOffset: '',
        presets: 'today,last7,last30,thisMonth,next7,next30',
        startSecurity: 'none',
        endSecurity: 'none',
        startError: false,
        endError: false,
        visible: true,
        disabled: false,
        rtl: false,
        theme: 'none',
        culture: 'platform',
        locale: '1033',
    };

    /*
     * Every switch is also a query parameter, so a screenshot is reproducible:
     *
     *   dev/harness.html?bare=1&open=1&locale=1033
     *
     * `bare` hides the panel and `open` opens the popover on load, which are
     * the two things a screenshot needs and neither of which a URL could
     * otherwise express.
     */
    var query = new URLSearchParams(window.location.search);

    Object.keys(state).forEach(function (key) {
        if (!query.has(key)) {
            return;
        }

        var raw = query.get(key);

        state[key] = typeof state[key] === 'boolean' ? raw !== '0' && raw !== 'false' : raw;
    });

    /** The language the *dates* are formatted in, matching the strings. */
    var FORMAT_LOCALES = {
        1033: 'en-US',
        3082: 'es-ES',
        1036: 'fr-FR',
        1031: 'de-DE',
        1041: 'ja-JP',
    };

    var strings = {};
    var control = null;
    var notifications = 0;

    /**
     * `yyyy-mm-dd` to a Date at *local* midnight, or `yyyy-mm-ddTHH:mm[:ss]`
     * to a wall clock as local components. Never `new Date(string)`.
     */
    function localDate(value) {
        var parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value || '');

        return parts === null
            ? null
            : new Date(
                Number(parts[1]),
                Number(parts[2]) - 1,
                Number(parts[3]),
                Number(parts[4] || 0),
                Number(parts[5] || 0),
                Number(parts[6] || 0),
            );
    }

    function loadStrings(locale) {
        return fetch('../DateRangePicker/strings/DateRangePicker.' + locale + '.resx')
            .then(function (response) {
                return response.text();
            })
            .then(function (text) {
                var doc = new DOMParser().parseFromString(text, 'application/xml');
                var map = {};

                Array.prototype.forEach.call(doc.querySelectorAll('data'), function (node) {
                    var value = node.querySelector('value');

                    map[node.getAttribute('name')] = value ? value.textContent : '';
                });

                strings = map;
            });
    }

    function context() {
        return host.createContext({
            start: localDate(state.start),
            end: localDate(state.end),
            min: localDate(state.min),
            max: localDate(state.max),
            sameDay: state.sameDay,
            duration: state.duration,
            format: state.format,
            time: state.time,
            behavior: state.behavior === 'none' ? undefined : Number(state.behavior),
            userOffset: state.userOffset === '' ? null : Number(state.userOffset),
            presets: state.presets,
            startSecurity: state.startSecurity,
            endSecurity: state.endSecurity,
            startError: state.startError,
            endError: state.endError,
            visible: state.visible,
            disabled: state.disabled,
            rtl: state.rtl,
            dateFormatting: state.culture === 'withheld' ? null : undefined,
            formatLocale: FORMAT_LOCALES[state.locale] || 'en-US',
            // A missing key renders as the key itself rather than as blank, so
            // the gap is visible on the page instead of being a silent hole.
            getString: function (key) {
                return Object.prototype.hasOwnProperty.call(strings, key) ? strings[key] : key;
            },
        });
    }

    /*
     * `fluentDesignLanguage` is absent unless a host publishes it — which is
     * the common case, and the branch the stylesheet's literal fallbacks
     * exist for. Undefined rather than a light theme, deliberately.
     */
    function withTheme(ctx) {
        if (state.theme !== 'none') {
            ctx.fluentDesignLanguage = {
                tokenTheme:
                    state.theme === 'dark'
                        ? window.__harnessFluent.webDarkTheme
                        : window.__harnessFluent.webLightTheme,
                isDarkTheme: state.theme === 'dark',
            };
        }

        return ctx;
    }

    function render() {
        var ctx = withTheme(context());

        ReactDOM.render(control.updateView(ctx), el('stage'));

        var outputs = control.getOutputs();

        el('outputs').textContent = JSON.stringify(
            {
                startDate: outputs.startDate === null ? null : String(outputs.startDate),
                endDate: outputs.endDate === null ? null : String(outputs.endDate),
            },
            null,
            2,
        );
        el('notifications').textContent = String(notifications);
    }

    function mount() {
        var registration = host.captureRegistration(window);

        return fetch(BUNDLE)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('no bundle — run npm run build first');
                }

                return response.text();
            })
            .then(function (source) {
                // The globals, read out of the bundle rather than written down.
                var react = source.match(/\bReactv[\w]*\b/g) || [];
                var fluent = source.match(/\bFluentUIReact[\w]*\b/g) || [];

                react.forEach(function (name) {
                    window[name] = React;
                });

                fluent.forEach(function (name) {
                    window[name] = window.__harnessFluent;
                });

                el('globals').textContent =
                    [].concat(react, fluent).filter(function (name, at, all) {
                        return all.indexOf(name) === at;
                    }).join(', ') || '(none found)';

                // eslint-disable-next-line no-new-func
                new Function(source)();

                control = new registration.ctor();
                control.init(context(), function () {
                    notifications += 1;
                    render();
                });
            });
    }

    function bind() {
        var wire = function (id, key, read) {
            var node = el(id);

            if (!node) {
                return;
            }

            node.addEventListener('change', function () {
                state[key] = read(node);

                if (key === 'locale') {
                    loadStrings(state.locale).then(render);

                    return;
                }

                render();
            });
        };

        var value = function (node) {
            return node.value;
        };
        var checked = function (node) {
            return node.checked;
        };

        wire('start', 'start', value);
        wire('end', 'end', value);
        wire('min', 'min', value);
        wire('max', 'max', value);
        wire('sameDay', 'sameDay', value);
        wire('duration', 'duration', value);
        wire('format', 'format', value);
        wire('time', 'time', value);
        wire('behavior', 'behavior', value);
        wire('userOffset', 'userOffset', value);
        wire('presets', 'presets', value);
        wire('startSecurity', 'startSecurity', value);
        wire('endSecurity', 'endSecurity', value);
        wire('theme', 'theme', value);
        wire('culture', 'culture', value);
        wire('locale', 'locale', value);
        wire('startError', 'startError', checked);
        wire('endError', 'endError', checked);
        wire('visible', 'visible', checked);
        wire('disabled', 'disabled', checked);
        wire('rtl', 'rtl', checked);

        el('presets').addEventListener('input', function () {
            state.presets = el('presets').value;
            render();
        });

        el('reset').addEventListener('click', function () {
            notifications = 0;
            render();
        });

        // A screenshot wants the control and nothing else. The panel is a
        // development tool, not part of what is being photographed.
        el('bare').addEventListener('click', function () {
            document.body.classList.toggle('is-bare');
        });
    }

    Object.keys(LOCALES).forEach(function (id) {
        var option = document.createElement('option');

        option.value = id;
        option.textContent = id + ' — ' + LOCALES[id];
        el('locale').appendChild(option);
    });

    el('locale').value = state.locale;
    el('start').value = state.start;
    el('end').value = state.end;
    el('min').value = state.min;
    el('max').value = state.max;
    el('presets').value = state.presets;
    el('sameDay').value = state.sameDay;
    el('duration').value = state.duration;
    el('format').value = state.format;
    el('time').value = state.time;
    el('behavior').value = state.behavior;
    el('userOffset').value = state.userOffset;
    el('startSecurity').value = state.startSecurity;
    el('endSecurity').value = state.endSecurity;
    el('theme').value = state.theme;
    el('culture').value = state.culture;
    el('visible').checked = state.visible;
    el('disabled').checked = state.disabled;
    el('rtl').checked = state.rtl;

    if (query.get('bare') === '1') {
        document.body.classList.add('is-bare');
    }

    loadStrings(state.locale)
        .then(mount)
        .then(function () {
            bind();
            render();

            /*
             * Opening on load is a click, not a prop: `open` is the component's
             * own state and there is no way in. Clicking the field is the same
             * thing a user does, and waiting a frame is what lets React commit
             * the first render before the click lands on it.
             */
            if (query.get('open') === '1') {
                requestAnimationFrame(function () {
                    var field = document.querySelector('.DateRangePicker-field');

                    if (field) {
                        field.click();
                    }
                });
            }
        })
        .catch(function (error) {
            el('stage').textContent = String(error && error.message ? error.message : error);
        });
})();
