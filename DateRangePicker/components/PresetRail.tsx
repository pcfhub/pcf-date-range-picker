import * as React from 'react';
import { CalendarLocale, Preset, isFiscal, matchesPreset, resolvePreset } from '../calendar';

export interface IPresetRailProps {
    presets: Preset[];
    /**
     * The month the fiscal ranges count from, or `null` while the
     * organisation's setting is still being read.
     */
    fiscalMonth: number | null;
    start: Date | null;
    end: Date | null;
    today: Date;
    locale: CalendarLocale;
    disabled: boolean;
    text: (key: string) => string;
    onPick: (start: Date, end: Date) => void;
}

/**
 * The button's words. A named range has its own string; a counted one uses
 * the string for its own count where one exists — `last7`, `last30`, `next7`
 * and `next30` kept theirs from 0.3.x, translations included — and the
 * template "Last {0} days" for any other.
 */
function labelOf(preset: Preset, text: (key: string) => string): string {
    if (preset.kind === 'named' || preset.days === 7 || preset.days === 30) {
        return text(`Preset_${preset.token}`);
    }

    return text(preset.kind === 'last' ? 'Preset_lastN' : 'Preset_nextN').replace('{0}', String(preset.days));
}

/**
 * The quick ranges, as a column of toggle buttons.
 *
 * `aria-pressed` rather than `role="radio"`, and plain buttons rather than a
 * `role="listbox"`, for the reason `pcf-choices-picker` writes down: a radio
 * group promises arrow-key navigation between its members, and announcing a
 * keyboard contract the control does not honour is worse than presenting an
 * honest one. A column of toggle buttons is reached by Tab and activated by
 * Space or Enter, which is exactly what it looks like.
 *
 * A preset is pressed when the current pair *is* that range, so the rail
 * doubles as a read-out: a maker who set the columns to the calendar month sees
 * "This month" lit without having clicked it.
 *
 * A fiscal range waits for the organisation's fiscal start: until the read
 * answers it is `aria-disabled` and pressed never, and a press does nothing.
 * Not `disabled` — a keyboard user resting on it while it waits would be
 * blurred when it is (pcf-review's busy-button line).
 */
export function PresetRail(props: IPresetRailProps): React.ReactElement | null {
    if (props.presets.length === 0) {
        return null;
    }

    return (
        <div className="DateRangePicker-presets">
            <div className="DateRangePicker-presets-heading">{props.text('QuickRanges')}</div>
            {props.presets.map((preset) => {
                const waiting = isFiscal(preset) && props.fiscalMonth === null;
                const month = props.fiscalMonth ?? 0;
                const pressed = !waiting && matchesPreset(preset, props.start, props.end, props.today, props.locale, month);

                return (
                    <button
                        key={preset.token}
                        type="button"
                        className={`DateRangePicker-preset${pressed ? ' is-selected' : ''}`}
                        data-preset={preset.token}
                        aria-pressed={pressed}
                        aria-disabled={waiting || undefined}
                        aria-busy={waiting || undefined}
                        disabled={props.disabled}
                        onClick={(): void => {
                            if (waiting) {
                                return;
                            }

                            const range = resolvePreset(preset, props.today, props.locale, month);

                            props.onPick(range.start, range.end);
                        }}
                    >
                        {labelOf(preset, props.text)}
                    </button>
                );
            })}
        </div>
    );
}
