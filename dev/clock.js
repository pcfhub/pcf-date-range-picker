/*
 * A fake clock for the smoke rig.
 *
 * A control that ticks cannot be asserted against the real one: a countdown
 * test would have to wait a second to see a second pass, an interval leak takes
 * an afternoon to become visible, and a daylight-saving boundary arrives twice
 * a year. So time is replaced with something the test drives.
 *
 * **It is installed on the global rather than injected into the control.**
 * `smoke.js` evaluates the bundle with `vm.runInThisContext`, which shares this
 * realm — so the `Date`, `setInterval` and `clearInterval` the bundle closes
 * over are the ones this file overwrites. The alternative is a clock parameter
 * threaded through the control's constructor, which bends production code to
 * suit a harness and would then be the only reason that seam exists.
 *
 * What it deliberately does NOT do, in the spirit of `host.js`: it is not a
 * scheduler. Timers fire in the order they were created, `advance` runs them
 * repeatedly until the time budget is spent, and a timer cleared mid-advance
 * stops firing immediately — because that is the case a teardown bug hides in.
 * It does not model nested `setTimeout` chains beyond that, macro/microtask
 * ordering, or `requestAnimationFrame`. If a control needs those, this file is
 * a guess and the assertions resting on it prove nothing.
 */

/**
 * @param {number} start Epoch milliseconds the clock starts at.
 * @param {object} [global] The object carrying the timer functions; defaults to
 *   the real global, which is what the bundle sees.
 */
function install(start, global) {
    const target = global || globalThis;

    const RealDate = target.Date;
    const saved = {
        Date: target.Date,
        setInterval: target.setInterval,
        clearInterval: target.clearInterval,
        setTimeout: target.setTimeout,
        clearTimeout: target.clearTimeout,
    };

    let now = start;
    let nextId = 1;

    /** @type {Map<number, {due: number, every: number|null, fn: Function, args: unknown[]}>} */
    const timers = new Map();

    /*
     * A Date subclass rather than a stubbed `Date.now`.
     *
     * `new Date()` with no arguments does not go through `Date.now()` — it
     * reads the clock directly — so overriding only the static method leaves
     * every `new Date()` in the control reading the real time, which is the
     * half that matters here. Subclassing catches both, and keeps
     * `instanceof Date`, `Date.parse` and every instance method intact.
     */
    class FakeDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(now);

                return;
            }

            super(...args);
        }

        static now() {
            return now;
        }
    }

    target.Date = FakeDate;

    target.setInterval = (fn, every, ...args) => schedule(fn, every, every, args);
    target.setTimeout = (fn, after, ...args) => schedule(fn, after, null, args);
    target.clearInterval = clear;
    target.clearTimeout = clear;

    function schedule(fn, delay, every, args) {
        const id = nextId;

        nextId += 1;
        // A zero or absent delay is a real pattern and must not mean "never".
        timers.set(id, { due: now + (Number(delay) || 0), every: every === null ? null : Number(every) || 0, fn, args });

        return id;
    }

    function clear(id) {
        timers.delete(id);
    }

    return {
        /** Epoch milliseconds, as the control sees them. */
        now: () => now,

        /**
         * Move time forward, firing whatever falls due on the way.
         *
         * The loop re-reads the map on every pass, so a callback that clears
         * its own interval — or another one — is honoured immediately rather
         * than on the next advance.
         *
         * `guard` counts firings *at the same instant* rather than firings
         * overall, and the distinction matters: an hour of a one-second
         * interval is 3,600 legitimate ticks, and a cap on the total would
         * silently stop short of the time it was asked for — leaving `now`
         * right and the control's DOM an unpredictable distance behind it.
         * What is worth stopping is a callback that schedules a zero-delay
         * timer from inside itself, which never lets the clock move at all.
         */
        advance(ms) {
            const until = now + ms;
            let guard = 0;
            let last = now;

            for (;;) {
                let next = null;

                for (const [id, timer] of timers) {
                    if (timer.due <= until && (next === null || timer.due < next.timer.due)) {
                        next = { id, timer };
                    }
                }

                if (next === null) {
                    break;
                }

                guard = next.timer.due === last ? guard + 1 : 0;
                last = next.timer.due;

                if (guard > 10_000) {
                    throw new Error(`clock.advance: 10,000 timers fired without time moving past ${last}`);
                }

                now = next.timer.due;

                if (next.timer.every === null) {
                    timers.delete(next.id);
                } else {
                    next.timer.due = now + next.timer.every;
                }

                next.timer.fn(...next.timer.args);
            }

            now = until;
        },

        /** How many timers are live. The number a teardown assertion compares. */
        pending: () => timers.size,

        restore() {
            Object.assign(target, saved);
        },
    };
}

module.exports = { install };
