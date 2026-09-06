import * as React from 'react';
import { CalendarLocale, PresetToken, matchesPreset, resolvePreset } from '../calendar';

export interface IPresetRailProps {
    tokens: PresetToken[];
    start: Date | null;
    end: Date | null;
    today: Date;
    locale: CalendarLocale;
    disabled: boolean;
    text: (key: string) => string;
    onPick: (start: Date, end: Date) => void;
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
 */
export function PresetRail(props: IPresetRailProps): React.ReactElement | null {
    if (props.tokens.length === 0) {
        return null;
    }

    return (
        <div className="DateRangePicker-presets">
            <div className="DateRangePicker-presets-heading">{props.text('QuickRanges')}</div>
            {props.tokens.map((token) => {
                const pressed = matchesPreset(token, props.start, props.end, props.today, props.locale);

                return (
                    <button
                        key={token}
                        type="button"
                        className={`DateRangePicker-preset${pressed ? ' is-selected' : ''}`}
                        data-preset={token}
                        aria-pressed={pressed}
                        disabled={props.disabled}
                        onClick={(): void => {
                            const range = resolvePreset(token, props.today, props.locale);

                            props.onPick(range.start, range.end);
                        }}
                    >
                        {props.text(`Preset_${token}`)}
                    </button>
                );
            })}
        </div>
    );
}
