/*
 * The four Fluent components this control imports, stood in for.
 *
 * ---
 *
 * **Why a stand-in rather than the real thing.**
 *
 * A virtual control's bundle expects Fluent under a global — `pcf-scripts`
 * compiles `import { Popover } from '@fluentui/react-components'` down to
 * `FluentUIReactv940.Popover` — and `@fluentui/react-components` ships **no UMD
 * build**. There is nothing to put in a `<script src>`, and adding a bundler to
 * make one would turn the harness into the thing that needs building. That is
 * why `_template` deletes `dev/harness.html` for `--framework react`, and the
 * ruling stands for controls whose whole surface is Fluent.
 *
 * It does not stand for this one. Almost all of this control is its own DOM —
 * a field, a two-month grid, a rail of buttons, a footer — and Fluent supplies
 * exactly four things: a theme wrapper and a popover in three parts. Those are
 * eighty lines to stand in for, and standing in for them buys a page where the
 * calendar can be looked at, clicked, keyboard-driven and screenshotted in a
 * chosen language, none of which `npm start` offers.
 *
 * ---
 *
 * **What it is not.** Three differences matter, and pretending otherwise is
 * how a harness comes to certify a control that does not work:
 *
 *   - **The surface is rendered inline, not through a portal.** The real
 *     `PopoverSurface` is attached near the end of the document, which is why
 *     the stylesheet's popover rules lead with `.DateRangePicker-popover`
 *     rather than with `.DateRangePicker`. Here the surface *is* a descendant
 *     of the control's root, so a rule scoped the wrong way would work on this
 *     page and silently match nothing on a form. Check that in `npm start`.
 *   - **There is no focus trap and no Escape handling.** Fluent's `trapFocus`
 *     brings both; this brings neither, so tab order inside the popover is the
 *     document's own and Escape does nothing.
 *   - **`FluentProvider` emits no design tokens by default**, which is
 *     deliberate: it exercises the literal fallbacks in the stylesheet, the
 *     branch a canvas app and the hub's demo harness actually get. The theme
 *     switch supplies a small dark set to exercise the other branch.
 *
 * A stub must never be more capable than the thing it stands in for. These are
 * all *less* capable, which is the safe direction.
 */

(function (global) {
    'use strict';

    var React = global.__harnessReact;

    if (!React) {
        throw new Error('fluent-stub.js needs window.__harnessReact set to the React UMD build.');
    }

    /**
     * The tokens the stylesheet reads, in Fluent's web *dark* values.
     *
     * Only the ones `DateRangePicker.css` names — the point is to prove the
     * `var()` side of every declaration resolves, not to reproduce a theme.
     * Anything missing here falls back to the light literal in the stylesheet,
     * which is exactly what a partial host theme would do.
     */
    var DARK_TOKENS = {
        colorNeutralBackground1: '#292929',
        colorNeutralBackground1Hover: '#383838',
        colorNeutralBackground3: '#141414',
        colorNeutralBackground3Hover: '#292929',
        colorNeutralForeground1: '#ffffff',
        colorNeutralForeground2: '#d6d6d6',
        colorNeutralForeground4: '#999999',
        colorNeutralForegroundDisabled: '#5c5c5c',
        colorNeutralForegroundOnBrand: '#ffffff',
        colorNeutralStroke1: '#666666',
        colorNeutralStroke2: '#404040',
        colorNeutralStrokeDisabled: '#424242',
        colorTransparentStroke: 'transparent',
        colorTransparentBackground: 'transparent',
        colorCompoundBrandStroke: '#479ef5',
        colorCompoundBrandStrokePressed: '#2886de',
        colorPaletteRedForeground1: '#e37d80',
        colorBrandBackground: '#115ea3',
        colorBrandBackgroundHover: '#0f6cbd',
        colorBrandBackground2: '#082338',
        colorBrandStroke1: '#479ef5',
        colorBrandStroke2: '#0f548c',
        colorSubtleBackgroundHover: '#383838',
        colorSubtleBackgroundPressed: '#2e2e2e',
        colorStrokeFocus1: '#000000',
        colorStrokeFocus2: '#ffffff',
    };

    /** A theme object the control can pass straight through to the provider. */
    var webLightTheme = { __harnessTheme: 'light' };
    var webDarkTheme = Object.assign({ __harnessTheme: 'dark' }, DARK_TOKENS);

    function FluentProvider(props) {
        var style = {};

        // A theme carrying tokens publishes them as custom properties, the way
        // the real provider does. One carrying none publishes none, so the
        // stylesheet falls back — which is a host, not a failure.
        Object.keys(props.theme || {}).forEach(function (key) {
            if (key.indexOf('color') === 0) {
                style['--' + key] = props.theme[key];
            }
        });

        return React.createElement(
            'div',
            { className: props.className, dir: props.dir, style: style },
            props.children,
        );
    }

    /*
     * The popover, in three parts, as three markers the parent reads out of its
     * own children. Fluent's real components communicate through context; here
     * the parent is the only thing that renders them, so the marker is enough.
     */
    function PopoverTrigger(props) {
        return props.children;
    }

    PopoverTrigger.__harnessRole = 'trigger';

    function PopoverSurface(props) {
        return React.createElement(
            'div',
            {
                className: props.className,
                role: 'dialog',
                'aria-label': props['aria-label'],
                // The real surface is a floating layer. Inline here, but still
                // drawn as a layer so what is on screen is not misleading.
                style: {
                    position: 'absolute',
                    zIndex: 1,
                    // A floating layer sizes to its content. Absolute
                    // positioning alone sizes to the containing block, which
                    // squeezed the two months into a form column's width and
                    // made the page lie about the layout.
                    width: 'max-content',
                    maxWidth: 'calc(100vw - 2rem)',
                    marginTop: '4px',
                    background: 'var(--colorNeutralBackground1, #ffffff)',
                    border: '1px solid var(--colorTransparentStroke, transparent)',
                    borderRadius: '4px',
                    boxShadow: '0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)',
                },
            },
            props.children,
        );
    }

    PopoverSurface.__harnessRole = 'surface';

    function Popover(props) {
        var trigger = null;
        var surface = null;

        React.Children.forEach(props.children, function (child) {
            if (!child || !child.type) {
                return;
            }

            if (child.type.__harnessRole === 'trigger') {
                trigger = child;
            } else if (child.type.__harnessRole === 'surface') {
                surface = child;
            }
        });

        var toggle = function () {
            if (props.onOpenChange) {
                props.onOpenChange({}, { open: !props.open });
            }
        };

        // The real PopoverTrigger clones its child to add the click handler and
        // `aria-expanded`. Reproduced, because this control depends on it: the
        // field surface *is* the trigger, and it declares neither itself.
        var child = trigger && trigger.props.children;
        var cloned = child
            ? React.cloneElement(child, {
                onClick: toggle,
                'aria-haspopup': 'dialog',
                'aria-expanded': props.open ? 'true' : 'false',
            })
            : null;

        return React.createElement(
            'div',
            { style: { position: 'relative' } },
            cloned,
            props.open ? surface : null,
        );
    }

    global.__harnessFluent = {
        FluentProvider: FluentProvider,
        Popover: Popover,
        PopoverTrigger: PopoverTrigger,
        PopoverSurface: PopoverSurface,
        webLightTheme: webLightTheme,
        webDarkTheme: webDarkTheme,
    };
})(window);
