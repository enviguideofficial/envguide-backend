import { withClient } from "../util/database.js";

// The unified BAFU 2025 emission_factors table is loaded from an 8-column CSV:
// the 7 source columns from "Main DB.csv" plus an explicit leading `Domain`
// column (the merged file has no domain, so the admin adds it before upload).
// (The old "Dataset Name" column was removed — the source file no longer has
// it; `specific_type` is now the sole EF name and dedup key.)
// `ef_id` is BIGSERIAL (auto); `is_legacy`, `search_text`, `source_db` are
// derived/defaulted server-side. Header matching is tolerant (see mapHeaders):
// case/spacing/punctuation are normalized, so "Sub-category", "Sub Category",
// "GWP 100 [kg CO2e]" and the cp1252-mangled "GWP 100 [kg CO?e]" all resolve.
//
// Canonical field -> the DB column it fills.
const FIELDS = [
    "domain",
    "category",
    "sub_category",
    "group_name",
    "specific_type",
    "geography",
    "unit",
    "gwp_100",
] as const;
type FieldKey = (typeof FIELDS)[number];

// DB columns we INSERT (in this order). ef_id/source_db/created_at/updated_at
// are handled by the table defaults.
const DB_COLUMNS = [
    "domain",
    "category",
    "sub_category",
    "group_name",
    "specific_type",
    "geography",
    "unit",
    "gwp_100",
    "is_legacy",
    "search_text",
];

const ALLOWED_DOMAINS = new Set([
    "material",
    "manufacturing",
    "packaging",
    "transport",
    "waste",
]);

// Auto-domain (row-position) mode: the merged "Main DB.csv" has NO domain
// column — it is 5 sections stacked in this fixed order. When the upload has no
// Domain column we assign domain by row position, exactly like the seed did.
// Only valid for the canonical file whose section sizes sum to EXPECTED_TOTAL.
const SECTIONS: Array<{ domain: string; count: number }> = [
    { domain: "material", count: 2556 },
    { domain: "manufacturing", count: 5411 },
    { domain: "packaging", count: 43 },
    { domain: "transport", count: 1478 },
    { domain: "waste", count: 817 },
];
const EXPECTED_TOTAL = SECTIONS.reduce((s, x) => s + x.count, 0); // 10,305

// Domain for the Nth non-blank data row (0-based) under row-position mode.
function domainByPosition(index: number): string | null {
    let c = 0;
    for (const s of SECTIONS) {
        if (index < c + s.count) return s.domain;
        c += s.count;
    }
    return null;
}

