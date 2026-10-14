/**
 * Close a floating surface — a listbox, a popover, a menu — once the element
 * it hangs from scrolls out of the form.
 *
 * Fluent portals each of those to the end of `<body>` and keeps it placed
 * against its anchor, so nothing in the form's tree clips it. A form scrolled
 * with one open therefore carried it up over the form's header, which is not
 * part of the form's scroller: reported on pcf-lookup-search 0.3.0 with a
 * screenshot, measured on the test form 2026-10-13 — the field had scrolled
 * to y 123 under a header ending at 286, Fluent had marked the listbox
 * `data-popper-reference-hidden`, and drew it anyway.
 *
 * An IntersectionObserver with no `root` measures against the viewport
 * **clipped by every scrolling ancestor**, which is the question: how much of
 * the anchor can the user still see. It read 0 there. Below half, the
 * surface closes. A small scroll keeps it, a scroll that hides the anchor
 * does not, and the anchor brings it back on the next click.
 *
 * Fluent's own `closeOnScroll` is not this: it closes on any scroll outside
 * the surface, however small, and which Fluent a model-driven host loads is
 * the platform's choice, not the manifest's.
 *
 * No React here, so a suite can load it through `dev/modules.js`; the hook
 * beside it is the React half.
 */

/** Less than this much of the anchor visible, and the surface closes. */
export const VISIBLE_AT_LEAST = 0.5;

type ObserverConstructor = new (
    callback: (entries: Array<{ intersectionRatio: number }>) => void,
    options: { threshold: number[] },
) => { observe(target: Element): void; disconnect(): void };

/**
 * Call `onHidden` whenever less than half of `anchor` is visible, and return
 * the function that stops watching. A host without IntersectionObserver gets
 * a no-op: the surface then behaves as it did before this existed.
 *
 * `Observer` is a parameter so a suite can hand in a fake; a control leaves
 * it out.
 */
export function watchAnchor(
    anchor: Element,
    onHidden: () => void,
    Observer: ObserverConstructor | undefined = typeof IntersectionObserver === 'function'
        ? (IntersectionObserver as unknown as ObserverConstructor)
        : undefined,
): () => void {
    if (Observer === undefined) {
        return () => undefined;
    }

    const observer = new Observer(
        (entries) => {
            if (entries.some((entry) => entry.intersectionRatio < VISIBLE_AT_LEAST)) {
                onHidden();
            }
        },
        // 0 as well as the line itself: an anchor that leaves in one jump —
        // a tab switch, a collapsed section — crosses 0 without stopping at 0.5.
        { threshold: [0, VISIBLE_AT_LEAST, 1] },
    );

    observer.observe(anchor);

    return () => observer.disconnect();
}
