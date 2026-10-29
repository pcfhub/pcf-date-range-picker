/*
 * 0.3.9 — a probe build, not a release. It asks the form what 0.4.0 rests on
 * (SPEC.md, "0.4.0 — what must be measured first") and is deleted, with its
 * one line in index.ts, before the first line of 0.4.0 is written.
 *
 * Passive: one object logged once. Active: `window.__pcfDateRangeProbe`,
 * refreshed every pass so it always holds the current context.
 */

import { IInputs } from './generated/ManifestTypes';

let logged = false;

interface Loose {
    raw?: unknown;
    type?: unknown;
    formatted?: unknown;
}

export function probe(context: ComponentFramework.Context<IInputs>): void {
    const parameters = context.parameters as unknown as Record<string, Loose | undefined>;
    const info = (context.userSettings.dateFormattingInfo ?? {}) as unknown as Record<string, unknown>;
    const list = (value: unknown): unknown => (Array.isArray(value) ? { length: value.length, values: value } : value);
    const read = (name: string): unknown => {
        const p = parameters[name];

        return p === undefined ? 'absent' : { raw: p.raw, rawType: typeof p.raw, type: p.type, formatted: p.formatted };
    };

    const snapshot = (): Record<string, unknown> => ({
        minDays: read('minDays'),
        maxDays: read('maxDays'),
        fiscalYearStart: read('fiscalYearStart'),
        presets: read('presets'),
        monthNames: list(info.monthNames),
        abbreviatedMonthNames: list(info.abbreviatedMonthNames),
        monthGenitiveNames: list(info.monthGenitiveNames),
        abbreviatedMonthGenitiveNames: list(info.abbreviatedMonthGenitiveNames),
        yearMonthPattern: info.yearMonthPattern,
        webAPI: typeof context.webAPI,
        retrieveMultipleRecords: typeof context.webAPI?.retrieveMultipleRecords,
        browserOffsetNow: new Date().getTimezoneOffset(),
        userOffsetNow: context.userSettings.getTimeZoneOffsetMinutes(new Date()),
        today: new Date().toString(),
    });

    (window as unknown as { __pcfDateRangeProbe: unknown }).__pcfDateRangeProbe = {
        dump: (): Record<string, unknown> => {
            const s = snapshot();

            console.log(JSON.stringify(s, null, 2));

            return s;
        },
        /** P1, P2: the organisation row through the control's own webAPI, and the day it means. */
        org: async (): Promise<unknown> => {
            try {
                const result = await context.webAPI.retrieveMultipleRecords(
                    'organization',
                    '?$select=fiscalcalendarstart,fiscalperiodtype,fiscalyeardisplaycode',
                );
                const row = result.entities[0] as Record<string, unknown>;
                const raw = String(row.fiscalcalendarstart);
                const instant = new Date(raw);
                const offset = context.userSettings.getTimeZoneOffsetMinutes(instant);
                const wall = new Date(instant.getTime() + offset * 60_000);
                const out = {
                    row,
                    rawType: typeof row.fiscalcalendarstart,
                    offsetOnThatDay: offset,
                    userWallClock: wall.toISOString().replace('Z', ' (user wall clock)'),
                    userMonth: wall.getUTCMonth() + 1,
                    userDay: wall.getUTCDate(),
                    browserMonth: instant.getMonth() + 1,
                    browserDay: instant.getDate(),
                    utcMonth: instant.getUTCMonth() + 1,
                    utcDay: instant.getUTCDate(),
                };

                console.log(JSON.stringify(out, null, 2));

                return out;
            } catch (error) {
                const fault = { failed: true, error: JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error as object))) };

                console.log(JSON.stringify(fault, null, 2));

                return fault;
            }
        },
    };

    if (!logged) {
        logged = true;
        console.log('[DateRangePicker probe 0.3.9]', JSON.stringify(snapshot(), null, 2));
    }
}
