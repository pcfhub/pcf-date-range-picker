/*
 * Stand-ins for the Fluent components a virtual control's bundle expects to
 * find on the page.
 *
 * ---
 *
 * **Why a stand-in rather than the real thing.**
 *
 * `pcf-scripts` compiles `import { Popover } from '@fluentui/react-components'`
 * down to a reference on a version-encoded global — `FluentUIReactv940.Popover`
 * — because the manifest declares Fluent as a `<platform-library>` and the host
 * supplies it at runtime. On a form that global is the real Fluent. On a plain
 * page it is nothing at all, and there is no file to put in a `<script src>`:
 * **`@fluentui/react-components` ships no UMD build.** Adding a bundler to
 * produce one would make the harness the thing that needs building.
 *
 * So the page defines the global itself, from this file. Eighty lines of
 * stand-in buys a surface that can be clicked, keyboard-driven, screenshotted
 * and switched between host states — none of which `npm start` offers, and none
 * of which `npm run smoke` can show you.
 *
 * ---
 *
 * **What it is not, and this list is the price of admission.** A stub that
 * quietly does *more* than the thing it stands in for certifies a control that
 * does not work. These all do less, which is the safe direction — but you have
 * to know which:
 *
 *   - **Nothing is portalled.** The real `PopoverSurface` mounts near the end
 *     of `document.body`; here it is a descendant of the control's own root.
 *     A stylesheet rule scoped through the control's root therefore works on
 *     this page and matches nothing on a form. Lead popover rules with their
 *     own class, and confirm in `npm start`.
 *   - **No focus trap and no Escape.** Fluent's `trapFocus` brings both; this
 *     brings neither, so tab order inside a surface is the document's own.
 *   - **`FluentProvider` publishes no design tokens unless the theme carries
 *     them**, which is deliberate: it exercises the literal fallbacks in the
 *     stylesheet — the branch a canvas app and PCFHub's demo harness actually
 *     get. `webDarkTheme` below carries a small set to exercise the other.
 *
 *   - **`Menu` closes only on a choice.** The real one also closes on an
 *     outside click and on Escape; this one stays open until an item is
 *     picked or the trigger pressed again, so a screenshot can show it.
 *   - **`Button` is a `<button>`** with its appearance as a class and its
 *     icon rendered before the children; `iconPosition` and
 *     `disableButtonEnhancement` are swallowed.
 *
 * ---
 *
 * **Adding a component.** Stub the ones your control imports and no more. A
 * plain wrapper is usually enough; the non-obvious case is a *compound*
 * component, where Fluent's parts talk to each other through React context.
 * `Popover` below is the worked example: each part carries a
 * `__harnessRole` marker and the parent reads its own children for them, which
 * is enough because the parent is the only thing that renders them.
 *
 * The scaffolded control imports little or none of this. It is here so that the
 * first Fluent import does not also cost you a browser rig.
 */

