/*
 * Just enough DOM for a standard control to run in Node.
 *
 * `smoke.js` loads the built bundle outside a browser, and a standard (non
 * virtual) control's first act is `document.createElement`. There are two ways
 * to give it one: install jsdom, or write the part that is actually used. This
 * is the second, for the same reason the rest of `dev/` has no dependencies —
 * a browser emulator is a large thing to own in order to assert that a control
 * put the right class on a div.
 *
 * **It is deliberately thinner than a browser, and thin in the safe
 * direction.** It has no layout, no CSS, no default event behaviour and no
 * `innerHTML` parser. Anything it does not implement *throws by name* rather
 * than quietly returning undefined, so a missing piece shows up as "add it to
 * dev/dom.js" instead of as a mysterious assertion failure. A stub that
 * silently absorbs calls is how a smoke suite goes green for a control that
 * does nothing.
 *
 * What it does not have, it does not pretend to have: nothing here can tell you
 * that a control *looks* right, that a stylesheet applies, or that focus and
 * keyboard order work. Those need `npm start`, `dev/harness.html`, or a real
 * form.
 */

'use strict';

function ClassList(element) {
    this._element = element;
    this._names = [];
}

ClassList.prototype.add = function () {
    for (var i = 0; i < arguments.length; i += 1) {
        if (arguments[i] && this._names.indexOf(arguments[i]) === -1) {
            this._names.push(arguments[i]);
        }
    }
};

ClassList.prototype.remove = function () {
    for (var i = 0; i < arguments.length; i += 1) {
        var at = this._names.indexOf(arguments[i]);

        if (at !== -1) {
            this._names.splice(at, 1);
        }
    }
};

ClassList.prototype.contains = function (name) {
    return this._names.indexOf(name) !== -1;
};

/*
 * `toggle(name, force)` with the second argument honoured, including when it is
 * `false`. The control uses the two-argument form throughout — it is how a
 * state class follows a boolean without an if — and a toggle that ignored
 * `force` would flip a class on every render instead of tracking the state.
 */
ClassList.prototype.toggle = function (name, force) {
    var on = arguments.length > 1 ? Boolean(force) : !this.contains(name);

    if (on) {
        this.add(name);
    } else {
        this.remove(name);
    }

    return on;
};

ClassList.prototype.toString = function () {
    return this._names.join(' ');
};

function Element(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.style = {};
    this.classList = new ClassList(this);
    this.listeners = {};
    this._text = '';

    // Plain properties a control assigns directly. Declared so that reading one
    // back before it is set gives the browser's own default rather than
    // `undefined`, which several controls compare against.
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.type = '';
    this.title = '';
    this.placeholder = '';
    this.dir = '';
    this.id = '';
}

Object.defineProperty(Element.prototype, 'className', {
    get: function () {
        return this.classList.toString();
    },
    set: function (value) {
        this.classList._names = String(value)
            .split(/\s+/)
            .filter(function (name) {
                return name !== '';
            });
    },
});

Object.defineProperty(Element.prototype, 'textContent', {
    get: function () {
        return (
            this._text
            + this.childNodes
                .map(function (child) {
                    return child.textContent;
                })
                .join('')
        );
    },
    set: function (value) {
        this.childNodes = [];
        this._text = value === null || value === undefined ? '' : String(value);
    },
});

Object.defineProperty(Element.prototype, 'innerHTML', {
    get: function () {
        return this.textContent;
    },
    /*
     * Clearing only. `innerHTML = ''` is how the dataset control empties itself
     * between renders and is worth supporting; anything else would need an HTML
     * parser, and a control building markup from a string is a finding rather
     * than a thing to accommodate.
     */
    set: function (value) {
        if (String(value) !== '') {
            throw new Error('dev/dom.js supports innerHTML only for clearing (innerHTML = "").');
        }

        this.childNodes = [];
        this._text = '';
    },
});

Object.defineProperty(Element.prototype, 'children', {
    get: function () {
        return this.childNodes.slice();
    },
});

Object.defineProperty(Element.prototype, 'firstChild', {
    get: function () {
        return this.childNodes[0] || null;
    },
});

Element.prototype.appendChild = function (child) {
    if (child.parentNode) {
        child.parentNode.removeChild(child);
    }

    child.parentNode = this;
    this.childNodes.push(child);

    return child;
};

Element.prototype.append = function () {
    for (var i = 0; i < arguments.length; i += 1) {
        this.appendChild(arguments[i]);
    }
};

Element.prototype.removeChild = function (child) {
    var at = this.childNodes.indexOf(child);

    if (at !== -1) {
        this.childNodes.splice(at, 1);
        child.parentNode = null;
    }

    return child;
};

Element.prototype.remove = function () {
    if (this.parentNode) {
        this.parentNode.removeChild(this);
    }
};

Element.prototype.setAttribute = function (name, value) {
    this.attributes[name] = String(value);

    if (name === 'class') {
        this.className = value;
    }
};

Element.prototype.getAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
};

Element.prototype.hasAttribute = function (name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
};

Element.prototype.removeAttribute = function (name) {
    delete this.attributes[name];
};

Element.prototype.addEventListener = function (type, handler) {
    (this.listeners[type] = this.listeners[type] || []).push(handler);
};

Element.prototype.removeEventListener = function (type, handler) {
    var list = this.listeners[type] || [];
    var at = list.indexOf(handler);

    if (at !== -1) {
        list.splice(at, 1);
    }
};

