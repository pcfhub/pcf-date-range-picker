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
 * **And never thicker.** A shim that does *more* than the browser certifies
 * code the browser refuses: `querySelectorAll` and `children` return what a
 * browser returns — a `NodeList` and an `HTMLCollection`, with no `map`,
 * `filter` or `find` — so `el.children.forEach` fails here as it does on a
 * form. A suite that wants an array writes `Array.from(...)` itself.
 *
 * What it does not have, it does not pretend to have: nothing here can tell you
 * that a control *looks* right, that a stylesheet applies, or that focus and
 * keyboard order work. Those need `npm start`, `dev/harness.html` (pressed
 * with real keys through `dev/keys.js`), or a real form.
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

/*
 * The two collection shapes a browser hands back, as static snapshots:
 * indexable, `length`, `item()`, iterable — and nothing an Array has that
 * they do not. `NodeList` has `forEach` and the three iterators;
 * `HTMLCollection` has neither `forEach` nor iterators beyond the default,
 * and adds `namedItem`. (A browser's `children` is live; a snapshot is the
 * safe direction, since a control relying on liveness is relying on
 * something this cannot show.)
 */
function collection(proto, items) {
    var list = Object.create(proto);

    for (var i = 0; i < items.length; i += 1) {
        list[i] = items[i];
    }

    Object.defineProperty(list, 'length', { value: items.length });
    return list;
}

function values() {
    return Array.prototype.values.call(this);
}

var NodeListPrototype = {
    item: function (index) {
        return this[index] || null;
    },
    forEach: function (callback, thisArg) {
        for (var i = 0; i < this.length; i += 1) {
            callback.call(thisArg, this[i], i, this);
        }
    },
    entries: function () {
        return Array.prototype.entries.call(this);
    },
    keys: function () {
        return Array.prototype.keys.call(this);
    },
    values: values,
};
NodeListPrototype[Symbol.iterator] = values;
NodeListPrototype[Symbol.toStringTag] = 'NodeList';

var HTMLCollectionPrototype = {
    item: function (index) {
        return this[index] || null;
    },
    namedItem: function (name) {
        for (var i = 0; i < this.length; i += 1) {
            if (this[i].getAttribute('id') === name || this[i].getAttribute('name') === name) {
                return this[i];
            }
        }
        return null;
    },
};
HTMLCollectionPrototype[Symbol.iterator] = values;
HTMLCollectionPrototype[Symbol.toStringTag] = 'HTMLCollection';

