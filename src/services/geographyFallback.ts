/**
 * Geography fallback for EF matching (Country → Region → Global).
 *
 * Used when a questionnaire row has Category → Sub-category → Group → Specific Type
 * but NO explicit Geography pin (unlike Q10/Q13). The 5th key comes from Q4
 * manufacturing site (or a per-row country/region when present).
 *
 * EF `geography` values look like "CH-Switzerland", "RER-Europe", "GLO", "IN-India".
 * Q4 stores human names ("Switzerland", "Europe") — match flexibly.
 */

/** ISO-2 (and common aliases) for Q4 country names → EF geography prefixes. */
const COUNTRY_ISO: Record<string, string> = {
    afghanistan: "AF", albania: "AL", algeria: "DZ", andorra: "AD", angola: "AO",
    "antigua and barbuda": "AG", argentina: "AR", armenia: "AM", australia: "AU",
    austria: "AT", azerbaijan: "AZ", bahamas: "BS", bahrain: "BH", bangladesh: "BD",
    barbados: "BB", belarus: "BY", belgium: "BE", belize: "BZ", benin: "BJ",
    bhutan: "BT", bolivia: "BO", "bosnia and herzegovina": "BA", botswana: "BW",
    brazil: "BR", brunei: "BN", bulgaria: "BG", "burkina faso": "BF", burundi: "BI",
    "cabo verde": "CV", cambodia: "KH", cameroon: "CM", canada: "CA",
    "central african republic": "CF", chad: "TD", chile: "CL", china: "CN",
    colombia: "CO", comoros: "KM", congo: "CG", "costa rica": "CR", croatia: "HR",
    cuba: "CU", cyprus: "CY", "czech republic": "CZ", denmark: "DK", djibouti: "DJ",
    dominica: "DM", "dominican republic": "DO", ecuador: "EC", egypt: "EG",
    "el salvador": "SV", "equatorial guinea": "GQ", eritrea: "ER", estonia: "EE",
    eswatini: "SZ", ethiopia: "ET", fiji: "FJ", finland: "FI", france: "FR",
    gabon: "GA", gambia: "GM", georgia: "GE", germany: "DE", ghana: "GH",
    greece: "GR", grenada: "GD", guatemala: "GT", guinea: "GN", "guinea-bissau": "GW",
    guyana: "GY", haiti: "HT", honduras: "HN", hungary: "HU", iceland: "IS",
    india: "IN", indonesia: "ID", iran: "IR", iraq: "IQ", ireland: "IE", israel: "IL",
    italy: "IT", jamaica: "JM", japan: "JP", jordan: "JO", kazakhstan: "KZ",
    kenya: "KE", kiribati: "KI", kuwait: "KW", kyrgyzstan: "KG", laos: "LA",
    latvia: "LV", lebanon: "LB", lesotho: "LS", liberia: "LR", libya: "LY",
    liechtenstein: "LI", lithuania: "LT", luxembourg: "LU", madagascar: "MG",
    malawi: "MW", malaysia: "MY", maldives: "MV", mali: "ML", malta: "MT",
    "marshall islands": "MH", mauritania: "MR", mauritius: "MU", mexico: "MX",
    micronesia: "FM", moldova: "MD", monaco: "MC", mongolia: "MN", montenegro: "ME",
    morocco: "MA", mozambique: "MZ", myanmar: "MM", namibia: "NA", nauru: "NR",
    nepal: "NP", netherlands: "NL", "new zealand": "NZ", nicaragua: "NI", niger: "NE",
    nigeria: "NG", "north korea": "KP", "north macedonia": "MK", norway: "NO",
    oman: "OM", pakistan: "PK", palau: "PW", palestine: "PS", panama: "PA",
    "papua new guinea": "PG", paraguay: "PY", peru: "PE", philippines: "PH",
    poland: "PL", portugal: "PT", qatar: "QA", romania: "RO", russia: "RU",
    rwanda: "RW", "saint kitts and nevis": "KN", "saint lucia": "LC",
    "saint vincent and the grenadines": "VC", samoa: "WS", "san marino": "SM",
    "sao tome and principe": "ST", "saudi arabia": "SA", senegal: "SN", serbia: "RS",
    seychelles: "SC", "sierra leone": "SL", singapore: "SG", slovakia: "SK",
    slovenia: "SI", "solomon islands": "SB", somalia: "SO", "south africa": "ZA",
    "south korea": "KR", "south sudan": "SS", spain: "ES", "sri lanka": "LK",
    sudan: "SD", suriname: "SR", sweden: "SE", switzerland: "CH", syria: "SY",
    taiwan: "TW", tajikistan: "TJ", tanzania: "TZ", thailand: "TH", "timor-leste": "TL",
    togo: "TG", tonga: "TO", "trinidad and tobago": "TT", tunisia: "TN", turkey: "TR",
    turkmenistan: "TM", tuvalu: "TV", uganda: "UG", ukraine: "UA",
    "united arab emirates": "AE", "united kingdom": "GB", "united states": "US",
    uruguay: "UY", uzbekistan: "UZ", vanuatu: "VU", "vatican city": "VA",
    venezuela: "VE", vietnam: "VN", yemen: "YE", zambia: "ZM", zimbabwe: "ZW",
};

