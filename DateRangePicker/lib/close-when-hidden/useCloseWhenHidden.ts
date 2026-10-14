import * as React from 'react';
import { watchAnchor } from './watch';

/**
 * While `open`, close the surface hanging from `anchor` once the anchor
 * scrolls out of the form (`watch.ts` has why, and the measurement).
 *
 * `anchor` is the element the surface is placed against — the field, or a
 * menu's trigger button — held in state (`ref={setAnchor}`) rather than a
 * ref, so the watch starts when the element exists. `close` may change on
 * every render; the latest one is called.
 *
 * **Focus goes back to the anchor first, without scrolling.** A popover that
 * traps focus, and a menu, which focuses its first item, hand focus back to
 * their trigger when they close — and focusing an element scrolls it into
 * view. Measured on pcf-date-range-picker 0.3.3's first build, 2026-10-14:
 * the observer closed the popover, Fluent focused the field, and the form
 * jumped from scrollTop 491 back to 269, undoing the scroll the user had just
 * made. With focus already on the anchor, Fluent has nothing to restore. A
 * surface that keeps focus in its field (a combobox) is left as it is.
 */
export function useCloseWhenHidden(anchor: Element | null, open: boolean, close: () => void): void {
    const latest = React.useRef(close);

    latest.current = close;

    React.useEffect(() => {
        if (!open || anchor === null) {
            return undefined;
        }

        return watchAnchor(anchor, () => {
            if (!anchor.contains(anchor.ownerDocument.activeElement) && typeof (anchor as HTMLElement).focus === 'function') {
                (anchor as HTMLElement).focus({ preventScroll: true });
            }

            latest.current();
        });
    }, [open, anchor]);
}