function Element(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    /*
     * `style` is a plain bag plus the three methods a control actually calls on
     * it, because plain property assignment (`style.width = '320px'`) and
     * `setProperty` have to land in the same place — a control commonly writes
     * a CSS custom property one way and reads it back the other.
     *
     * Custom properties are the reason `setProperty` matters at all: `--x` is
     * not a valid JavaScript property name, so `style['--x'] = …` is not how
     * anyone writes it, and a control theming itself through custom properties
     * cannot be checked without this. What it does *not* do is compute
     * anything: there is no cascade here, no `getComputedStyle`, and a value
     * set is exactly the value read back.
     */
    this.style = {
        setProperty: function (name, value) {
            this[name] = value === null || value === undefined ? '' : String(value);
        },
        getPropertyValue: function (name) {
            return Object.prototype.hasOwnProperty.call(this, name) ? this[name] : '';
        },
        removeProperty: function (name) {
            var previous = this.getPropertyValue(name);

            delete this[name];

            return previous;
        },
    };
    this.classList = new ClassList(this);
    this.listeners = {};
    this._text = '';

    // Plain properties a control assigns directly. Declared so that reading one
    // back before it is set gives the browser's own default rather than
    // `undefined`, which several controls compare against.
    this.hidden = false;
    this.disabled = false;
    // `value` is an accessor — see *The text entry cursor* below — and these
    // are the state behind it, set directly so construction moves no cursor.
    this._value = '';
    this._selectionStart = 0;
    this._selectionEnd = 0;
    this._selectionDirection = 'none';
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

/*
 * `element.dataset`, backed by the same attribute map everything else reads.
 *
 * Not a separate bag: `dataset.index = '3'` and `getAttribute('data-index')`
 * have to agree, because a control writes through one and a test — or the
 * control's own later code — reads through the other. Keeping two stores in
 * step is the bug this avoids by not having two.
 *
 * camelCase to `data-kebab-case` is the real mapping, so `dataset.rowIndex`
 * becomes `data-row-index`. Deleting a key removes the attribute.
 */
Object.defineProperty(Element.prototype, 'dataset', {
    get: function () {
        var element = this;

        var toAttribute = function (key) {
            return 'data-' + String(key).replace(/[A-Z]/g, function (letter) {
                return '-' + letter.toLowerCase();
            });
        };

        return new Proxy(
            {},
            {
                get: function (_target, key) {
                    var name = toAttribute(key);

                    return Object.prototype.hasOwnProperty.call(element.attributes, name)
                        ? element.attributes[name]
                        : undefined;
                },
                set: function (_target, key, value) {
                    element.attributes[toAttribute(key)] = String(value);

                    return true;
                },
                deleteProperty: function (_target, key) {
                    delete element.attributes[toAttribute(key)];

                    return true;
                },
                has: function (_target, key) {
                    return Object.prototype.hasOwnProperty.call(element.attributes, toAttribute(key));
                },
            },
        );
    },
});

Object.defineProperty(Element.prototype, 'children', {
    get: function () {
        return collection(HTMLCollectionPrototype, this.childNodes);
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

/*
 * The handful of attributes a browser keeps in sync with a same-named property.
 *
 * `img.src = url` and `img.setAttribute('src', url)` are the same write in a
 * browser, and they were not here: the first set a plain property that
 * `getAttribute` could not see. That matters because of which assertions it
 * breaks — a test written as "the control requested no tile", checking
 * `getAttribute('src') === null`, passed whether or not the control had set
 * one. It was reading a slot nothing ever wrote to, and reporting the absence
 * as proof.
 *
 * The list is deliberately short. Reflection in a real DOM is per-element and
 * full of exceptions — `value` on an input reflects only until a user types,
 * `href` resolves to an absolute URL on read — and a stub that guessed at the
 * general rule would be wrong in a way nothing here could reveal. These are the
 * ones a code component sets as a property and a test reads as an attribute.
 * `value` is NOT in the list: it has a cursor behind it, modelled below,
 * because its real behaviour is the exception rather than the rule.
 */
['src', 'href', 'alt', 'title', 'type'].forEach(function (name) {
    Object.defineProperty(Element.prototype, name, {
        get: function () {
            return this.getAttribute(name) === null ? '' : this.getAttribute(name);
        },
        set: function (value) {
            this.setAttribute(name, value);
        },
        configurable: true,
    });
});

/*
 * The text entry cursor.
 *
 * `input.value = x` is the one assignment every field control makes, and in a
 * browser it has a side effect the caret rule exists for: **when the value
 * changes, the cursor moves to the end.** When it does not change — the same
 * string assigned again — the cursor stays where it was (HTML's value setter:
 * "if the new value is different from oldValue … move the text entry cursor
 * position to the end"). Both halves are modelled, because each certifies
 * something: without the first, an assertion about the caret passes whatever
 * the control does; without the second, an identical echo would look like a
 * caret jump and the suite would demand a guard that fixes nothing.
 *
 * So what actually loses a user's place is a value that *differs* arriving
 * while they type — the platform echoing an earlier keystroke late (see
 * `manifest.md`, *The platform echoes writes back out of order*), or a control
 * that reformats as you type. The `user` helpers below type the way a person
 * does, so a suite can put a stale echo in the middle and read the cursor.
 *
 * Only a text-entry input and a `<textarea>` have a cursor. On `type="email"`,
 * `number`, `checkbox` and the rest `selectionStart` is `null` and
 * `setSelectionRange` throws `InvalidStateError` — measured behaviour a control
 * reformatting an email box meets on its first keystroke, so it throws here
 * too. Other elements keep the plain `value` this file always gave them.
 */
var TEXT_ENTRY_TYPES = ['', 'text', 'search', 'url', 'tel', 'password'];

function hasCursor(element) {
    return element.tagName === 'TEXTAREA'
        || (element.tagName === 'INPUT' && TEXT_ENTRY_TYPES.indexOf(String(element.type).toLowerCase()) !== -1);
}

/*
 * The value sanitisation a browser applies on every write: a single-line input
 * cannot hold a line break, so pasting two lines into one yields one line.
 */
function sanitise(element, value) {
    var text = value === null || value === undefined ? '' : String(value);

    return element.tagName === 'INPUT' ? text.replace(/[\r\n]/g, '') : text;
}

Object.defineProperty(Element.prototype, 'value', {
    get: function () {
        return this._value;
    },
    set: function (value) {
        var next = sanitise(this, value);

        if (next === this._value) {
            return;
        }

        this._value = next;
        this._selectionStart = next.length;
        this._selectionEnd = next.length;
        this._selectionDirection = 'none';
    },
    configurable: true,
});

function cursorProperty(field) {
    return {
        get: function () {
            if (!hasCursor(this)) {
                return this.tagName === 'INPUT' ? null : undefined;
            }

            return this['_' + field];
        },
        set: function (value) {
            if (field === 'selectionStart') {
                this.setSelectionRange(value, Math.max(value, this._selectionEnd), this._selectionDirection);
            } else if (field === 'selectionEnd') {
                this.setSelectionRange(this._selectionStart, value, this._selectionDirection);
            } else {
                this.setSelectionRange(this._selectionStart, this._selectionEnd, value);
            }
        },
        configurable: true,
    };
}

Object.defineProperty(Element.prototype, 'selectionStart', cursorProperty('selectionStart'));
Object.defineProperty(Element.prototype, 'selectionEnd', cursorProperty('selectionEnd'));
Object.defineProperty(Element.prototype, 'selectionDirection', cursorProperty('selectionDirection'));

function invalidState(what) {
    var error = new Error(
        "Failed to execute '" + what + "' on 'HTMLInputElement': The input element's type ('"
        + this.type + "') does not support selection.",
    );

    error.name = 'InvalidStateError';

    return error;
}

/*
 * Clamped the way a browser clamps: both ends to the length, and a start past
 * the end pulled back to it rather than swapped.
 */
Element.prototype.setSelectionRange = function (start, end, direction) {
    if (!hasCursor(this)) {
        if (this.tagName === 'INPUT') {
            throw invalidState.call(this, 'setSelectionRange');
        }

        throw new Error('dev/dom.js: setSelectionRange exists only on an input or a textarea.');
    }

    var length = this._value.length;
    var to = Math.min(Math.max(0, Number(end) || 0), length);

    this._selectionEnd = to;
    this._selectionStart = Math.min(Math.max(0, Number(start) || 0), to);
    this._selectionDirection = direction === 'forward' || direction === 'backward' ? direction : 'none';
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

/*
 * `focus` and `blur` as events, not only as `activeElement`.
 *
 * A control that shows a guide while focused, or commits on leaving the field,
 * listens for these — and a `focus()` that only moved `activeElement` let such
 * a control pass a suite that never ran its handlers. Moving focus blurs what
 * had it first, as a browser does; focusing what already has focus fires
 * nothing. Neither bubbles, which is also true in a browser.
 */
Element.prototype.focus = function () {
    var previous = module.exports.document.activeElement;

    if (previous === this) {
        return;
    }

    module.exports.document.activeElement = this;

    if (previous && previous.dispatchEvent) {
        previous.dispatchEvent({ type: 'blur', target: previous, relatedTarget: this, preventDefault: function () {} });
    }

    this.dispatchEvent({ type: 'focus', target: this, relatedTarget: previous || null, preventDefault: function () {} });
};

Element.prototype.blur = function () {
    if (module.exports.document.activeElement !== this) {
        return;
    }

    module.exports.document.activeElement = null;
    this.dispatchEvent({ type: 'blur', target: this, relatedTarget: null, preventDefault: function () {} });
};

/*
 * `select()`, and the document-wide selection it puts there.
 *
 * Modelled rather than stubbed away, because `document.execCommand('copy')`
 * copies **the selection** — not an element, and not an argument. A control
 * using the deprecated clipboard path appends an off-screen `<textarea>`, sets
 * its value, and selects it, and forgetting that last step is a copy that
 * silently puts nothing on the clipboard.
 *
 * So the selection is recorded here and an `execCommand` stub reads it, which
 * makes that omission fail rather than pass. A `select()` that did nothing
 * would let it through.
 */
Element.prototype.select = function () {
    module.exports.document.selection = this.value === undefined ? this.textContent : this.value;

    if (hasCursor(this)) {
        this.setSelectionRange(0, this._value.length);
    }
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

function collect(element, selector, found) {
    element.childNodes.forEach(function (child) {
        if (matches(child, selector)) {
            found.push(child);
        }

        collect(child, selector, found);
    });

    return found;
}

Element.prototype.querySelectorAll = function (selector) {
    // Checked before walking rather than per element, so an unsupported
    // selector throws on an empty tree too — otherwise it would return null on
    // a container that happens to have nothing in it, which reads as "no match"
    // and is the wrong answer for a selector this cannot evaluate at all.
    assertSupported(selector);

    return collection(NodeListPrototype, collect(this, selector, []));
};

Element.prototype.querySelector = function (selector) {
    assertSupported(selector);
    return collect(this, selector, [])[0] || null;
};

Element.prototype.matches = function (selector) {
    assertSupported(selector);

    return matches(this, selector);
};

/**
 * Walk up from this element — itself included — to the first match.
 *
 * This is how a control with one delegated listener on a container turns an
 * event target into the item that was clicked, so a suite that cannot call it
 * cannot drive a click at all. Returns `null` at the root rather than throwing,
 * which is what the real API does and what the caller's guard is written for.
 * (`pcf-process-flow`'s own copy had both; syncing it on 2026-10-08 found the
 * template without them.)
 */
Element.prototype.closest = function (selector) {
    assertSupported(selector);

    var node = this;

    while (node) {
        if (node.tagName !== undefined && matches(node, selector)) {
            return node;
        }

        node = node.parentNode;
    }

    return null;
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
    /*
     * What `Element.select()` last put here, and what an `execCommand('copy')`
     * stub should read. `null` until something is selected, which is the state
     * a control that forgot to select leaves it in.
     */
    selection: null,
    createElement: createElement,
    /*
     * SVG, and anything else with a namespace.
     *
     * The namespace is accepted and ignored, which is honest rather than lazy:
     * nothing here renders, and every namespaced element behaves like any other
     * for the purposes a control puts it to — attributes, children, classes,
     * listeners. What it deliberately does *not* do is pretend to be an
     * `SVGElement`: there is no `getBBox`, no `ownerSVGElement`, no
     * `viewBox.baseVal`. A control reaching for those gets an honest
     * `undefined` here rather than a fake that would let an assertion pass on
     * geometry this file cannot compute.
     *
     * Worth having because drawing an icon in SVG is ordinary DOM work — the
     * opposite of `innerHTML`, which this file refuses on purpose because it
     * would need an HTML parser and because a control building markup from a
     * string is a finding rather than a thing to accommodate.
     */
    createElementNS: function (_namespace, tagName) {
        return createElement(tagName);
    },
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
 * A `FileReader`, because Node has `File` and `Blob` and not the one thing that
 * turns either into a data URL.
 *
 * Only `readAsDataURL`, which is the method a control that keeps a file in a
 * column actually uses — the other three would be stubs nobody drives.
 *
 * **It resolves on a later turn, exactly as the real one does**, which is the
 * whole reason it is worth having rather than faking. A control that assumes
 * the result is available when `readAsDataURL` returns works perfectly against
 * a synchronous stub and reads `null` in a browser; a suite that asserts on the
 * result therefore has to `await` a turn, and that is the honest shape.
 */
function FileReader() {
    this.result = null;
    this.error = null;
    this.onload = null;
    this.onerror = null;
    this.onabort = null;
    this._aborted = false;
}

FileReader.prototype.readAsDataURL = function (blob) {
    var reader = this;

    this._aborted = false;

    Promise.resolve()
        .then(function () {
            return blob.arrayBuffer();
        })
        .then(function (buffer) {
            // An aborted read reports nothing at all — see `abort` below.
            if (reader._aborted) {
                return;
            }

            reader.result =
                'data:'
                + (blob.type || 'application/octet-stream')
                + ';base64,'
                + Buffer.from(buffer).toString('base64');

            if (reader.onload) {
                reader.onload({ target: reader });
            }
        })
        .catch(function (error) {
            if (reader._aborted) {
                return;
            }

            reader.error = error;

            if (reader.onerror) {
                reader.onerror({ target: reader });
            }
        });
};

/**
 * Stops the pending read from ever calling back.
 *
 * This is what `destroy()` owes for a read still in flight: without it the
 * callback fires against a control the platform has already thrown away, and
 * writes into a container that is no longer on the page.
 */
FileReader.prototype.abort = function () {
    this._aborted = true;

    if (this.onabort) {
        this.onabort({ target: this });
    }
};

/*
 * A person at the keyboard: `dom.user.type(input, 'abc')`.
 *
 * Each helper edits at the cursor and fires what a browser fires for that
 * edit, in its order — `beforeinput` (cancelable, so `preventDefault()` stops
 * the edit), the edit, then `input` — with a real `inputType` and `data`. A
 * control that reformats as the user types reads exactly those, so a suite
 * that set `input.value` and dispatched a bare `input` event was testing a
 * sequence no browser produces.
 *
 * The shapes are Chromium's, which is what a model-driven form runs in:
 *
 * - `type(el, text)` — one `insertText` per character, each at the cursor,
 *   replacing any selection. `maxLength` truncates what is typed, not what is
 *   assigned — a browser limits the user, never the control.
 * - `paste(el, text)` — a cancelable `paste` event with `clipboardData`, then
 *   one `insertFromPaste`. Line breaks are stripped by the input itself.
 * - `backspace(el)` / `del(el)` — `deleteContentBackward` / `Forward`: the
 *   selection if there is one, otherwise one character. At the edge there is
 *   nothing to delete and nothing fires.
 * - `compose(el, steps, commit)` — an IME, and the Android keyboard, which
 *   composes every word: `compositionstart`, then per step `beforeinput`
 *   (`insertCompositionText`, **not** cancelable), `compositionupdate` and
 *   `input` with `isComposing: true`, then `compositionend`. Chromium fires the
 *   last `input` *before* `compositionend`, so a control that reformats on
 *   `input` rewrites the value under a composition still open — the reason to
 *   leave composition alone until it ends.
 * - `autofill(el, text)` — the browser filling a saved phone number or
 *   postcode: the whole value replaced, cursor at the end, an `input` with **no
 *   `inputType` and no `beforeinput` before it**, then `change`. A control that
 *   only intercepts `beforeinput` never sees it.
 *
 * Each focuses the element first, as clicking into it would. A disabled or
 * read-only input takes no typing and fires nothing; each helper returns
 * whether the edit happened.
 *
 * - `undo(el)` / `redo(el)` — Ctrl+Z / Ctrl+Y: `beforeinput` with
 *   `historyUndo` / `historyRedo`, **cancelable**. Not cancelled, the browser
 *   changes **nothing** and fires `input` with the same `inputType`, the value
 *   as it was and the cursor at 0 — measured on a model-driven form
 *   2026-09-28 (`pcf-input-mask` P3) in a box the control had rewritten, which
 *   is the case a suite needs: once a control assigns `value`, Chromium's own
 *   history no longer matches the box. The rig does not model the browser's
 *   history for a box nobody rewrote; a suite asserting that undo *works*
 *   without the control's help is asserting something this file cannot show.
 *   (`redo` is modelled on `undo`'s measured shape.)
 *
 * Not modelled: `keydown`/`keyup` — dispatch them yourself, or press real keys
 * against the harness with `dev/keys.js`, which is the only way to show a
 * press reaching a listener through its parents — drag and drop, and
 * a browser's own spell-check replacement. Autofill's shape is
 * Chromium's as documented, not measured on a form — a control relying on it
 * says so in `SPEC.md`.
 */
function inputEvent(type, target, init) {
    return {
        type: type,
        target: target,
        inputType: init.inputType,
        data: init.data === undefined ? null : init.data,
        isComposing: Boolean(init.isComposing),
        cancelable: Boolean(init.cancelable),
        defaultPrevented: false,
        preventDefault: function () {
            if (this.cancelable) {
                this.defaultPrevented = true;
            }
        },
    };
}

function editable(element) {
    if (!hasCursor(element)) {
        throw new Error('dev/dom.js: user.* types only into a text-entry input or a textarea, got ' + element.tagName
            + (element.tagName === 'INPUT' ? ' type="' + element.type + '"' : ''));
    }

    if (element.disabled || element.readOnly === true) {
        return false;
    }

    element.focus();

    return true;
}

/*
 * One edit: replace [start, end) with `text`, announced as `inputType`.
 * Returns false when `beforeinput` was prevented.
 */
function edit(element, inputType, text, start, end) {
    var before = inputEvent('beforeinput', element, { inputType: inputType, data: text, cancelable: true });

    element.dispatchEvent(before);

    if (before.defaultPrevented) {
        return false;
    }

    var insert = text === null ? '' : sanitise(element, text);

    element._value = element._value.slice(0, start) + insert + element._value.slice(end);
    element._selectionStart = start + insert.length;
    element._selectionEnd = start + insert.length;
    element._selectionDirection = 'none';

    element.dispatchEvent(inputEvent('input', element, { inputType: inputType, data: text }));

    return true;
}

function room(element, replacing) {
    var limit = typeof element.maxLength === 'number' && element.maxLength >= 0 ? element.maxLength : Infinity;

    return limit - (element._value.length - replacing);
}

/*
 * Undo and redo as a form measured them — see `undo` in the header above.
 * Returns true when the event was cancelled, which is the only case in which
 * anything can have happened: uncancelled, the browser changes nothing.
 */
function history(element, inputType) {
    if (!editable(element)) {
        return false;
    }

    var before = inputEvent('beforeinput', element, { inputType: inputType, cancelable: true });

    element.dispatchEvent(before);

    if (before.defaultPrevented) {
        return true;
    }

    element._selectionStart = 0;
    element._selectionEnd = 0;
    element._selectionDirection = 'none';
    element.dispatchEvent(inputEvent('input', element, { inputType: inputType }));

    return false;
}

var user = {
    type: function (element, text) {
        if (!editable(element)) {
            return false;
        }

        var any = false;

        Array.from(String(text)).forEach(function (character) {
            var start = element._selectionStart;
            var end = element._selectionEnd;

            if (room(element, end - start) < character.length) {
                return;
            }

            any = edit(element, 'insertText', character, start, end) || any;
        });

        return any;
    },

    paste: function (element, text) {
        if (!editable(element)) {
            return false;
        }

        var paste = {
            type: 'paste',
            target: element,
            cancelable: true,
            defaultPrevented: false,
            clipboardData: {
                getData: function (format) {
                    return format === 'text/plain' || format === 'text' || format === 'Text' ? String(text) : '';
                },
            },
            preventDefault: function () {
                this.defaultPrevented = true;
            },
        };

        element.dispatchEvent(paste);

        if (paste.defaultPrevented) {
            return false;
        }

        var start = element._selectionStart;
        var end = element._selectionEnd;
        var fits = sanitise(element, text).slice(0, Math.max(0, room(element, end - start)));

        return edit(element, 'insertFromPaste', fits, start, end);
    },

    backspace: function (element) {
        if (!editable(element)) {
            return false;
        }

        var start = element._selectionStart;
        var end = element._selectionEnd;

        if (start === end) {
            if (start === 0) {
                return false;
            }

            start -= 1;
        }

        return edit(element, 'deleteContentBackward', null, start, end);
    },

    del: function (element) {
        if (!editable(element)) {
            return false;
        }

        var start = element._selectionStart;
        var end = element._selectionEnd;

        if (start === end) {
            if (end === element._value.length) {
                return false;
            }

            end += 1;
        }

        return edit(element, 'deleteContentForward', null, start, end);
    },

    compose: function (element, steps, commit) {
        if (!editable(element)) {
            return false;
        }

        var list = (steps || []).slice();
        var last = list.length > 0 ? list[list.length - 1] : '';
        var final = commit === undefined ? last : commit;

        if (final !== last) {
            list.push(final);
        }

        var from = element._selectionStart;
        var to = element._selectionEnd;

        element.dispatchEvent({ type: 'compositionstart', target: element, data: '', preventDefault: function () {} });

        list.forEach(function (step) {
            var text = sanitise(element, step);

            element.dispatchEvent(inputEvent('beforeinput', element, {
                inputType: 'insertCompositionText',
                data: step,
                isComposing: true,
                cancelable: false,
            }));
            element.dispatchEvent({ type: 'compositionupdate', target: element, data: step, preventDefault: function () {} });

            element._value = element._value.slice(0, from) + text + element._value.slice(to);
            to = from + text.length;
            element._selectionStart = to;
            element._selectionEnd = to;

            element.dispatchEvent(inputEvent('input', element, {
                inputType: 'insertCompositionText',
                data: step,
                isComposing: true,
            }));
        });

        element.dispatchEvent({ type: 'compositionend', target: element, data: final, preventDefault: function () {} });

        return true;
    },

    undo: function (element) {
        return history(element, 'historyUndo');
    },

    redo: function (element) {
        return history(element, 'historyRedo');
    },

    autofill: function (element, text) {
        if (!editable(element)) {
            return false;
        }

        element._value = sanitise(element, text);
        element._selectionStart = element._value.length;
        element._selectionEnd = element._value.length;
        element._selectionDirection = 'none';

        element.dispatchEvent({ type: 'input', target: element, preventDefault: function () {} });
        element.dispatchEvent({ type: 'change', target: element, preventDefault: function () {} });

        return true;
    },
};

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
    define('FileReader', FileReader);

    /*
     * A viewport with one switch. A control that asks `matchMedia` whether the
     * screen is narrow — pcf-date-range-picker renders one month instead of
     * two below 36rem — gets `global.__viewport.narrow` as the answer to every
     * query, and it defaults to the desktop so every existing assertion sees
     * the layout it was written against. A suite flips it around one render
     * and back in a `finally`. Listeners are accepted and never fired: a
     * resize mid-test is not something this rig models, and pretending to
     * would certify a resize handler nothing has run.
     */
    global.__viewport = global.__viewport || { narrow: false };

    define('matchMedia', function (query) {
        return {
            media: query,
            get matches() {
                return global.__viewport.narrow;
            },
            addEventListener: function () {},
            removeEventListener: function () {},
            addListener: function () {},
            removeListener: function () {},
        };
    });

    /*
     * A browser has this global, and a control that delegates one listener on a
     * container reaches for it to narrow the event target before calling
     * `closest`. Without it the control throws `ReferenceError: Element is not
     * defined` from inside the bundle — which reads as a bug in the control
     * rather than as a gap here. (`pcf-process-flow`'s own copy had it; the
     * template's did not, and syncing that repository on 2026-10-08 found it.)
     *
     * Note there is deliberately no `HTMLElement`: this file has one element
     * class, and defining a second name for it would let a control's
     * `instanceof HTMLElement` pass here while meaning something this file does
     * not actually model.
     */
    define('Element', Element);

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

module.exports = {
    Element: Element,
    createElement: createElement,
    document: document,
    FileReader: FileReader,
    install: install,
    user: user,
};