// Normalize a header cell for tolerant matching: lowercase, strip everything
// that isn't a-z/0-9. "Sub-category" -> "subcategory", "GWP 100 [kg CO2e]" ->
// "gwp100kgco2e", mangled "GWP 100 [kg CO?e]" -> "gwp100kgcoe".
function normHeader(h: string): string {
    return (h || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Map normalized header -> canonical field. gwp is matched by prefix below.
// Both the human labels ("Group", "Sub-category") and the raw DB column names
// ("group_name", "sub_category") are accepted — normHeader strips punctuation,
// so "group_name" -> "groupname" and "sub_category" -> "subcategory".
const HEADER_TO_FIELD: Record<string, FieldKey> = {
    domain: "domain",
    category: "category",
    subcategory: "sub_category",
    subcategoryname: "sub_category",
    group: "group_name",
    groupname: "group_name",
    specifictype: "specific_type",
    specifictypename: "specific_type",
    geography: "geography",
    country: "geography",
    unit: "unit",
};

// Resolve each CSV header to a field, returning the field->columnIndex map.
// `Domain` is OPTIONAL — when absent, domain is assigned by row position. All
// other 8 fields are required; missing ones are reported back to the caller.
function mapHeaders(header: string[]): {
    map: Partial<Record<FieldKey, number>> | null;
    missing: FieldKey[];
    hasDomain: boolean;
} {
    const map: Partial<Record<FieldKey, number>> = {};
    header.forEach((h, idx) => {
        const n = normHeader(h);
        if (n.startsWith("gwp")) { map["gwp_100"] = idx; return; }
        const field = HEADER_TO_FIELD[n];
        if (field && map[field] === undefined) map[field] = idx;
    });
    const required = FIELDS.filter((f) => f !== "domain");
    const missing = required.filter((f) => map[f] === undefined);
    return { map: missing.length ? null : map, missing, hasDomain: map["domain"] !== undefined };
}

// is_legacy is derived (matches the seed's rule): the EF name (specific_type)
// starts with xx/xxx, carries a [Legacy] tag, or the category mentions
// Legacy/Avoid. (Formerly keyed on dataset_name, which no longer exists.)
function deriveIsLegacy(specificType: string | null, category: string | null): boolean {
    const st = (specificType || "").trim().toLowerCase();
    const cat = (category || "").toLowerCase();
    if (/^xx/.test(st)) return true;
    if (st.includes("[legacy]") || st.includes("legacy")) return true;
    if (cat.includes("legacy") || cat.includes("avoid")) return true;
    return false;
}

// search_text mirrors the seed format: specific_type | category.
function buildSearchText(specificType: string | null, category: string | null): string {
    return [specificType, category].filter((s) => !!s && s.trim() !== "").join(" | ");
}

// Windows-1252 (CP1252) high-range bytes 0x80–0x9F that differ from Latin-1 —
// smart quotes, en/em dashes, ellipsis, etc. Excel's default "CSV" export uses
// this encoding, which is why an en-dash (byte 0x96) shows up as � when the
// file is wrongly read as UTF-8.
const CP1252_EXTRA: Record<number, number> = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
    0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
    0x9e: 0x017e, 0x9f: 0x0178,
};

function decodeCp1252(buf: Buffer): string {
    let out = "";
    for (const b of buf) {
        const mapped = b >= 0x80 && b <= 0x9f ? CP1252_EXTRA[b] : undefined;
        out += String.fromCharCode(mapped ?? b); // else Latin-1 byte == codepoint
    }
    return out;
}

// Decode the uploaded buffer, tolerating both UTF-8 and Windows-1252 (Excel's
// default). UTF-8 BOM → UTF-8; otherwise try UTF-8 and, if it produced the
// replacement char � (invalid sequence), fall back to Windows-1252 so dashes
// and quotes survive instead of turning into �.
function decodeBuffer(buf: Buffer): string {
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        return buf.toString("utf8");
    }
    const asUtf8 = buf.toString("utf8");
    if (!asUtf8.includes("�")) return asUtf8;
    return decodeCp1252(buf);
}

// Minimal RFC-4180 CSV parser. Handles "quoted, fields" and "" escaped quotes.
function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    let i = 0;

    // Strip BOM if present.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    while (i < text.length) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuotes = false; i++; continue;
            }
            field += c; i++; continue;
        }
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field = ""; i++; continue; }
        if (c === "\r") { i++; continue; }
        if (c === "\n") {
            row.push(field); field = "";
            if (row.length > 1 || row[0] !== "") rows.push(row);
            row = []; i++; continue;
        }
        field += c; i++;
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        if (row.length > 1 || row[0] !== "") rows.push(row);
    }
    return rows;
}

async function isSuperAdmin(userId: string): Promise<boolean> {
    return withClient(async (client: any) => {
        const r = await client.query(
            `SELECT user_role FROM users_table WHERE user_id = $1`,
            [userId]
        );
        const role = String(r.rows[0]?.user_role || "").toLowerCase();
        return role === "superadmin" || role === "super admin";
    });
}

interface ValidationError { row: number; field: string; message: string; }

// Tolerate Excel/locale number formatting: Indian lakh grouping ("9,95,197.22"),
// US thousands ("995,197.22"), trailing/leading whitespace, etc. Returns NaN
// when the cleaned string is empty or contains non-numeric junk.
function parseLocaleNumber(raw: string | undefined): number {
    if (raw == null) return NaN;
    const cleaned = raw.replace(/[,\s]/g, "");
    if (cleaned === "") return NaN;
    return Number(cleaned);
}