(function (global) {
    'use strict';

    var React = global.__harnessReact;

    if (!React) {
        throw new Error('fluent-stub.js needs window.__harnessReact set to the React UMD build.');
    }

    /**
     * Fluent's web *dark* values for the tokens a control is most likely to
     * name, as CSS custom properties.
     *
     * Not a theme — a theme is several hundred tokens and reproducing one here
     * would be maintaining a copy of Fluent. The point is to prove the `var()`
     * side of every declaration resolves against *something*, and that the
     * light literal beside it is reachable when it does not. Add the tokens
     * your stylesheet actually names; anything missing falls back, which is
     * exactly what a partial host theme does.
     */
    var DARK_TOKENS = {
        colorNeutralBackground1: '#292929',
        colorNeutralBackground1Hover: '#383838',
        colorNeutralBackground2: '#1f1f1f',
        colorNeutralBackground3: '#141414',
        colorNeutralBackground5: '#000000',
        colorNeutralForeground3: '#adadad',
        colorBrandBackground: '#115ea3',
        colorBrandBackground2: '#082338',
        colorBrandStroke1: '#479ef5',
        colorStrokeFocus2: '#ffffff',
        colorPaletteRedForeground1: '#e37d80',
        colorPaletteRedBackground1: '#3f1011',
        colorNeutralForeground1: '#ffffff',
        colorNeutralForeground2: '#d6d6d6',
        colorNeutralForeground4: '#999999',
        colorNeutralForegroundDisabled: '#5c5c5c',
        colorNeutralForegroundOnBrand: '#ffffff',
        colorNeutralStroke1: '#666666',
        colorNeutralStroke2: '#404040',
        // The faintest divider — a grid's inner lines. Missing, it fell back to the
        // light literal (#f0f0f0) and drew pcf-calendar-view's hour grid in white
        // lines on the dark preview, which a real dark form does not (2026-10-05).
        colorNeutralStroke3: '#3d3d3d',
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

    /** Themes the control can pass straight through to the provider. */
    var webLightTheme = { __harnessTheme: 'light' };
    var webDarkTheme = Object.assign({ __harnessTheme: 'dark' }, DARK_TOKENS);

    function FluentProvider(props) {
        var style = {};

        // A theme carrying tokens publishes them the way the real provider
        // does. One carrying none publishes none, so the stylesheet falls back
        // — which is a host, not a failure.
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
                // Inline rather than portalled — see the header — but still
                // drawn as a layer, so what is on screen is not misleading
                // about how the control will look.
                style: {
                    position: 'absolute',
                    zIndex: 1,
                    // A floating layer sizes to its content. Absolute
                    // positioning alone sizes to the containing block, which
                    // squeezes a wide surface into the form column's width and
                    // makes the page lie about the layout.
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

        /*
         * The real `PopoverTrigger` **clones its child** to add the click
         * handler, `aria-haspopup` and `aria-expanded`. Reproduced because it
         * is load-bearing in both directions: a control whose trigger is a
         * styled `<div>` gets those attributes for free, and a control that
         * puts a real `<button>` inside that `<div>` ends up with two tab stops
         * for one control. Neither is visible without this.
         */
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

    /*
     * `Button`: a real `<button>` carrying its appearance as a class, drawn
     * the way Fluent 9 draws a small button — 24px, 12px semibold, the three
     * appearances — from the same tokens the control's own stylesheet reads,
     * with the light theme as the fallback. Every selector is wrapped in
     * `:where()` so it has no specificity: a control's own class on the same
     * element wins here exactly as it wins over Fluent's classes on a form. Without this the harness page
     * showed the browser's default button chrome beside a control styled to
     * Fluent, and screenshots taken from it carried that chrome onto the hub.
     * Hover and pressed states are approximate; `disableButtonEnhancement`
     * is swallowed — it is a Fluent-internal hint, not an attribute.
     */
    var SPINNER_STYLES = [
        '.stub-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--colorBrandStroke2, #c7e0f4);',
        '  border-top-color: var(--colorBrandStroke1, #0f6cbd); border-radius: 50%; animation: stub-spin 1s linear infinite; }',
        '.stub-spinner--tiny { width: 12px; height: 12px; border-width: 2px; }',
        '.stub-spinner--extra-tiny { width: 10px; height: 10px; border-width: 1.5px; }',
        '@keyframes stub-spin { to { transform: rotate(360deg); } }',
    ].join('\n');

    var BUTTON_STYLES = [
        ':where(.stub-button){box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;',
        'min-width:64px;height:24px;padding:0 8px;margin:0;font-family:var(--fontFamilyBase,"Segoe UI",system-ui,sans-serif);',
        'font-size:12px;font-weight:600;line-height:16px;border-radius:4px;cursor:pointer;vertical-align:middle;',
        'color:var(--colorNeutralForeground1,#242424);background:var(--colorNeutralBackground1,#fff);',
        'border:1px solid var(--colorNeutralStroke1,#d1d1d1);}',
        ':where(.stub-button):hover{background:var(--colorNeutralBackground1Hover,#f5f5f5);}',
        ':where(.stub-button):disabled{color:var(--colorNeutralForegroundDisabled,#bdbdbd);border-color:var(--colorNeutralStrokeDisabled,#e0e0e0);background:var(--colorNeutralBackgroundDisabled,#f0f0f0);cursor:default;}',
        ':where(.stub-button--primary){color:var(--colorNeutralForegroundOnBrand,#fff);background:var(--colorBrandBackground,#0f6cbd);border-color:transparent;}',
        ':where(.stub-button--primary):hover{background:var(--colorBrandBackgroundHover,#115ea3);}',
        ':where(.stub-button--subtle){color:var(--colorNeutralForeground2,#424242);background:transparent;border-color:transparent;min-width:24px;}',
        ':where(.stub-button--subtle):hover{background:var(--colorSubtleBackgroundHover,#f5f5f5);color:var(--colorNeutralForeground2Hover,#242424);}',
        ':where(.stub-button--transparent){color:var(--colorNeutralForeground2,#424242);background:transparent;border-color:transparent;min-width:0;padding:0 4px;}',
        ':where(.stub-button--transparent):hover{color:var(--colorNeutralForeground2BrandHover,#0f6cbd);background:transparent;}',
        ':where(.stub-button):focus-visible{outline:2px solid var(--colorStrokeFocus2,#000);outline-offset:1px;}',
    ].join('');

    /*
     * `Avatar`: a circle at `size` with the picture, or the name's initials
     * when there is none or it fails to load — what Fluent's does — in its
     * neutral colours. Added for pcf-hierarchy-view 0.3.0's pictures.
     */
    var AVATAR_STYLES = [
        ':where(.stub-avatar){display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;box-sizing:border-box;',
        'border-radius:50%;overflow:hidden;background:var(--colorNeutralBackground6,#e6e6e6);color:var(--colorNeutralForeground3,#616161);',
        'font-family:var(--fontFamilyBase,"Segoe UI",system-ui,sans-serif);font-weight:600;line-height:1;}',
        ':where(.stub-avatar) img{display:block;width:100%;height:100%;object-fit:cover;}',
    ].join('');

    if (global.document && !global.document.getElementById('fluent-stub-styles')) {
        var styleTag = global.document.createElement('style');

        styleTag.id = 'fluent-stub-styles';
        styleTag.textContent = BUTTON_STYLES + '\n' + SPINNER_STYLES + '\n' + AVATAR_STYLES;
        global.document.head.appendChild(styleTag);
    }

    /** "Contoso Europe" → "CE", "Contoso" → "C": the first and last word's first letters. */
    function initialsOf(name) {
        var words = String(name || '').trim().split(/\s+/).filter(function (word) {
            return /[A-Za-z0-9\u00C0-\uFFFF]/.test(word.charAt(0));
        });

        if (words.length === 0) {
            return '';
        }

        return (words[0].charAt(0) + (words.length > 1 ? words[words.length - 1].charAt(0) : '')).toUpperCase();
    }

    function Avatar(props) {
        var size = props.size || 32;
        var src = props.image && props.image.src;
        var state = React.useState(false);
        var failed = state[0];
        var attributes = {
            className: ['stub-avatar', props.className].filter(Boolean).join(' '),
            style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.4) + 'px' },
        };

        Object.keys(props).forEach(function (key) {
            if (key.indexOf('aria-') === 0) {
                attributes[key] = props[key];
            }
        });

        return React.createElement(
            'span',
            attributes,
            src && !failed
                ? React.createElement('img', { src: src, alt: '', onError: function () { state[1](true); } })
                : initialsOf(props.name),
        );
    }

    function Button(props) {
        var attributes = {};

        Object.keys(props).forEach(function (key) {
            if (key !== 'children' && key !== 'appearance' && key !== 'size' && key !== 'disableButtonEnhancement' && key !== 'icon') {
                attributes[key] = props[key];
            }
        });

        attributes.type = attributes.type || 'button';
        attributes.className = ['stub-button', 'stub-button--' + (props.appearance || 'secondary'), props.className]
            .filter(Boolean)
            .join(' ');

        // The icon slot renders before the children, as the real one does when
        // iconPosition is 'before' (the default); 'after' is not modelled.
        return React.createElement('button', attributes, props.icon || null, props.children);
    }

    /**
     * `Spinner`: a `<span role="progressbar">` with the size as a class and a
     * CSS ring, so a loading state has something visible and something an
     * assertion can find. The real one animates with Griffel and takes a
     * `label`; this draws neither.
     */
    function Spinner(props) {
        var attributes = {
            role: 'progressbar',
            className: ['stub-spinner', 'stub-spinner--' + (props.size || 'medium'), props.className].filter(Boolean).join(' '),
        };

        Object.keys(props).forEach(function (key) {
            if (key.indexOf('aria-') === 0) {
                attributes[key] = props[key];
            }
        });

        return React.createElement('span', attributes, props.label || null);
    }

    /*
     * The `Menu` family, compound like `Popover`: `Menu` finds its trigger and
     * popover among its children, holds open/closed in state, and draws the
     * popover **inline under the trigger** when open. The real one portals to
     * the body, traps focus and closes on Escape and on an outside click;
     * this one does none of that, which is the safe direction — a rule scoped
     * through the control's root matches the menu here and nothing on a form.
     * The trigger's child is cloned to take the click, as the real one does.
     */
    function MenuTrigger(props) {
        return props.children;
    }

    MenuTrigger.__harnessRole = 'trigger';

    function MenuPopover(props) {
        return React.createElement(
            'div',
            {
                role: 'menu',
                className: 'stub-menu',
                style: {
                    position: 'absolute',
                    zIndex: 1,
                    marginTop: '4px',
                    minWidth: '160px',
                    padding: '4px',
                    background: 'var(--colorNeutralBackground1, #ffffff)',
                    borderRadius: '4px',
                    boxShadow: '0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)',
                },
            },
            props.children,
        );
    }

    MenuPopover.__harnessRole = 'surface';

    function MenuList(props) {
        return props.children;
    }

    function MenuItem(props) {
        return React.createElement(
            'button',
            {
                type: 'button',
                role: 'menuitem',
                className: 'stub-menuitem',
                disabled: props.disabled,
                onClick: props.onClick,
                style: { display: 'block', width: '100%', textAlign: 'start', font: 'inherit', background: 'none', border: 0, padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' },
            },
            props.children,
        );
    }

    function Menu(props) {
        var state = React.useState(false);
        var open = state[0];
        var setOpen = state[1];
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

        var child = trigger && trigger.props.children;
        var cloned = child
            ? React.cloneElement(child, {
                onClick: function () {
                    setOpen(!open);
                },
                'aria-haspopup': 'menu',
                'aria-expanded': open ? 'true' : 'false',
            })
            : null;

        return React.createElement(
            'div',
            {
                style: { position: 'relative', display: 'inline-block' },
                // A choice closes the menu, as it does on a form.
                onClickCapture: function (event) {
                    if (open && event.target && event.target.getAttribute && event.target.getAttribute('role') === 'menuitem') {
                        setOpen(false);
                    }
                },
            },
            cloned,
            open ? surface : null,
        );
    }

    /*
     * `Combobox` and `Option`, from pcf-address-autocomplete-azure's own copy
     * of this file — compound like `Popover`: the parent reads its children for
     * `Option`s. What it does *less* than Fluent's: no portal (the listbox is
     * inline, under the input), no arrow-key walk through the options, no
     * `aria-activedescendant`, no type-to-filter of its own. What it does the
     * same: a controlled `value` through `onChange`, `open` through
     * `onOpenChange`, a click on an option through
     * `onOptionSelect({}, { optionValue })`, and non-option children rendered
     * as they are inside the listbox — a notice row shows up that way.
     * `expandIcon={null}` is honoured by drawing no chevron.
     */
    function Option(props) {
        return React.createElement(
            'div',
            {
                role: 'option',
                className: 'fui-Option',
                'data-value': props.value,
                'aria-selected': 'false',
                style: { padding: '6px 12px', cursor: 'pointer' },
                onClick: props.__harnessSelect
                    ? function () {
                        props.__harnessSelect(props.value, props.text);
                    }
                    : undefined,
            },
            props.children,
        );
    }

    Option.__harnessRole = 'option';

    function Combobox(props) {
        var select = function (value, text) {
            if (props.onOptionSelect) {
                props.onOptionSelect({}, { optionValue: value, optionText: text, selectedOptions: [value] });
            }
        };

        var items = React.Children.map(props.children, function (child) {
            if (child && child.type && child.type.__harnessRole === 'option') {
                return React.cloneElement(child, { __harnessSelect: select });
            }

            return child;
        });

        var listboxProps = props.listbox || {};

        return React.createElement(
            'div',
            { className: props.className, style: { position: 'relative', flex: '1 1 auto', minWidth: 0 } },
            React.createElement('input', {
                type: 'text',
                role: 'combobox',
                className: 'fui-Combobox-input',
                value: props.value,
                placeholder: props.placeholder,
                disabled: props.disabled,
                'aria-label': props['aria-label'],
                'aria-invalid': props['aria-invalid'] ? 'true' : undefined,
                'aria-describedby': props['aria-describedby'],
                'aria-expanded': props.open ? 'true' : 'false',
                'aria-busy': props['aria-busy'] ? 'true' : undefined,
                'aria-autocomplete': 'list',
                autoComplete: 'off',
                style: { width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', font: 'inherit', padding: '5px 4px', outline: 'none' },
                onChange: props.onChange,
                onFocus: function () {
                    if (props.onOpenChange) {
                        props.onOpenChange({}, { open: true });
                    }
                },
            }),
            props.open
                ? React.createElement(
                    'div',
                    {
                        role: 'listbox',
                        className: listboxProps.className,
                        style: {
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: '100%',
                            zIndex: 1,
                            marginTop: '4px',
                            padding: '4px 0',
                            background: 'var(--colorNeutralBackground1, #ffffff)',
                            border: '1px solid var(--colorNeutralStroke1, #d1d1d1)',
                            borderRadius: '4px',
                            boxShadow: '0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)',
                            overflowY: 'auto',
                        },
                    },
                    items,
                )
                : null,
        );
    }

    global.__harnessFluent = {
        FluentProvider: FluentProvider,
        Popover: Popover,
        PopoverTrigger: PopoverTrigger,
        PopoverSurface: PopoverSurface,
        Combobox: Combobox,
        Option: Option,
        Button: Button,
        Spinner: Spinner,
        Avatar: Avatar,
        Menu: Menu,
        MenuTrigger: MenuTrigger,
        MenuPopover: MenuPopover,
        MenuList: MenuList,
        MenuItem: MenuItem,
        webLightTheme: webLightTheme,
        webDarkTheme: webDarkTheme,
    };
})(window);