/**
 * Fire a listener the way a user would.
 *
 * No bubbling and no default actions: an event dispatched here reaches the
 * listeners on that one element and nothing else. Every handler a PCF control
 * attaches is a direct one, so the missing capture and bubble phases have not
 * been needed — add them here, not around them, if that changes.
 */
Element.prototype.dispatchEvent = function (event) {
    var list = (this.listeners[event.type] || []).slice();

    for (var i = 0; i < list.length; i += 1) {
        list[i].call(this, event);
    }

    return true;
};

Element.prototype.click = function () {
    this.dispatchEvent({ type: 'click', target: this, preventDefault: function () {} });
};

Element.prototype.focus = function () {
    module.exports.document.activeElement = this;
};

/*
 * The table builders, because the scaffolded dataset control uses them and
 * `document.createElement('tr').insertCell()` is not something a plain object
 * has. They behave as the DOM's do: each returns the element it created and
 * appends it in the right place.
 */
Element.prototype.createTHead = function () {
    return this.appendChild(createElement('thead'));
};

Element.prototype.createTBody = function () {
    return this.appendChild(createElement('tbody'));
};

Element.prototype.insertRow = function () {
    return this.appendChild(createElement('tr'));
};

Element.prototype.insertCell = function () {
    return this.appendChild(createElement('td'));
};

/**
 * A single-step selector: `tag`, `.class`, or `tag.class`.
 *
 * Descendant combinators, attribute selectors and `>` are not implemented —
 * they throw rather than silently matching nothing, which is the difference
 * between a selector that is unsupported and a selector that is wrong.
 */
function assertSupported(selector) {
    if (/[\s>[\]:,#]/.test(selector)) {
        throw new Error('dev/dom.js supports only "tag", ".class" and "tag.class" selectors, got: ' + selector);
    }
}

function matches(element, selector) {
    var parts = selector.split('.');
    var tag = parts.shift();

    if (tag !== '' && element.tagName !== tag.toUpperCase()) {
        return false;
    }

    return parts.every(function (name) {
        return element.classList.contains(name);
    });
}

Element.prototype.querySelectorAll = function (selector) {
    var found = [];

    // Checked before walking rather than per element, so an unsupported
    // selector throws on an empty tree too — otherwise it would return null on
    // a container that happens to have nothing in it, which reads as "no match"
    // and is the wrong answer for a selector this cannot evaluate at all.
    assertSupported(selector);

    this.childNodes.forEach(function (child) {
        if (matches(child, selector)) {
            found.push(child);
        }

        found = found.concat(child.querySelectorAll(selector));
    });

    return found;
};

Element.prototype.querySelector = function (selector) {
    return this.querySelectorAll(selector)[0] || null;
};

function createElement(tagName) {
    return new Element(tagName);
}

var document = {
    documentElement: createElement('html'),
    activeElement: null,
    /*
     * `document` is where page-level events live — `visibilitychange`,
     * `fullscreenchange`, a keydown handler a popup installs to close itself —
     * and a listener put here is the one that outlives the control: the
     * platform throws the container's subtree away on unmount, so a listener on
     * an element inside it goes with it, and a listener on `document` does not.
     * That makes it exactly the thing a teardown assertion needs to see, which
     * it cannot do if this object has no event API and the control throws
     * instead.
     *
     * Borrowed from Element rather than reimplemented, so document-level
     * dispatch behaves the same as element-level dispatch — including having no
     * bubbling, which is the limitation stated above `Element.dispatchEvent`.
     */
    listeners: {},
    addEventListener: Element.prototype.addEventListener,
    removeEventListener: Element.prototype.removeEventListener,
    dispatchEvent: Element.prototype.dispatchEvent,
    /*
     * Visible, because that is the state a test starts in and the one the
     * platform is in whenever it calls a control. Set it directly before
     * dispatching `visibilitychange`, which is what the browser does — the
     * property changes first and the event announces it.
     */
    hidden: false,
    createElement: createElement,
    createTextNode: function (text) {
        var node = createElement('#text');
        node.textContent = text;

        return node;
    },
    createDocumentFragment: function () {
        return createElement('#fragment');
    },
};

document.body = createElement('body');
document.documentElement.appendChild(document.body);

/**
 * Install the shim as this process's globals.
 *
 * Called before the bundle is loaded, because a control's module scope can read
 * `document` at import time.
 */
function install(global) {
    global.document = document;

    /*
     * Assigned only where the name is free.
     *
     * Node defines some of these itself and defines them as getter-only —
     * `navigator` has been there since Node 21 — so a plain assignment throws
     * `Cannot set property navigator of #<Object> which has only a getter`,
     * which reads as a bug in the control rather than as this file colliding
     * with the runtime. Node's own `navigator` is a real one and better than
     * anything here, so where it exists it is left alone.
     */
    define('window', global);
    define('self', global);
    define('navigator', { userAgent: 'dev/dom.js', language: 'en-US' });

    function define(name, value) {
        if (global[name] !== undefined) {
            return;
        }

        try {
            global[name] = value;
        } catch (error) {
            Object.defineProperty(global, name, { value: value, configurable: true, writable: true });
        }
    }

    return document;
}

module.exports = { Element: Element, createElement: createElement, document: document, install: install };