function validateRow(
    cells: string[],
    rowIndex: number,
    map: Partial<Record<FieldKey, number>>,
    domainOverride?: string | null
): { errors: ValidationError[]; values: any[] | null } {
    const errors: ValidationError[] = [];
    const get = (f: FieldKey): string => {
        const idx = map[f];
        return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };

    // Domain comes from the column when present, else from row position.
    const domain = (domainOverride ?? get("domain")).toLowerCase();
    if (!domain) {
        errors.push({ row: rowIndex, field: "Domain", message: "required (no Domain column and row is outside the known sections)" });
    } else if (!ALLOWED_DOMAINS.has(domain)) {
        errors.push({
            row: rowIndex,
            field: "Domain",
            message: `invalid "${domain}" (expected material/manufacturing/packaging/transport/waste)`,
        });
    }

    const category = get("category");
    if (!category) errors.push({ row: rowIndex, field: "Category", message: "required" });

    const specificType = get("specific_type");
    if (!specificType) errors.push({ row: rowIndex, field: "Specific Type", message: "required" });

    const geography = get("geography");
    if (!geography) errors.push({ row: rowIndex, field: "Geography", message: "required" });

    const unit = get("unit");
    if (!unit) errors.push({ row: rowIndex, field: "Unit", message: "required" });

    const gwpRaw = get("gwp_100");
    const gwp = parseLocaleNumber(gwpRaw);
    if (!Number.isFinite(gwp)) {
        errors.push({ row: rowIndex, field: "GWP 100", message: `not a number: "${gwpRaw}"` });
    }

    if (errors.length > 0) return { errors, values: null };

    return {
        errors: [],
        values: [
            domain,
            category,
            get("sub_category") || null,
            get("group_name") || null,
            specificType,
            geography,
            unit,
            gwp,
            deriveIsLegacy(specificType, category),
            buildSearchText(specificType, category),
        ],
    };
}

export async function importEmissionFactorsCsv(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send({ success: false, message: "not authenticated" });
        }
        if (!(await isSuperAdmin(req.user_id))) {
            return res.status(403).send({ success: false, message: "super admin only" });
        }
        if (!req.file?.buffer) {
            return res.status(400).send({ success: false, message: "no file uploaded (field name must be 'file')" });
        }

        const text = decodeBuffer(req.file.buffer);
        const rows = parseCsv(text);
        if (rows.length === 0) {
            return res.status(400).send({ success: false, message: "CSV is empty" });
        }

        const header = rows[0].map((h) => h.trim());
        const { map, missing, hasDomain } = mapHeaders(header);
        if (!map) {
            return res.status(400).send({
                success: false,
                message: `CSV is missing required column(s): ${missing.join(", ")}`,
                expected: FIELDS.filter((f) => f !== "domain"),
                received: header,
                mismatches: missing.map((f) => `missing column for field "${f}"`),
            });
        }

        const dataRows = rows.slice(1);
        // Non-blank data rows drive row-position domain assignment.
        const nonBlankCount = dataRows.filter(
            (r) => !r.every((c) => (c ?? "").trim() === "")
        ).length;

        // Auto-domain (no Domain column) only works for the canonical layout,
        // whose 5 sections sum to EXPECTED_TOTAL rows. Bail early with a clear
        // message rather than silently mis-stamping domains.
        if (!hasDomain && nonBlankCount !== EXPECTED_TOTAL) {
            return res.status(400).send({
                success: false,
                message:
                    `No "Domain" column found, so domain is assigned by row position — ` +
                    `but that needs exactly ${EXPECTED_TOTAL} rows in the standard order ` +
                    `(material, manufacturing, packaging, transport, waste). This file has ${nonBlankCount}. ` +
                    `Either upload the standard Main DB file, or add a "Domain" column.`,
            });
        }

        const allErrors: ValidationError[] = [];
        const allValues: any[][] = [];
        let pos = 0; // index among non-blank rows (for row-position domain)
        for (let i = 0; i < dataRows.length; i++) {
            const rowNum = i + 2; // CSV row number (1-based, header is row 1)
            // Skip fully-blank lines (trailing newline at end of file etc.).
            if (dataRows[i].every((c) => (c ?? "").trim() === "")) continue;
            const domainOverride = hasDomain ? undefined : domainByPosition(pos);
            pos++;
            const result = validateRow(dataRows[i], rowNum, map, domainOverride);
            if (result.errors.length > 0) {
                allErrors.push(...result.errors);
            } else if (result.values) {
                allValues.push(result.values);
            }
            if (allErrors.length >= 200) {
                return res.status(400).send({
                    success: false,
                    message: `Too many errors (${allErrors.length}+). Fix the CSV and try again.`,
                    errorCount: allErrors.length,
                    sampleErrors: allErrors.slice(0, 200),
                });
            }
        }
        if (allErrors.length > 0) {
            return res.status(400).send({
                success: false,
                message: `Found ${allErrors.length} validation error(s). No changes were saved.`,
                errorCount: allErrors.length,
                errors: allErrors,
            });
        }
        if (allValues.length === 0) {
            return res.status(400).send({ success: false, message: "CSV contained no data rows" });
        }

        // Atomic replace: wipe + bulk insert in one transaction. Every source
        // row is inserted verbatim — NO dedup — so the row count always matches
        // the file exactly (ef_id is auto-assigned, so identical rows are fine).
        let insertedCount = 0;
        await withClient(async (client: any) => {
            await client.query("BEGIN");
            try {
                await client.query("TRUNCATE TABLE emission_factors RESTART IDENTITY");

                const BATCH_SIZE = 500;
                for (let start = 0; start < allValues.length; start += BATCH_SIZE) {
                    const batch = allValues.slice(start, start + BATCH_SIZE);
                    const placeholders: string[] = [];
                    const params: any[] = [];
                    let p = 1;
                    for (const row of batch) {
                        const rowPh = DB_COLUMNS.map(() => `$${p++}`).join(",");
                        placeholders.push(`(${rowPh})`);
                        params.push(...row);
                    }
                    const sql = `
                        INSERT INTO emission_factors (${DB_COLUMNS.join(",")})
                        VALUES ${placeholders.join(",")}
                    `;
                    const r = await client.query(sql, params);
                    insertedCount += r.rowCount ?? 0;
                }
                await client.query("COMMIT");
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            }
        });

        const skipped = allValues.length - insertedCount;
        return res.status(200).send({
            success: true,
            message:
                `Imported ${insertedCount} emission factors` +
                (skipped > 0 ? ` (${skipped} duplicate row(s) skipped)` : ""),
            insertedCount,
        });
    } catch (err: any) {
        console.error("importEmissionFactorsCsv error:", err);
        return res.status(500).send({ success: false, message: err.message });
    }
}

