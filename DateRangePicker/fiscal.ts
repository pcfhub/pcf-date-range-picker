/**
 * The month the fiscal year starts in — from the maker, or from the
 * organisation's own Fiscal Year Settings.
 *
 * The control's one Web API read, and only when a fiscal quick range is
 * listed and `fiscalYearStart` is `org`. Kept apart from the component so the
 * conversion below is one function the suite can hold to the measurement.
 */

/** January is 0, as `Date.getMonth` counts. */
export type Month = number;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * What `fiscalYearStart` asks for: a month, or the organisation's setting.
 *
 * **`null` is the organisation.** Measured on the form on 29 October 2026: a
 * control already placed on a form when this Enum was added hands over `raw`
 * `null`, not its manifest default — the form XML has no entry for it, and
 * `default-value` is applied only when the property is configured. `org` is
 * the default, so the absent value has to mean it too. Anything unrecognised
 * — a canvas formula can put anything in an Enum — means it as well.
 */
export function fiscalSetting(raw: string | null | undefined): { month: Month } | 'org' {
    const index = MONTHS.indexOf(String(raw ?? '').toLowerCase());

    return index === -1 ? 'org' : { month: index };
}

/** The slice of `context.webAPI` this reads through. */
export interface OrganisationReader {
    retrieveMultipleRecords: (entity: string, options?: string) => Promise<{ entities: Record<string, unknown>[] }>;
}

/**
 * The month `organization.fiscalcalendarstart` starts in, **in the Dataverse
 * user's zone**.
 *
 * The column is UserLocal behind a Date Only format — the shape that cost
 * 0.2.x four releases — so its value is an instant, not a day. Read off the
 * test organisation on 29 October 2026, set to 1 April: `"2022-04-01T10:59:00Z"`,
 * formatted `"4/1/2022"`. That instant is 1 April in the user's zone there
 * (UTC−5), but 10:59Z is already 2 April east of UTC+13, and a start set at
 * 00:30 in UTC−5 is 31 March in UTC. So the month is taken from the instant
 * moved into the user's zone by `getTimeZoneOffsetMinutes(that date)` — the
 * platform's sign, minutes ahead of UTC — exactly as `fromPlatform` reads a
 * UserLocal moment. With no user zone to ask, the browser's month.
 *
 * `null` when there is nothing to read: no row, no value, a value that is not
 * a date.
 */
export function monthOfFiscalStart(value: unknown, offsetFor: (date: Date) => number | null): Month | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    const instant = new Date(value);

    if (Number.isNaN(instant.getTime())) {
        return null;
    }

    const offset = offsetFor(instant);

    return offset === null ? instant.getMonth() : new Date(instant.getTime() + offset * 60_000).getUTCMonth();
}

/** One read per Web API object, so three pickers on a form ask once each and a re-render asks nothing. */
const reads = new WeakMap<object, Promise<Month>>();

/**
 * The organisation's fiscal start month, read once, January if the read
 * fails or answers nothing. Never rejects: a fiscal range that cannot learn
 * its year still has to draw something, and January is the platform's own
 * default for an organisation that never set one.
 */
export function readFiscalMonth(webAPI: OrganisationReader, offsetFor: (date: Date) => number | null): Promise<Month> {
    const known = reads.get(webAPI);

    if (known !== undefined) {
        return known;
    }

    const read = webAPI
        .retrieveMultipleRecords('organization', '?$select=fiscalcalendarstart')
        .then((result) => monthOfFiscalStart(result.entities[0]?.fiscalcalendarstart, offsetFor) ?? 0)
        .catch(() => 0);

    reads.set(webAPI, read);

    return read;
}