/** Q4 region label → tokens that appear in EF geography strings. */
const REGION_TOKENS: Record<string, string[]> = {
    africa: ["africa", "raf", "raf-africa"],
    asia: ["asia", "ras", "ras-asia"],
    europe: ["europe", "rer", "rer-europe"],
    "north america": ["north america", "rna", "rna-north america", "nam"],
    "south america": ["south america", "rla", "sam", "latin america"],
    "oceania / australia": ["oceania", "australia", "rau", "roe", "nz", "pacific"],
    oceania: ["oceania", "australia", "rau", "roe", "pacific"],
    "middle east": ["middle east", "rme", "middle-east"],
    "global / rest of world": ["glo", "global", "row", "rest of"],
};

export type GeoFallbackRank = 0 | 1 | 2 | 3;
// 3 = country, 2 = region, 1 = global, 0 = no match

function norm(s: string): string {
    return s.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

function countryIso(country: string): string | null {
    const key = norm(country);
    if (/^[a-z]{2}$/i.test(country.trim())) return country.trim().toUpperCase();
    return COUNTRY_ISO[key] ?? null;
}

function matchesCountry(geography: string, country: string): boolean {
    const g = norm(geography);
    const c = norm(country);
    if (!g || !c) return false;
    if (g === c) return true;
    // "CH-Switzerland", "CH - Switzerland", "Switzerland"
    if (g.includes(c)) return true;
    const iso = countryIso(country);
    if (iso) {
        const i = iso.toLowerCase();
        if (g === i) return true;
        if (g.startsWith(i + "-") || g.startsWith(i + " -") || g.startsWith(i + " ")) return true;
        // "{CH}" ecoinvent-style leftovers
        if (g.includes("{" + i + "}") || g.endsWith(" " + i)) return true;
    }
    return false;
}

function matchesRegion(geography: string, region: string): boolean {
    const g = norm(geography);
    const r = norm(region);
    if (!g || !r) return false;
    if (g === r || g.includes(r)) return true;
    const tokens = REGION_TOKENS[r] ?? [r];
    return tokens.some((t) => {
        if (g === t) return true;
        if (g.includes(t)) return true;
        // RER-Europe style prefix
        if (g.startsWith(t + "-") || g.startsWith(t + " -")) return true;
        return false;
    });
}

function matchesGlobal(geography: string): boolean {
    const g = norm(geography);
    return (
        g === "glo" ||
        g === "global" ||
        g.startsWith("glo-") ||
        g.startsWith("glo ") ||
        g.includes("global") ||
        g === "row" ||
        g.startsWith("row-") ||
        g.includes("rest of world") ||
        g.includes("rest of%") // shouldn't happen after norm but safe
    );
}

/**
 * Rank an EF geography against Q4 country/region.
 * Higher wins: Country (3) > Region (2) > Global (1) > other (0).
 */
export function geographyFallbackRank(
    geography: string | null | undefined,
    country?: string | null,
    region?: string | null
): GeoFallbackRank {
    const g = (geography ?? "").trim();
    if (!g) return 0;
    if (country && matchesCountry(g, country)) return 3;
    if (region && matchesRegion(g, region)) return 2;
    if (matchesGlobal(g)) return 1;
    return 0;
}

/**
 * From candidates that already match the 4 taxonomy levels, keep only the
 * best geography tier (country → region → global). If nothing ranks > 0,
 * return the original list unchanged.
 */
export function pickByGeographyFallback<T extends { geography?: string | null; country_code?: string | null }>(
    rows: T[],
    country?: string | null,
    region?: string | null
): T[] {
    if (!rows.length) return rows;
    if (!country && !region) return rows;

    const ranked = rows.map((row) => {
        const geo = row.geography ?? row.country_code ?? "";
        return { row, rank: geographyFallbackRank(geo, country, region) };
    });
    const best = ranked.reduce((m, x) => (x.rank > m ? x.rank : m), 0 as GeoFallbackRank);
    if (best === 0) return rows;
    return ranked.filter((x) => x.rank === best).map((x) => x.row);
}