export async function listEmissionFactors(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const page = Math.max(1, Number(req.query.page) || 1);
            const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
            const offset = (page - 1) * limit;

            const search = String(req.query.search || "").trim();
            // `country_code` filter maps onto the unified `geography` column;
            // `unit_kind` filter maps onto `domain`. Param names kept for the
            // existing frontend query string.
            const geography = String(req.query.country_code || "").trim();
            const domain = String(req.query.unit_kind || req.query.domain || "").trim();
            const sourceDb = String(req.query.source_db || "").trim();
            // Cascading taxonomy filters (Category → Sub-category → Group →
            // Specific Type). Each narrows the result to an exact-match value.
            const category = String(req.query.category || "").trim();
            const subCategory = String(req.query.sub_category || "").trim();
            const group = String(req.query.group || req.query.group_name || "").trim();
            const specificType = String(req.query.specific_type || "").trim();

            const conditions: string[] = [];
            const params: any[] = [];
            let p = 1;

            if (search) {
                // Global search hits every text column so users can filter on any
                // value they see in the table — material name, dataset, geography,
                // category, sub-category, unit, source — without picking a field.
                conditions.push(`(
                    domain        ILIKE $${p} OR
                    category      ILIKE $${p} OR
                    sub_category  ILIKE $${p} OR
                    group_name    ILIKE $${p} OR
                    specific_type ILIKE $${p} OR
                    geography     ILIKE $${p} OR
                    unit          ILIKE $${p} OR
                    source_db     ILIKE $${p} OR
                    search_text   ILIKE $${p}
                )`);
                params.push(`%${search}%`);
                p++;
            }
            if (geography) { conditions.push(`geography = $${p++}`); params.push(geography); }
            if (domain)    { conditions.push(`domain = $${p++}`); params.push(domain); }
            if (sourceDb)  { conditions.push(`source_db = $${p++}`); params.push(sourceDb); }
            if (category)     { conditions.push(`category = $${p++}`); params.push(category); }
            if (subCategory)  { conditions.push(`sub_category = $${p++}`); params.push(subCategory); }
            if (group)        { conditions.push(`group_name = $${p++}`); params.push(group); }
            if (specificType) { conditions.push(`specific_type = $${p++}`); params.push(specificType); }

            const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            const countResult = await client.query(
                `SELECT COUNT(*)::int AS total FROM emission_factors ${whereSql}`,
                params
            );
            const total: number = countResult.rows[0]?.total ?? 0;

            const dataResult = await client.query(
                `SELECT * FROM emission_factors ${whereSql}
                 ORDER BY ef_id
                 LIMIT $${p} OFFSET $${p + 1}`,
                [...params, limit, offset]
            );

            return res.status(200).send({
                success: true,
                data: dataResult.rows,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            });
        } catch (err: any) {
            console.error("listEmissionFactors error:", err);
            return res.status(500).send({ success: false, message: err.message });
        }
    });
}

