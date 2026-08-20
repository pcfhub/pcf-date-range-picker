import * as React from 'react';
import { Field } from '@fluentui/react-components';
import {
    RangeRules,
    daysBetween,
    fromInputValue,
    toInputValue,
    validateRange,
} from '../range';

export interface IProps {
    startDate: Date | null;
    endDate: Date | null;
    rules: RangeRules;
    visible: boolean;
    startReadable: boolean;
    endReadable: boolean;
    startEditable: boolean;
    endEditable: boolean;
    startError: string | null;
    endError: string | null;
    label: string;
    isRTL: boolean;
    showDuration: boolean;
    resources: ComponentFramework.Resources;
    formatDate: (date: Date) => string;
    onChange: (start: Date | null, end: Date | null) => void;
}

/**
 * Two native `<input type="date">` wrapped in Fluent `Field` for the label,
 * validation state and hint.
 *
 * Native rather than a Fluent DatePicker on purpose: Fluent 9's picker lives in
 * `@fluentui/react-datepicker-compat`, which is **not** one of the platform
 * libraries — importing it would bundle it, along with the calendar package,
 * and undo the reason this control is virtual at all. The browser's own control
 * brings the calendar, the keyboard handling and the locale for free, and its
 * value is always `yyyy-mm-dd` regardless of the display locale, which removes
 * a whole class of parsing bugs.
 *
 * Edit state lives here rather than on the control class. On a real form either
 * would work, because the platform re-renders after `notifyOutputChanged()`.
 * PCFHub's demo harness does not — it posts the outputs to the parent window
 * and neither re-renders nor writes the value back — so a component rendering
 * straight from props would look dead in the published demo.
 */
export function DateRangePickerControl(props: IProps): React.ReactElement | null {
    const [start, setStart] = React.useState<Date | null>(props.startDate);
    const [end, setEnd] = React.useState<Date | null>(props.endDate);

    // Resync on the *instant*, not on the object: every `updateView` hands down
    // a fresh Date, so depending on identity would reset local state on every
    // pass and discard whatever the user was typing.
    const incomingStart = props.startDate === null ? null : props.startDate.getTime();
    const incomingEnd = props.endDate === null ? null : props.endDate.getTime();

    React.useEffect(() => {
        setStart(incomingStart === null ? null : new Date(incomingStart));
    }, [incomingStart]);

    React.useEffect(() => {
        setEnd(incomingEnd === null ? null : new Date(incomingEnd));
    }, [incomingEnd]);

    if (!props.visible) {
        return null;
    }

    const text = (key: string): string => props.resources.getString(`DateRangePicker_${key}`);

    if (!props.startReadable || !props.endReadable) {
        return <p className="DateRangePicker-message">{text('NoAccess')}</p>;
    }

    const problem = validateRange(start, end, props.rules);

    const change = (which: 'start' | 'end') => (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = fromInputValue(event.target.value);
        const nextStart = which === 'start' ? parsed : start;
        const nextEnd = which === 'end' ? parsed : end;

        if (which === 'start') {
            setStart(parsed);
        } else {
            setEnd(parsed);
        }

        props.onChange(nextStart, nextEnd);
    };

    const bounds = {
        min: props.rules.min === null ? undefined : toInputValue(props.rules.min),
        max: props.rules.max === null ? undefined : toInputValue(props.rules.max),
    };

    return (
        <div className="DateRangePicker" dir={props.isRTL ? 'rtl' : 'ltr'}>
            <div className="DateRangePicker-fields">
                <Field
                    label={text('StartLabel')}
                    validationState={props.startError === null ? 'none' : 'error'}
                    validationMessage={props.startError ?? undefined}
                >
                    <input
                        className="DateRangePicker-input"
                        type="date"
                        value={start === null ? '' : toInputValue(start)}
                        disabled={!props.startEditable}
                        aria-label={props.label || text('StartLabel')}
                        {...bounds}
                        onChange={change('start')}
                    />
                </Field>

                <Field
                    label={text('EndLabel')}
                    validationState={props.endError === null ? 'none' : 'error'}
                    validationMessage={props.endError ?? undefined}
                >
                    <input
                        className="DateRangePicker-input"
                        type="date"
                        value={end === null ? '' : toInputValue(end)}
                        disabled={!props.endEditable}
                        aria-label={text('EndLabel')}
                        {...bounds}
                        onChange={change('end')}
                    />
                </Field>
            </div>

            {problem !== null && (
                <p className="DateRangePicker-message" role="alert">
                    {text(problem)}
                </p>
            )}

            {problem === null && props.showDuration && start !== null && end !== null && (
                <p className="DateRangePicker-duration">
                    {text('Duration')
                        .replace('{0}', String(daysBetween(start, end) + 1))
                        .replace('{1}', props.formatDate(start))
                        .replace('{2}', props.formatDate(end))}
                </p>
            )}
        </div>
    );
}
