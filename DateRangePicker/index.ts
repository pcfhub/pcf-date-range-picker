import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { DateRangePickerControl, IProps } from './components/DateRangePickerControl';
import { validateRange } from './range';

/**
 * A virtual (React) field control over **two** bound columns.
 *
 * The difference from the standard control is the whole point: `updateView`
 * *returns* an element instead of writing into a container, so the platform
 * owns reconciliation and React never enters the bundle — it is declared as a
 * `<platform-library>` and resolved at runtime by the host.
 *
 * Two bound properties is the exception to the usual one-per-control rule, and
 * the manifest explains why: a date range genuinely is two columns, so the
 * second column picker a maker sees is the right question rather than a
 * symptom.
 */
export class DateRangePicker implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private notifyOutputChanged!: () => void;

    /** The last values handed *back to the platform*, not the ones on screen. */
    private startDate: Date | null = null;
    private endDate: Date | null = null;

    /**
     * The last values the *platform* supplied. `undefined` means nothing has
     * arrived yet, which is why it is not `null` — null is a real value.
     *
     * Without this guard, `updateView` running after our own
     * `notifyOutputChanged` re-adopts the platform's value and discards the
     * edit that caused it. On a canvas app whose property is bound to a
     * constant that is every edit, and the control reads as frozen.
     */
    private lastIncomingStart: Date | null | undefined = undefined;
    private lastIncomingEnd: Date | null | undefined = undefined;

    public init(
        _context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
    ): void {
        // No container: a virtual control never receives one.
        this.notifyOutputChanged = notifyOutputChanged;
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const start = context.parameters.startDate;
        const end = context.parameters.endDate;

        // Guarded, not assigned unconditionally — see lastIncoming* above.
        // Compared by time value, because every pass hands down a fresh Date
        // object and `!==` on the objects is always true.
        const incomingStart = start.raw ?? null;
        const incomingEnd = end.raw ?? null;

        if (!sameInstant(incomingStart, this.lastIncomingStart)) {
            this.lastIncomingStart = incomingStart;
            this.startDate = incomingStart;
        }

        if (!sameInstant(incomingEnd, this.lastIncomingEnd)) {
            this.lastIncomingEnd = incomingEnd;
            this.endDate = incomingEnd;
        }

        // Each column carries its own security. A user can be denied one and
        // not the other, so these are not a single flag — no control in this
        // repository has had two before.
        const startReadable = start.security === undefined || start.security.readable;
        const endReadable = end.security === undefined || end.security.readable;

        const editable = (property: ComponentFramework.PropertyTypes.DateTimeProperty): boolean =>
            !context.mode.isControlDisabled
            && (property.security === undefined || property.security.editable);

        const rules = {
            allowSameDay: context.parameters.allowSameDay.raw,
            min: context.parameters.minDate.raw ?? null,
            max: context.parameters.maxDate.raw ?? null,
        };

        const props: IProps = {
            startDate: this.startDate,
            endDate: this.endDate,
            rules,
            visible: context.mode.isVisible,
            startReadable,
            endReadable,
            startEditable: editable(start),
            endEditable: editable(end),
            // The platform's own validation, kept separate from the control's
            // range check: they are different failures and one must not
            // overwrite the other.
            startError: start.error ? start.errorMessage : null,
            endError: end.error ? end.errorMessage : null,
            label: context.mode.label,
            isRTL: context.userSettings.isRTL,
            showDuration: context.parameters.showDuration.raw,
            resources: context.resources,
            formatDate: (date: Date): string => context.formatting.formatDateShort(date),
            onChange: (nextStart: Date | null, nextEnd: Date | null): void => {
                // A range that breaks a rule is shown but never handed over, so
                // the columns cannot hold a backwards pair. The component keeps
                // rendering what the user typed and says why it is not saved.
                if (validateRange(nextStart, nextEnd, rules) !== null) {
                    return;
                }

                if (sameInstant(nextStart, this.startDate) && sameInstant(nextEnd, this.endDate)) {
                    return;
                }

                this.startDate = nextStart;
                this.endDate = nextEnd;
                this.notifyOutputChanged();
            },
        };

        return React.createElement(DateRangePickerControl, props);
    }

    public getOutputs(): IOutputs {
        // Both bound properties, every time.
        //
        // `null` clears a column; `undefined` means "no change". The generated
        // IOutputs types these as `Date | undefined`, so `?? undefined`
        // type-checks and quietly turns every clear into a no-op — canvas
        // honours that strictly and the field simply will not empty. The cast
        // is the fix, not a workaround.
        return {
            startDate: this.startDate === null ? (null as unknown as undefined) : this.startDate,
            endDate: this.endDate === null ? (null as unknown as undefined) : this.endDate,
        };
    }

    public destroy(): void {
        // Usually empty for a virtual control: React unmounts its own tree, and
        // anything added outside it in `init` would be released here.
    }
}

/**
 * `updateView` hands down a fresh `Date` on every pass, so identity comparison
 * always reports a change. Compare the instant instead.
 */
function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
    if (a === null || a === undefined || b === null || b === undefined) {
        return a === b;
    }

    return a.getTime() === b.getTime();
}