export async function getEmissionFactorById(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const efId = String(req.params.ef_id || "").trim();
            if (!efId) return res.status(400).send({ success: false, message: "ef_id required" });

            const r = await client.query(
                `SELECT * FROM emission_factors WHERE ef_id = $1`,
                [efId]
            );
            if (r.rows.length === 0) {
                return res.status(404).send({ success: false, message: `not found: ${efId}` });
            }
            return res.status(200).send({ success: true, data: r.rows[0] });
        } catch (err: any) {
            console.error("getEmissionFactorById error:", err);
            return res.status(500).send({ success: false, message: err.message });
        }
    });
}

export async function getEmissionFactorStats(_req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const r = await client.query(
                `SELECT
                    COUNT(*)::int                                       AS total,
                    COUNT(DISTINCT source_db)::int                       AS source_db_count,
                    COUNT(DISTINCT geography)::int                       AS country_count,
                    COUNT(DISTINCT domain)::int                          AS unit_kind_count,
                    MAX(updated_at)                                      AS last_updated
                 FROM emission_factors`
            );
            return res.status(200).send({ success: true, data: r.rows[0] });
        } catch (err: any) {
            console.error("getEmissionFactorStats error:", err);
            return res.status(500).send({ success: false, message: err.message });
        }
    });
}

// Cascading taxonomy for the supplier-questionnaire EF dropdowns:
//   level=category                          → distinct categories
//   level=sub_category  (+category)         → distinct sub-categories in it
//   level=group         (+category,+sub)    → distinct group_name
//   level=specific_type (+category,+sub,+group) → specific types, each with its
//                                                ef_id / gwp_100 / unit / geography
// Optional ?q= filters by ILIKE substring. Returns up to 50, sorted. The 4
// levels together identify exactly one EF row.
export async function getEfTaxonomy(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const level = String(req.query.level || "category").trim();
            const q = String(req.query.q || "").trim();
            const category = String(req.query.category || "").trim();
            const subCategory = String(req.query.sub_category || "").trim();
            const group = String(req.query.group || "").trim();
            const specificType = String(req.query.specific_type || "").trim();

            // Include EF=0 rows: a zero emission factor is valid real data (many
            // legitimate waste/recycling treatments are ~0). Only require the EF
            // to be present, so the supplier can pick the exact DB row.
            const conds: string[] = ["gwp_100 IS NOT NULL"];
            const params: any[] = [];
            let p = 1;
            const addParentEq = (col: string, val: string) => {
                if (val) { conds.push(`${col} = $${p++}`); params.push(val); }
            };

            const col =
                level === "category" ? "category" :
                level === "sub_category" ? "sub_category" :
                level === "group" ? "group_name" :
                level === "specific_type" ? "specific_type" :
                level === "geography" ? "geography" : "";
            if (!col) return res.status(400).send({ success: false, message: `invalid level: ${level}` });

            // Cascade parents: each level is filtered by every level above it.
            // geography is the 5th/last level (Electricity Q10) — filtered by all 4.
            if (level !== "category") addParentEq("category", category);
            if (level === "group" || level === "specific_type" || level === "geography") addParentEq("sub_category", subCategory);
            if (level === "specific_type" || level === "geography") addParentEq("group_name", group);
            if (level === "geography") addParentEq("specific_type", specificType);

            if (q) { conds.push(`${col} ILIKE $${p++}`); params.push(`%${q}%`); }
            const where = `WHERE ${conds.join(" AND ")} AND ${col} IS NOT NULL AND ${col} <> ''`;

            if (level === "specific_type") {
                // Specific type pins down the exact EF row → return its details.
                const r = await client.query(
                    `SELECT specific_type, ef_id, gwp_100, unit, geography
                       FROM emission_factors ${where}
                      ORDER BY specific_type LIMIT 500`,
                    params
                );
                return res.status(200).send({ success: true, data: r.rows });
            }
            const r = await client.query(
                `SELECT DISTINCT ${col} AS value FROM emission_factors ${where} ORDER BY ${col} LIMIT 1000`,
                params
            );
            return res.status(200).send({ success: true, data: r.rows.map((x: any) => x.value) });
        } catch (err: any) {
            console.error("getEfTaxonomy error:", err);
            return res.status(500).send({ success: false, message: err.message });
        }
    });
}
