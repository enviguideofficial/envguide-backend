// Formula Engine — computes the calculated v9 PCF fields from one
// supplier_questionnaire_response.
//
// Inputs : a response_id (already saved supplier answers).
// Outputs: a `ComputedFields` object + audit rows in `pcf_computed_field`.
//
// Every "Calculation" row in Final_Catena-x_Reporting_Structure CSV lives here.
// "As per Supplier Input" / "Default" / "System Generated" fields are NOT here —
// those land directly in the payload assembler (Phase D).
//
// For each emission factor lookup we call findBestEf() (Layer 1 + Layer 3).
// Missing or low-confidence EFs return 0 + a "manual" audit row, so the PCF
// still computes — the audit table tells reviewers what needs follow-up.
//
// Sign conventions follow Catena-X:
//   - emissions are positive (>= 0)
//   - uptake / removals are negative (<= 0)
//
// Skip rules (per team confirmation):
//   - Q15 packagingEmissionsIncluded = false → all packagingStage fields = 0
//   - Logistics (distribution stage) always = Q8c + Q14a + Q17a + Q19
//     (Excel B65+B170+B212+B237). Q18 only seeds the included flag; if any of
//     those legs produce a value we still mark distributionStageIncluded.
//   - Q20 not filled                  → LUC, land management, biogenic uptake portions = 0
//   - Q13 row with already_in_q10 = true → skipped in fossil GHG sum

import { ulid } from "ulid";
import { withClient } from "../util/database.js";
import {
    ActivityType,
    EfMatchInput,
    EfMatchResult,
    findBestEf,
} from "./efMatchingEngine.js";

// ============================================================
// Types
// ============================================================

export interface ComputedFields {
    carbonContent: {
        biogenicCarbonContent: number;
        fossilCarbonContent: number;
        recycledCarbonContent: number;
        carbonContentTotal: number;
        packagingBiogenicCarbonContent: number;
    };
    productionStage: StageEmissions;
    packagingStage: StageEmissions & { packagingEmissionsIncluded: boolean };
    distributionStage: StageEmissions & { distributionStageIncluded: boolean };
    verificationShares: {
        programCertificationShare: number;
        productVerificationShare1stParty: number;
        productVerificationShare2ndParty: number;
        productVerificationShare3rdParty: number;
    };
    // Legacy 5-bucket split of the same total, for the PCF Results view
    // (Materials / Production / Packaging / Waste / Logistics). Derived from the
    // v9 stages: materials = Q8, production = production-stage minus materials &
    // production-waste, packaging = packaging-stage minus packaging-waste,
    // waste = Q14 + Q17, logistics = Q8c + Q14a + Q17a + Q19. Sums to the grand total.
    breakdown: {
        materials: number;
        production: number; // includes Q8b process consumables (auxiliaries)
        packaging: number;
        waste: number;
        logistics: number;
    };
}

export interface StageEmissions {
    fossilGhgEmissions: number;
    biogenicNonCO2Emissions: number;
    biogenicCO2Uptake: number;
    landUseChangeGhgEmissions: number;
    landManagementBiogenicCO2Emissions: number;
    landManagementBiogenicCO2Removals: number;
    aircraftGhgEmissions: number;
    pcfExcludingBiogenicUptake: number;
    pcfIncludingBiogenicUptake: number;
    // Internal sub-totals used only to build the legacy 5-bucket breakdown.
    // Stripped before persistence so they don't pollute the v9 field namespace.
    materialsSubtotal?: number; // production stage: Q8 materials fossil
    wasteSubtotal?: number;     // production stage: Q14 waste; packaging stage: Q17 waste
}

interface SupplierData {
    main: any;
    q4_sites: any[];
    q8_bom: any[];
    q9a_coproducts: any[];
    q8b_process_consumables: any[];
    q8c_raw_material_transport: any[];
    q10_electricity: any[];
    q10a_factory_weights: any[];
    q10b_factory_units: any[];
    q11_fuels: any[];
    q12_process_gases: any[];
    q13_qc_it_energy: any[];
    q14_production_waste: any[];
    q14a_production_waste_transport: any[];
    q16_packaging_materials: any[];
    q16a_packaging_transport: any[];
    q17_packaging_waste: any[];
    q17a_packaging_waste_transport: any[];
    q19_transport_legs: any[];
    q20_biomass_feedstock: any[];
    // GWP characterization factors (100-yr) read from the `gwp_factors` DB table,
    // IPCC AR6 slice. Keyed by normalized gas formula, e.g. { ch4: 27.9, n2o: 273, co2: 1 }.
    gwpFactors: Record<string, number>;
}

// ============================================================
// Constants
// ============================================================

// Molar mass ratio CO2 / C (44 / 12). Used to convert biogenic carbon
// (kg C) into biogenic CO2 uptake (kg CO2e). Catena-X PCF Rulebook §5.2.6.
const CO2_PER_C = 44 / 12;

// Verbose calculation trace — prints every input, EF match, contribution and
// running total to the terminal (server pm2 logs) on EVERY "Run PCF Calculation".
// ON BY DEFAULT so the calc is always traceable — nothing is ever blocked.
// To silence it (rarely needed), set PCF_DEBUG=0 or PCF_DEBUG=false.
const DEBUG = process.env.PCF_DEBUG !== "0" && process.env.PCF_DEBUG !== "false";
function dbg(...args: any[]): void {
    if (DEBUG) console.log(...args);
}

// AR6 100-year GWP factors for direct process gases. SOURCE OF TRUTH = the
// `gwp_factors` DB table (ipcc_version='AR6'), loaded per-calc into
// SupplierData.gwpFactors. This hardcoded copy is only a defensive fallback if
// the DB table is empty/unreachable. Values: CO2=1, CH4=27.9, N2O=273.
const GWP_AR6_FALLBACK: Record<string, number> = {
    co2: 1,
    ch4: 27.9,
    n2o: 273,
    sf6: 25200,
    nf3: 17400,
};
// Full gas names → canonical formula key, so "Methane"/"Carbon dioxide" still resolve.
const GAS_SYNONYMS: Record<string, string> = {
    carbondioxide: "co2",
    methane: "ch4",
    nitrousoxide: "n2o",
    sulfurhexafluoride: "sf6",
    nitrogentrifluoride: "nf3",
};
// Normalize a gas label to the DB key: strip subscripts, lowercase, drop non-alnum,
// then map full-name synonyms → formula. "CO₂"→"co2", "Methane"→"ch4".
function normalizeGasKey(gas?: string | null): string {
    const subs: Record<string, string> = {
        "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
        "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    };
    const ascii = (gas ?? "").replace(/[₀-₉]/g, (c) => subs[c] ?? c);
    const key = ascii.toLowerCase().replace(/[^a-z0-9]/g, "");
    return GAS_SYNONYMS[key] ?? key;
}
// Look up the GWP for a gas in the DB-loaded AR6 map (falls back to the hardcoded copy).
function gwpForGas(gas: string | null | undefined, gwpMap: Record<string, number>): number {
    const key = normalizeGasKey(gas);
    return gwpMap[key] ?? GWP_AR6_FALLBACK[key] ?? 0;
}
function isBiogenicOrigin(v?: string | null): boolean {
    return `${v ?? ""}`.toLowerCase().startsWith("bio");
}

// Transport/aircraft emission factors are per TONNE-km (t·km). The supplier
// enters weight with a unit (usually kg), so convert to tonnes before
// multiplying by distance × EF — otherwise a kg weight is 1000× too large.
function weightToTonnes(weight: number, unit?: string | null): number {
    const u = (unit ?? "kg").toLowerCase().trim();
    if (u === "t" || u === "ton" || u === "tons" || u === "tonne" || u === "tonnes" || u === "mt") return weight;
    if (u === "g" || u === "gram" || u === "grams") return weight / 1e6;
    if (u === "lb" || u === "lbs" || u === "pound" || u === "pounds") return weight / 2204.6226;
    return weight / 1000; // default: kg → tonnes
}

/** Q10b units for an MPN (falls back to first Q10b row). */
function q10bUnitsForMpn(data: SupplierData, mpn?: string | null): number {
    const rows = data.q10b_factory_units ?? [];
    if (rows.length === 0) return 0;
    const key = String(mpn ?? "").trim();
    if (key) {
        const keyRoot = key.split(/\s*[—–-]/)[0].trim();
        const hit = rows.find((r) => {
            const m = String(r.mpn ?? "").trim();
            if (!m) return false;
            const mRoot = m.split(/\s*[—–-]/)[0].trim();
            return m === key || mRoot === keyRoot || m.startsWith(keyRoot) || key.startsWith(mRoot);
        });
        if (hit) return num(hit.units_produced);
    }
    return num(rows[0]?.units_produced);
}

/**
 * Per Q8 BOM row: scrap kg per declared unit from Q14 (single waste type).
 *   kg/tonnes: (factoryWasteKg × mass%/100) ÷ Q10b
 *   %:        (pct/100) × (mass%/100)     // total scrap/comp split by mass %
 *   no Q14:   0
 * Deployed weight = material_weight + this scrap.
 */
function scrapPerBomRowKg(data: SupplierData): number[] {
    const bom = data.q8_bom ?? [];
    const scraps = bom.map(() => 0);
    const q14Row = (data.q14_production_waste ?? []).find((r) => num(r.quantity) > 0) ?? null;
    if (!q14Row || bom.length === 0) return scraps;

    const qty = num(q14Row.quantity);
    const unitRaw = String(q14Row.unit ?? "kg").toLowerCase().trim();
    const isPercent = unitRaw === "%" || unitRaw === "percent" || unitRaw === "pct";
    const isTonnes =
        unitRaw === "t" || unitRaw === "ton" || unitRaw === "tons" ||
        unitRaw === "tonne" || unitRaw === "tonnes" || unitRaw === "mt";

    if (isPercent) {
        // Total scrap per component = pct/100 (e.g. 5% → 0.05 kg), then split by mass %.
        const totalScrapPerComp = qty / 100;
        for (let i = 0; i < bom.length; i++) {
            const massPct = num(bom[i].mass_pct);
            if (massPct <= 0) continue;
            scraps[i] = totalScrapPerComp * (massPct / 100);
        }
        return scraps;
    }

    const units = q10bUnitsForMpn(data, q14Row.product_id_or_mpn);
    if (units <= 0) return scraps;
    const factoryWasteKg = isTonnes ? qty * 1000 : qty;
    for (let i = 0; i < bom.length; i++) {
        const massPct = num(bom[i].mass_pct);
        if (massPct <= 0) continue;
        scraps[i] = (factoryWasteKg * (massPct / 100)) / units;
    }
    return scraps;
}

const ZERO_STAGE: StageEmissions = {
    fossilGhgEmissions: 0,
    biogenicNonCO2Emissions: 0,
    biogenicCO2Uptake: 0,
    landUseChangeGhgEmissions: 0,
    landManagementBiogenicCO2Emissions: 0,
    landManagementBiogenicCO2Removals: 0,
    aircraftGhgEmissions: 0,
    pcfExcludingBiogenicUptake: 0,
    pcfIncludingBiogenicUptake: 0,
};

// ============================================================
// Full input dump — every question, every field the supplier filled.
// Gated behind PCF_DEBUG like all other logs. Prints the raw response row and
// each child-table row as key=value, so nothing is hidden and no column is
// missed (we iterate the actual row objects instead of hard-coding names).
// ============================================================

function dbgInputs(data: SupplierData): void {
    if (!DEBUG) return;
    const skip = new Set(["id", "response_id", "row_order", "created_at", "updated_at"]);
    const fmtRow = (row: any): string =>
        Object.entries(row ?? {})
            .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "")
            .map(([k, v]) => `${k}=${v}`)
            .join("  ");
    const section = (title: string, rows: any[]) => {
        const list = rows ?? [];
        dbg(`\n   ▸ ${title}  (${list.length} row${list.length === 1 ? "" : "s"})`);
        list.forEach((r, i) => dbg(`      [${i}] ${fmtRow(r)}`));
    };

    dbg(`\n╔════════════════════════════════════════════════════════════╗`);
    dbg(`║  INPUTS FILLED — response ${data.main.id}`);
    dbg(`╚════════════════════════════════════════════════════════════╝`);
    dbg(`   ▸ Main response (Q1–Q7, Q9, Q15, Q18, Q21–Q28 flat fields)`);
    dbg(`      ${fmtRow(data.main)}`);
    section("Q4  sites", data.q4_sites);
    section("Q8  bill of materials", data.q8_bom);
    section("Q8b process consumables", data.q8b_process_consumables);
    section("Q8c raw-material transport", data.q8c_raw_material_transport);
    section("Q9a co-products", data.q9a_coproducts);
    section("Q10 electricity", data.q10_electricity);
    section("Q10a factory weights", data.q10a_factory_weights);
    section("Q10b factory units", data.q10b_factory_units);
    section("Q11 fuels", data.q11_fuels);
    section("Q12 process gases", data.q12_process_gases);
    section("Q13 QC/IT energy", data.q13_qc_it_energy);
    section("Q14 production waste", data.q14_production_waste);
    section("Q14a waste transport", data.q14a_production_waste_transport);
    section("Q16 packaging materials", data.q16_packaging_materials);
    section("Q16a packaging transport", data.q16a_packaging_transport);
    section("Q17 packaging waste", data.q17_packaging_waste);
    section("Q17a packaging waste transport", data.q17a_packaging_waste_transport);
    section("Q19 transport legs", data.q19_transport_legs);
    section("Q20 biomass feedstock", data.q20_biomass_feedstock);
}

// ============================================================
// Public entry point
// ============================================================

export async function computePcfFields(responseId: string): Promise<ComputedFields> {
    const data = await loadSupplierData(responseId);
    if (!data.main) {
        throw new Error(`Supplier questionnaire response not found: ${responseId}`);
    }

    // Dump every filled field before any math runs (PCF_DEBUG only).
    dbgInputs(data);

    // Co-product allocation factor — applies to all "shared" emissions
    // (production, packaging). Default 1 = no allocation (all stays with this product).
    const allocationFactor = computeAllocationFactor(data);
    dbg(`\n   allocation factor = ${allocationFactor}  (co-products present=${!!data.main.co_products_present})`);

    // Carbon content from Q8.
    const carbonContent = computeCarbonContent(data);

    // Production stage (always computed).
    const productionStage = await computeProductionStage(data, responseId, allocationFactor);

    // Packaging stage — gated by Q15.
    const packagingIncluded = !!data.main.packaging_emissions_included;
    const packagingStage: StageEmissions & { packagingEmissionsIncluded: boolean } = packagingIncluded
        ? {
              packagingEmissionsIncluded: true,
              ...(await computePackagingStage(data, responseId, allocationFactor)),
          }
        : { packagingEmissionsIncluded: false, ...ZERO_STAGE };

    // Logistics / distribution stage = Q8c + Q14a + Q17a + Q19 (Excel: B65+B170+B212+B237).
    // Always computed so these transport legs land in the logistics bucket / distribution
    // datapoints (not production or packaging).
    const distributionIncluded = !!data.main.distribution_stage_included;
    const distComputed = await computeDistributionStage(data, responseId);
    const distributionStage: StageEmissions & { distributionStageIncluded: boolean } = {
        distributionStageIncluded:
            distributionIncluded || distComputed.pcfIncludingBiogenicUptake > 0,
        ...distComputed,
    };

    // Verification & certification shares from Q27.
    const verificationShares = computeVerificationShares(data);

    // Q8b process consumables (auxiliaries) — consumed during manufacturing, so
    // they are folded INTO the production stage (per the team's confirmation).
    // Added to the production stage's fossil + PCF totals so they flow through the
    // production bucket and the grand total automatically.
    const auxiliariesEmission = await computeAuxiliariesEmission(data, responseId);
    productionStage.fossilGhgEmissions = round6(productionStage.fossilGhgEmissions + auxiliariesEmission);
    productionStage.pcfExcludingBiogenicUptake = round6(productionStage.pcfExcludingBiogenicUptake + auxiliariesEmission);
    productionStage.pcfIncludingBiogenicUptake = round6(productionStage.pcfIncludingBiogenicUptake + auxiliariesEmission);

    // Legacy 5-bucket breakdown (Materials / Production / Packaging / Waste /
    // Logistics) for the PCF Results view. Derived from the v9 stages so the five
    // values sum exactly to the grand total: materials & production-waste are
    // carved out of the production stage, packaging-waste out of the packaging
    // stage, and grouped into a single waste bucket.
    const matSub = productionStage.materialsSubtotal ?? 0;
    const prodWasteSub = productionStage.wasteSubtotal ?? 0;
    const pkgWasteSub = packagingStage.wasteSubtotal ?? 0;
    const breakdown = {
        materials: round6(matSub),
        production: round6(productionStage.pcfIncludingBiogenicUptake - matSub - prodWasteSub),
        packaging: round6(packagingStage.pcfIncludingBiogenicUptake - pkgWasteSub),
        waste: round6(prodWasteSub + pkgWasteSub),
        logistics: round6(distributionStage.pcfIncludingBiogenicUptake),
    };

    // Drop the internal sub-totals so they don't persist as bogus v9 fields.
    delete productionStage.materialsSubtotal;
    delete productionStage.wasteSubtotal;
    delete packagingStage.wasteSubtotal;

    const computed: ComputedFields = {
        carbonContent,
        productionStage,
        packagingStage,
        distributionStage,
        verificationShares,
        breakdown,
    };

    dbg(`\n══════════ FINAL PCF (declared unit) ══════════`);
    dbg(`  production  excl=${productionStage.pcfExcludingBiogenicUptake}  incl=${productionStage.pcfIncludingBiogenicUptake}`);
    dbg(`  packaging   excl=${packagingStage.pcfExcludingBiogenicUptake}  incl=${packagingStage.pcfIncludingBiogenicUptake}  (included=${packagingStage.packagingEmissionsIncluded})`);
    dbg(`  distribution excl=${distributionStage.pcfExcludingBiogenicUptake}  incl=${distributionStage.pcfIncludingBiogenicUptake}  (included=${distributionStage.distributionStageIncluded})`);
    const grandExcl = round6(
        productionStage.pcfExcludingBiogenicUptake +
        packagingStage.pcfExcludingBiogenicUptake +
        distributionStage.pcfExcludingBiogenicUptake
    );
    const grandIncl = round6(
        productionStage.pcfIncludingBiogenicUptake +
        packagingStage.pcfIncludingBiogenicUptake +
        distributionStage.pcfIncludingBiogenicUptake
    );
    dbg(`  auxiliaries (Q8b) = ${round6(auxiliariesEmission)}  (folded into production above)`);
    dbg(`  ─────────────────────────────────────────────`);
    dbg(`  TOTAL PCF  excl biogenic uptake = ${grandExcl} kgCO2e`);
    dbg(`  TOTAL PCF  incl biogenic uptake = ${grandIncl} kgCO2e`);
    dbg(`══════════════════════════════════════════════\n`);

    await persistComputedFields(responseId, computed);
    return computed;
}

// ============================================================
// Data loading
// ============================================================

async function loadSupplierData(responseId: string): Promise<SupplierData> {
    return withClient(async (client: any) => {
        const main = (
            await client.query(
                `SELECT * FROM supplier_questionnaire_response WHERE id = $1`,
                [responseId]
            )
        ).rows[0];

        const loadChild = async (table: string): Promise<any[]> =>
            (
                await client.query(
                    `SELECT * FROM ${table} WHERE response_id = $1 ORDER BY row_order`,
                    [responseId]
                )
            ).rows;

        // GWP characterization factors — AR6 slice of the gwp_factors table.
        // Normalized to formula keys so gwpForGas can look them up directly.
        const gwpRows = (
            await client.query(
                `SELECT gas, gwp_100y FROM gwp_factors WHERE ipcc_version = 'AR6'`
            )
        ).rows;
        const gwpFactors: Record<string, number> = {};
        for (const r of gwpRows) {
            const k = normalizeGasKey(r.gas);
            const v = typeof r.gwp_100y === "number" ? r.gwp_100y : parseFloat(String(r.gwp_100y));
            if (k && Number.isFinite(v)) gwpFactors[k] = v;
        }

        return {
            main,
            gwpFactors,
            q4_sites: await loadChild("sq_q4_sites"),
            q8_bom: await loadChild("sq_q8_bom"),
            q9a_coproducts: await loadChild("sq_q9a_coproducts"),
            q8b_process_consumables: await loadChild("sq_q8b_process_consumables"),
            q8c_raw_material_transport: await loadChild("sq_q8c_raw_material_transport"),
            q10_electricity: await loadChild("sq_q10_electricity"),
            q10a_factory_weights: await loadChild("sq_q10a_factory_weights"),
            q10b_factory_units: await loadChild("sq_q10b_factory_units"),
            q11_fuels: await loadChild("sq_q11_fuels"),
            q12_process_gases: await loadChild("sq_q12_process_gases"),
            q13_qc_it_energy: await loadChild("sq_q13_qc_it_energy"),
            q14_production_waste: await loadChild("sq_q14_production_waste"),
            q14a_production_waste_transport: await loadChild("sq_q14a_production_waste_transport"),
            q16_packaging_materials: await loadChild("sq_q16_packaging_materials"),
            q16a_packaging_transport: await loadChild("sq_q16a_packaging_transport"),
            q17_packaging_waste: await loadChild("sq_q17_packaging_waste"),
            q17a_packaging_waste_transport: await loadChild("sq_q17a_packaging_waste_transport"),
            q19_transport_legs: await loadChild("sq_q19_transport_legs"),
            q20_biomass_feedstock: await loadChild("sq_q20_biomass_feedstock"),
        };
    });
}

// ============================================================
// Co-product allocation factor (Q9 / Q9a)
//
// Catena-X PCF Rulebook §5.2.7:
//   - economic_value_ratio = max(co_product_prices) / min(co_product_prices)
//   - ratio >= 5 → economic allocation (by price)
//   - ratio  < 5 → physical allocation (by mass). Default sub-method = mass.
// We return a single multiplier in [0, 1] that ALL shared emissions are
// multiplied by. Default = 1 when no co-products.
// ============================================================

function computeAllocationFactor(data: SupplierData): number {
    if (!data.main.co_products_present) return 1;
    const rows = data.q9a_coproducts ?? [];
    if (rows.length <= 1) return 1;

    const primary = rows.find((r) => r.is_primary_product) ?? rows[0];
    const primaryPrice = num(primary.co_product_price);

    const prices = rows.map((r) => num(r.co_product_price)).filter((p) => p > 0);
    if (prices.length < 2 || primaryPrice <= 0) return 1;

    const ratio = Math.max(...prices) / Math.min(...prices);
    const totalPrice = prices.reduce((a, b) => a + b, 0);

    if (ratio >= 5) {
        // Economic allocation: by price share.
        return totalPrice > 0 ? primaryPrice / totalPrice : 1;
    } else {
        // Physical allocation, default = mass.
        // Team hasn't given mass per co-product yet, so we fall back to
        // equal allocation across products as a safe placeholder.
        // When team sends the formula, swap this single line.
        return 1 / rows.length;
    }
}

// ============================================================
// Carbon Content (5 fields)
// ============================================================

// ============================================================
// Q8b Process Consumables (Auxiliaries) — team's Excel methodology.
//   ① aux for all components = (component_total_weight ÷ factory_weight) × quantity
//   ② per component          = ① ÷ units   ==  (component_weight × quantity) ÷ factory_weight
//      (units cancel — same as electricity)
//   emission = ② × EF   (EF from the row's 4-level cascade; NO geography)
// Summed across every Q8b row → folded INTO the production stage (consumed during
// manufacturing), so it flows through the production bucket and the grand total.
// ============================================================
async function computeAuxiliariesEmission(data: SupplierData, responseId: string): Promise<number> {
    const rows = data.q8b_process_consumables ?? [];
    if (rows.length === 0) return 0;

    const productMass = num(data.main.product_mass_per_declared_unit);
    const q10aSum = data.q10a_factory_weights.reduce((s: number, r: any) => s + num(r.total_weight_kg), 0);
    const factoryWeight = q10aSum > 0 ? q10aSum : num(data.main.factory_total_weight_kg);
    if (productMass <= 0 || factoryWeight <= 0) {
        dbg(`   [Q8b] skipped — need productMass(${productMass}) and ΣQ10a factory weight(${factoryWeight}) > 0`);
        return 0;
    }

    let total = 0;
    for (const row of rows) {
        const quantity = num(row.total_quantity);
        if (quantity <= 0) continue;
        // per component = (component_weight × quantity) ÷ factory_weight  (units cancel)
        const perComponent = (productMass * quantity) / factoryWeight;
        const ef_ = await ef({
            activityType: "material",
            material: row.consumable_material || row.category,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            unit: row.unit, unitKind: "mass",
            sourceQuestion: "q8b_process_consumables",
            sourceRowId: row.id,
            responseId,
        });
        const contrib = perComponent * ef_;
        total += contrib;
        dbg(`   [Q8b] ${row.consumable_material || row.specific_type}: qty=${quantity}  perComp=(${productMass}×${quantity})/${factoryWeight}=${perComponent.toFixed(6)} × EF ${ef_} = ${contrib.toFixed(6)}`);
    }
    dbg(`   [Q8b] auxiliaries TOTAL = ${round6(total)} kgCO2e (folded into the production stage)`);
    return round6(total);
}

function computeCarbonContent(data: SupplierData): ComputedFields["carbonContent"] {
    const productMass = num(data.main.product_mass_per_declared_unit);
    const scraps = scrapPerBomRowKg(data);

    let biogenicCarbonContent = 0;   // B32 summed — PUBLISHED
    let recycledCarbonContent = 0;   // B37 summed — PUBLISHED
    let totalCarbon = 0;             // B30 — PUBLISHED
    let totalBiogenicCarbonForFossil = 0; // B34 — INTERNAL, only feeds fossil

    data.q8_bom.forEach((row, i) => {
        const massPct = num(row.mass_pct);
        const materialWeight = productMass * (massPct / 100); // B36
        const scrapKg = scraps[i] ?? 0;
        const deployed = materialWeight + scrapKg; // B37 = B36 + scrap
        const carbonFrac = num(row.carbon_pct) / 100;                  // B38  carbon %
        const biogenicFrac = num(row.biogenic_carbon_pct) / 100;       // B41  biogenic %
        const recycledFrac = num(row.recycled_carbon_pct) / 100;       // B45  recycled %

        // Carbon / biogenic / recycled all use deployed weight (Excel B37 × %).
        const componentCarbon = deployed * carbonFrac;                 // B39
        totalCarbon += componentCarbon;                                // B40  Σ carbon content

        const bioInKg = row.biogenic_y_n ? deployed * biogenicFrac : 0; // B42
        biogenicCarbonContent += bioInKg;

        const recInKg = row.recycled_y_n ? deployed * recycledFrac : 0; // B46
        recycledCarbonContent += recInKg;

        // Internal "Total Biogenic Carbon" (B34) — NOT published, only used to derive fossil:
        //   B33 = B32/100 (biogenic carbon fraction);  B34 = Σ(carbonContent × B33)
        const biogenicCarbonFraction = bioInKg / 100;                  // B43
        totalBiogenicCarbonForFossil += componentCarbon * biogenicCarbonFraction;

        dbg(
            `   [carbon] ${row.material}: mat=${materialWeight.toFixed(6)}kg + scrap=${scrapKg.toFixed(6)} ` +
            `→ deployed=${deployed.toFixed(6)}kg carbon%=${num(row.carbon_pct)} → C=${componentCarbon.toFixed(6)} ` +
            `(bioInKg=${bioInKg.toFixed(6)}, recInKg=${recInKg.toFixed(6)})`
        );
    });

    // fossilCarbonContent (Test 3 row 38): B38 = Total carbon − Total Recycled − Total Biogenic(B34).
    // NB: subtracts the INTERNAL B34 (tiny), NOT the published biogenicCarbonContent.
    const fossilCarbonContent = Math.max(
        0,
        totalCarbon - recycledCarbonContent - totalBiogenicCarbonForFossil
    );
    dbg(`\n━━━ CARBON CONTENT ━━━  total=${round6(totalCarbon)} fossil=${round6(fossilCarbonContent)} ` +
        `biogenic(pub)=${round6(biogenicCarbonContent)} recycled(pub)=${round6(recycledCarbonContent)} ` +
        `b34(internal)=${totalBiogenicCarbonForFossil.toFixed(9)}`);

    // Packaging biogenic carbon: Q16 material weight + Q16a transport weight × biogenic %.
    let packagingBiogenicCarbonContent = 0;
    for (const row of data.q16_packaging_materials) {
        const w = num(row.packaging_weight);
        const bioFrac = num(row.carbon_biogenic_pct) / 100;
        packagingBiogenicCarbonContent += w * bioFrac;
    }

    return {
        biogenicCarbonContent: round6(biogenicCarbonContent),
        fossilCarbonContent: round6(fossilCarbonContent),
        recycledCarbonContent: round6(recycledCarbonContent),
        carbonContentTotal: round6(totalCarbon),
        packagingBiogenicCarbonContent: round6(packagingBiogenicCarbonContent),
    };
}

// ============================================================
// Production Stage (9 fields)
// ============================================================

async function computeProductionStage(
    data: SupplierData,
    responseId: string,
    allocation: number
): Promise<StageEmissions> {
    const productMass = num(data.main.product_mass_per_declared_unit);
    // reference_period_start comes back from pg as a Date, whose .toString() is
    // "Wed Jan 01 2025 …" — slicing that gave "Wed " → NaN. Parse it as a real date.
    const year = new Date(data.main.reference_period_start ?? "").getFullYear() || 2025;
    const primarySite = data.q4_sites.find((s) => s.is_primary) ?? data.q4_sites[0] ?? null;
    const country = primarySite?.country ?? null;
    const region = primarySite?.region ?? null;

    dbg(`\n━━━ PRODUCTION STAGE ━━━  productMass=${productMass}kg  geo=${country}/${region}  year=${year}`);

    // --- Q8 materials × EF (fossil)
    // Emission = deployed_weight × EF, where
    //   deployed = material_weight (productMass × mass%) + scrap_per_material (from Q14).
    let fossil = 0;
    let materialsFossil = 0; // Q8-only, for the 5-bucket breakdown
    const scraps = scrapPerBomRowKg(data);
    for (let i = 0; i < data.q8_bom.length; i++) {
        const row = data.q8_bom[i];
        const massPct = num(row.mass_pct);
        const materialWeight = productMass * (massPct / 100);
        const scrapKg = scraps[i] ?? 0;
        const deployed = materialWeight + scrapKg;
        if (deployed <= 0) continue;
        const ef_ = await ef(
            {
                activityType: "material",
                material: row.material,
                process: row.process,
                // Exact EF taxonomy from the cascade dropdowns (material column
                // = Category; plus sub_category / group_name / specific_type).
                category: row.material,
                subCategory: row.sub_category,
                group: row.group_name,
                specificType: row.specific_type,
                country, region,
                unit: "kg", unitKind: "mass",
                year,
                sourceQuestion: "q8_bom",
                sourceRowId: row.id,
                responseId,
            }
        );
        const contrib = deployed * ef_;
        fossil += contrib;
        materialsFossil += contrib;
        dbg(
            `   [Q8] ${row.material}: mat=${materialWeight.toFixed(6)}kg + scrap=${scrapKg.toFixed(6)} ` +
            `→ deployed=${deployed.toFixed(6)}kg × EF ${ef_} = ${contrib.toFixed(6)} kgCO2e`
        );
    }

    // --- Q10 electricity — team's Excel methodology (mass-based factory allocation).
    // Inputs the supplier gives:
    //   factory energy = Q10 "Quantity"  (whole-factory kWh for the period)
    //   factory weight = Σ Q10a rows     (total weight of EVERY product the factory made)
    //   units          = Q10b            (units of THIS component produced)
    //   component wt   = product_mass_per_declared_unit (Q3)
    // Then, per the Excel:
    //   ① this component's total weight = component_wt × units
    //   ② electricity for this component = (① ÷ Σ Q10a) × factory energy
    //   ③ per unit = ② ÷ units   ==  component_wt × factory_energy ÷ Σ Q10a
    // (units cancel in ③, so the per-unit value doesn't depend on Q10b — but we
    //  compute ①②③ explicitly and log them so the calc mirrors the methodology doc.)
    //   emission = ③ × electricity EF × (1 − renewable share)
    // Legacy fallback: old responses saved before Q10a/Q10b existed used single
    // main fields — honour them so old data never breaks.
    const factoryEnergy = num(data.q10_electricity[0]?.quantity) || num(data.main.factory_total_energy_kwh);
    const q10aSum = data.q10a_factory_weights.reduce((s: number, r: any) => s + num(r.total_weight_kg), 0);
    const factoryWeight = q10aSum > 0 ? q10aSum : num(data.main.factory_total_weight_kg);
    // productMass (declared above) is the component's per-unit mass from Q3c.
    const useFactoryAllocation = factoryEnergy > 0 && factoryWeight > 0 && productMass > 0;

    // The SAME factory→component mass allocation applies to every factory-level
    // production input, not just electricity: fuel (Q11), process gas (Q12) and
    // QC/IT energy (Q13) are all reported as whole-factory totals too. allocFactor
    // is this component's per-unit share of the factory:
    //   allocFactor = product_mass / factory_weight   (both kg)
    // so a factory-total quantity × allocFactor = this component's per-unit share.
    // Falls back to 1 (use the raw entered quantity) when the factory totals are
    // missing — same guard as electricity, so old data never breaks.
    const allocFactor = useFactoryAllocation ? productMass / factoryWeight : 1;

    if (useFactoryAllocation && data.q10_electricity.length > 0) {
        const elecRow = data.q10_electricity[0]; // primary electricity source → EF
        const units = num(data.q10b_factory_units[0]?.units_produced); // Q10b (for the audit steps)
        const componentTotalWeight = productMass * units;                        // ①
        const componentElectricity = (componentTotalWeight / factoryWeight) * factoryEnergy; // ②
        const perUnitKwh = (productMass * factoryEnergy) / factoryWeight;        // ③ (units cancel)
        const ef_ = await ef({
            activityType: "energy",
            material: elecRow.electricity_type,
            process: elecRow.generator_type,
            category: elecRow.category, subCategory: elecRow.sub_category, group: elecRow.group_name, specificType: elecRow.specific_type,
            geography: elecRow.geography, // 5th cascade pin (Q10) → exact country EF
            country, region,
            unit: elecRow.unit, unitKind: "energy",
            year,
            sourceQuestion: "q10_electricity",
            sourceRowId: elecRow.id,
            responseId,
        });
        const renewableShare = (num(elecRow.renewable_pct) / 100) || 0;
        const contrib = perUnitKwh * ef_ * (1 - renewableShare);
        fossil += contrib;
        dbg(`   [Q10] factoryEnergy(Q10)=${factoryEnergy}kWh  ΣQ10a=${factoryWeight}kg  units(Q10b)=${units}  compWt=${productMass}kg`);
        dbg(`   [Q10-steps] ①compTotWt=${productMass}×${units}=${componentTotalWeight.toFixed(4)}kg  ②elec=(${componentTotalWeight.toFixed(4)}/${factoryWeight})×${factoryEnergy}=${componentElectricity.toFixed(4)}kWh  ③perUnit=${perUnitKwh.toFixed(6)}kWh`);
        dbg(`   [Q10-alloc] ${perUnitKwh.toFixed(6)}kWh × EF ${ef_} × (1−${renewableShare}) = ${contrib.toFixed(6)} kgCO2e`);
    } else {
        for (const row of data.q10_electricity) {
            const qty = num(row.quantity);
            if (qty <= 0) continue;
            const ef_ = await ef({
                activityType: "energy",
                material: row.electricity_type,
                process: row.generator_type,
                category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
                geography: row.geography, // 5th cascade pin (Q10) → exact country EF
                country, region,
                unit: row.unit, unitKind: "energy",
                year,
                sourceQuestion: "q10_electricity",
                sourceRowId: row.id,
                responseId,
            });
            const renewableShare = (num(row.renewable_pct) / 100) || 0;
            const contrib = qty * ef_ * (1 - renewableShare);
            fossil += contrib;
            dbg(`   [Q10] ${row.electricity_type}: ${qty}${row.unit} × ${ef_} × (1−${renewableShare}) = ${contrib.toFixed(6)}`);
        }
    }

    // --- Q11 fuels  (biogenic ones go into biogenicNonCO2 below)
    // Vishnu (Teams, 2026-07-09): Q11 fuels + Q13 QC/IT MUST be INCLUDED in production emission.
    let biogenicNonCO2 = 0;
    for (const row of data.q11_fuels) {
        const qty = num(row.quantity);
        if (qty <= 0) continue;
        const ef_ = await ef({
            activityType: "fuels",
            material: row.fuel_carrier,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country, region,
            unit: row.unit,
            year,
            sourceQuestion: "q11_fuels",
            sourceRowId: row.id,
            responseId,
        });
        const contrib = qty * allocFactor * ef_;
        if (row.biogenic_y_n) biogenicNonCO2 += contrib;
        else fossil += contrib;
        dbg(`   [Q11] ${row.fuel_carrier}: ${qty}${row.unit ?? ""} × ${allocFactor.toFixed(8)} (alloc) × ${ef_} = ${contrib.toFixed(6)} ` +
            `(${row.biogenic_y_n ? "biogenicNonCO2" : "fossil"})`);
    }

    // --- Q12 process gases — emission = quantity × allocFactor × GWP (AR6), NOT an EF lookup.
    // Quantities are whole-factory totals, so they get the same mass allocation.
    // CO2/fossil gases → fossil GHG; biogenic-origin CH4/N2O → biogenic non-CO2.
    for (const row of data.q12_process_gases) {
        const qty = num(row.quantity);
        if (qty <= 0) continue;
        const gwp = gwpForGas(row.direct_process_gas, data.gwpFactors);
        const contrib = qty * allocFactor * gwp;
        if (isBiogenicOrigin(row.fossil_or_biogenic)) biogenicNonCO2 += contrib;
        else fossil += contrib;
        dbg(`   [Q12] ${row.direct_process_gas}: ${qty} × ${allocFactor.toFixed(8)} (alloc) × GWP ${gwp} = ${contrib.toFixed(6)} ` +
            `(${isBiogenicOrigin(row.fossil_or_biogenic) ? "biogenicNonCO2" : "fossil"})`);
        if (gwp === 0) dbg(`        ⚠️ no GWP for gas "${row.direct_process_gas}" → contributes 0`);
    }

    // --- Q13 QC / IT energy (only rows NOT already counted in Q10)
    for (const row of data.q13_qc_it_energy) {
        if (row.already_in_q10) continue;
        const qty = num(row.value);
        if (qty <= 0) continue;
        const ef_ = await ef({
            activityType: "energy",
            // Prefer equipment label; fall back to legacy `item` / MPN.
            material: row.equipment_type || row.item || row.mpn,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            geography: row.geography, // 5th cascade pin (Q13) → exact country EF, same as Q10
            country, region,
            unit: row.unit, unitKind: "energy",
            year,
            sourceQuestion: "q13_qc_it_energy",
            sourceRowId: row.id,
            responseId,
        });
        const contrib = qty * allocFactor * ef_;
        fossil += contrib;
        dbg(`   [Q13] ${row.equipment_type || row.item || row.mpn}: ${qty}${row.unit ?? ""} × ${allocFactor.toFixed(8)} (alloc) × ${ef_} = ${contrib.toFixed(6)}`);
    }

    // --- Q14 production / QC waste (single waste type for now).
    // waste_per_comp = Σ scrap_per_material (same scraps used in Q8 deployed weight).
    // emissions = waste_per_comp × EF. Tonnes→kg; % mode as above.
    let wasteFossil = 0; // Q14-only, for the 5-bucket breakdown
    const q14Row = (data.q14_production_waste ?? []).find((r) => num(r.quantity) > 0) ?? null;
    if (q14Row) {
        const scrapsForWaste = scrapPerBomRowKg(data);
        const wastePerComponentKg = scrapsForWaste.reduce((s, v) => s + v, 0);
        const ef_ = await ef({
            activityType: "waste",
            material: q14Row.waste_type || q14Row.specific_type || q14Row.category,
            process: q14Row.treatment_type || q14Row.sub_category,
            category: q14Row.category,
            subCategory: q14Row.sub_category,
            group: q14Row.group_name,
            specificType: q14Row.specific_type,
            country, region,
            unit: "kg",
            unitKind: "mass",
            year,
            sourceQuestion: "q14_production_waste",
            sourceRowId: q14Row.id,
            responseId,
        });
        (data.q8_bom ?? []).forEach((bom, i) => {
            const scrap = scrapsForWaste[i] ?? 0;
            if (scrap <= 0) return;
            dbg(
                `   [Q14] ${bom.material ?? bom.specific_type ?? "material"} ` +
                `mass%=${num(bom.mass_pct)}  scrapPerComp=${scrap.toFixed(6)}kg`
            );
        });
        if (wastePerComponentKg > 0) {
            const contrib = wastePerComponentKg * ef_;
            fossil += contrib;
            wasteFossil += contrib;
            dbg(
                `   [Q14] waste per component TOTAL = ${wastePerComponentKg.toFixed(6)}kg × EF ${ef_} = ${contrib.toFixed(6)}`
            );
        } else {
            dbg(`   [Q14] no scrap computed (check Q10b units / Q8 mass % / Q14 quantity)`);
        }
    }

    // Q8c / Q14a transport legs live in the logistics (distribution) stage — see
    // computeDistributionStage. Production-stage aircraft stays 0 here.
    let aircraft = 0;

    // --- Q20 land fields — all three follow the SAME shape (per Vishnu, 2026-07-10):
    //     landUseChangeGhgEmissions          = Σ(biomass quantity × LUC EF)
    //     landManagementBiogenicCO2Emissions = Σ(biomass quantity × land-management EF)
    //     landManagementBiogenicCO2Removals  = Σ(biomass quantity × carbon-removal factor)
    //   The biomass Quantity comes from the Q20 table (sq_q20_biomass_feedstock.quantity).
    //   The three FACTORS will be defined in the emission_factors DB "in the coming week";
    //   until those rows + ef_scoring_config exist, ef() returns 0 → each field = qty × 0 = 0.
    //   The multiplication LOGIC is in place now, so they light up automatically once seeded.
    //   NOTE: driven ONLY by the biomass feedstock rows (Q20 table). The 20a/20b/20c toggles
    //   (uses_agricultural_forestry_land / land_area_hectares / forest_converted_y_n) are OPTIONAL
    //   — the supplier may or may not fill them — so we do NOT gate the calc on them. If there is
    //   no biomass row (or quantity 0), everything stays 0 naturally.
    let luc = 0;
    let landMgmtEmissions = 0;
    let landMgmtRemovals = 0;
    let biogenicCO2UptakeFromBiomass = 0;

    for (const row of data.q20_biomass_feedstock) {
        const qty = num(row.quantity);
        if (qty <= 0) continue;

        // Biogenic CO2 uptake from biomass — factor IS in the form (Q20 "Biogenic Carbon Content %").
        const bioFrac = num(row.biogenic_carbon_content_pct) / 100;
        biogenicCO2UptakeFromBiomass += qty * bioFrac * CO2_PER_C; // positive uptake (no minus)

        // Shared EF-lookup params for this feedstock row.
        const efBase = {
            material: row.biomass_feedstock_type,
            category: row.biomass_feedstock_type,
            country, region,
            unit: row.unit ?? "kg", unitKind: "mass" as const,
            year,
            sourceRowId: row.id,
            responseId,
        };

        // landUseChangeGhgEmissions = quantity × LUC EF (DB, TBD next week).
        const lucEf = await ef({ ...efBase, activityType: "land_use_change", sourceQuestion: "q20_land_use_change" });
        luc += qty * lucEf;

        // landManagementBiogenicCO2Emissions = quantity × land-management EF (DB, TBD next week).
        const landMgmtEf = await ef({ ...efBase, activityType: "land_management", sourceQuestion: "q20_land_management" });
        landMgmtEmissions += qty * landMgmtEf;

        // landManagementBiogenicCO2Removals = quantity × carbon-removal factor (DB, TBD next week).
        // Stored as a POSITIVE magnitude (matches the guide's 0.60 worked example + the
        // positive convention we set for biogenicCO2Uptake). It is a REMOVAL, so it SUBTRACTS
        // from the stage total below.
        const removalFactor = await ef({ ...efBase, activityType: "land_management_removal", sourceQuestion: "q20_land_management_removal" });
        landMgmtRemovals += qty * removalFactor;

        dbg(`   [Q20] ${row.biomass_feedstock_type}: qty=${qty}${row.unit ?? "kg"}  ` +
            `biogenicUptake=${qty}×${bioFrac}×${CO2_PER_C}=${(qty * bioFrac * CO2_PER_C).toFixed(6)}`);
        dbg(`        LUC=${qty}×${lucEf}=${(qty * lucEf).toFixed(6)}  ` +
            `landMgmtEmis=${qty}×${landMgmtEf}=${(qty * landMgmtEf).toFixed(6)}  ` +
            `landMgmtRemoval=${qty}×${removalFactor}=${(qty * removalFactor).toFixed(6)}` +
            (lucEf === 0 && landMgmtEf === 0 && removalFactor === 0 ? "   (land EFs not seeded yet → 0)" : ""));
    }

    // --- Biogenic CO2 uptake (carbon stored in product)
    const biogenicCO2UptakeFromMaterials = -(
        round6(productMass) * 0 // computed via carbon-content layer; placeholder for now
    );
    // biogenicCO2Uptake = "Total Biogenic Carbon" (B34) × 44/12   (Vishnu's Test 3, row 34 × 44/12).
    // NB: B34 is NOT the published biogenicCarbonContent (Σ weight×biogenic% = 0.59375). It is the
    // much smaller Σ( carbonContent × biogenicCarbonFraction ), where
    //   carbonContent (B29)          = weight × carbon%
    //   biogenicCarbonFraction (B33) = (weight × biogenic%) / 100   [= biogenic-carbon-in-kg / 100]
    // Same quantity the carbon-content block computes to derive fossil. Test 3 → 0.000683594.
    let totalBiogenicCarbon = 0; // B34
    const scrapsForBio = scrapPerBomRowKg(data);
    data.q8_bom.forEach((row, i) => {
        const massPct = num(row.mass_pct);
        const materialWeight = productMass * (massPct / 100);
        const deployed = materialWeight + (scrapsForBio[i] ?? 0); // B37
        const carbonContent = deployed * (num(row.carbon_pct) / 100);      // B39
        const bioInKg = row.biogenic_y_n ? deployed * (num(row.biogenic_carbon_pct) / 100) : 0;
        const biogenicCarbonFraction = bioInKg / 100;
        totalBiogenicCarbon += carbonContent * biogenicCarbonFraction;
    });
    // Positive value (per Vishnu / Test 3 Excel): uptake = Total Biogenic Carbon × 44/12, no minus.
    const biogenicCO2Uptake = (totalBiogenicCarbon * CO2_PER_C) + biogenicCO2UptakeFromBiomass + biogenicCO2UptakeFromMaterials;

    // Apply co-product allocation to shared emissions.
    fossil *= allocation;
    biogenicNonCO2 *= allocation;
    aircraft *= allocation;
    luc *= allocation;
    landMgmtEmissions *= allocation;
    landMgmtRemovals *= allocation;
    materialsFossil *= allocation;
    wasteFossil *= allocation;

    // landMgmtEmissions ADDS (it's an emission); landMgmtRemovals SUBTRACTS (positive magnitude = a removal).
    const pcfExcl = fossil + biogenicNonCO2 + luc + aircraft + landMgmtEmissions - landMgmtRemovals;
    // biogenicCO2Uptake is now a POSITIVE magnitude (CO2 absorbed), so "including uptake"
    // SUBTRACTS it (the absorbed CO2 is a credit that lowers the net footprint).
    const pcfIncl = pcfExcl - biogenicCO2Uptake;

    dbg(`   ── production totals: fossil=${round6(fossil)} biogenicNonCO2=${round6(biogenicNonCO2)} ` +
        `aircraft=${round6(aircraft)} LUC=${round6(luc)} biogenicUptake=${round6(biogenicCO2Uptake)}`);
    dbg(`   ── production PCF excl=${round6(pcfExcl)}  incl=${round6(pcfIncl)}  (allocation×${allocation})`);

    return {
        fossilGhgEmissions: round6(fossil),
        biogenicNonCO2Emissions: round6(biogenicNonCO2),
        biogenicCO2Uptake: round6(biogenicCO2Uptake),
        landUseChangeGhgEmissions: round6(luc),
        landManagementBiogenicCO2Emissions: round6(landMgmtEmissions),
        landManagementBiogenicCO2Removals: round6(landMgmtRemovals),
        aircraftGhgEmissions: round6(aircraft),
        pcfExcludingBiogenicUptake: round6(pcfExcl),
        pcfIncludingBiogenicUptake: round6(pcfIncl),
        materialsSubtotal: round6(materialsFossil),
        wasteSubtotal: round6(wasteFossil),
    };
}

// ============================================================
// Packaging Stage (9 fields)
// ============================================================

async function computePackagingStage(
    data: SupplierData,
    responseId: string,
    allocation: number
): Promise<StageEmissions> {
    // reference_period_start comes back from pg as a Date, whose .toString() is
    // "Wed Jan 01 2025 …" — slicing that gave "Wed " → NaN. Parse it as a real date.
    const year = new Date(data.main.reference_period_start ?? "").getFullYear() || 2025;
    const primarySite = data.q4_sites.find((s) => s.is_primary) ?? data.q4_sites[0] ?? null;
    const country = primarySite?.country ?? null;
    const region = primarySite?.region ?? null;

    dbg(`\n━━━ PACKAGING STAGE ━━━`);
    let fossil = 0;
    let biogenicNonCO2 = 0;
    let aircraft = 0;
    let packagingBiogenicCarbon = 0;
    let packagingLuc = 0;        // packagingLandUseChangeGhgEmissions
    let packagingLandMgmt = 0;   // packagingLandManagementBiogenicCO2Emissions

    // --- Q16 packaging materials
    for (const row of data.q16_packaging_materials) {
        const qty = num(row.packaging_weight);
        if (qty <= 0) continue;
        const ef_ = await ef({
            activityType: "packaging",
            material: row.packaging_type,
            process: row.process_type,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country: row.country ?? country, region: row.region ?? region,
            unit: row.unit, unitKind: "mass",
            year,
            sourceQuestion: "q16_packaging_materials",
            sourceRowId: row.id,
            responseId,
        });
        fossil += qty * ef_;
        const bioFrac = num(row.carbon_biogenic_pct) / 100;
        packagingBiogenicCarbon += qty * bioFrac;

        // packagingLandUseChangeGhgEmissions = Σ(packaging weight × LUC EF).
        //   LUC only applies to BIO-BASED packaging (wood/paper/cardboard), because
        //   growing that biomass can involve land conversion. The DB holds a LUC EF
        //   only for those materials → plastic/metal naturally resolve to 0.
        //   EF (domain land_use_change) will be seeded by Vishnu later; ef() returns
        //   0 until then, so this = weight × 0 = 0 for now. Same pattern as Q20.
        const packLucEf = await ef({
            activityType: "land_use_change",
            material: row.packaging_type,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country: row.country ?? country, region: row.region ?? region,
            unit: row.unit ?? "kg", unitKind: "mass",
            year,
            sourceQuestion: "q16_packaging_land_use_change",
            sourceRowId: row.id,
            responseId,
        });
        packagingLuc += qty * packLucEf;

        // packagingLandManagementBiogenicCO2Emissions = Σ(packaging weight × land-management EF).
        //   Same bio-based rule: DB holds a land_management EF only for wood/paper/cardboard,
        //   so plastic/metal resolve to 0. EF seeded by Vishnu later; 0 until then.
        const packLandMgmtEf = await ef({
            activityType: "land_management",
            material: row.packaging_type,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country: row.country ?? country, region: row.region ?? region,
            unit: row.unit ?? "kg", unitKind: "mass",
            year,
            sourceQuestion: "q16_packaging_land_management",
            sourceRowId: row.id,
            responseId,
        });
        packagingLandMgmt += qty * packLandMgmtEf;

        dbg(`   [Q16] ${row.packaging_type}: ${qty}${row.unit ?? "kg"} × ${ef_} = ${(qty * ef_).toFixed(6)}  ` +
            `bioCarbon=${qty}×${bioFrac}=${(qty * bioFrac).toFixed(6)}  ` +
            `LUC=${(qty * packLucEf).toFixed(6)}  landMgmt=${(qty * packLandMgmtEf).toFixed(6)}`);
    }

    // --- Q16a packaging transport
    for (const row of data.q16a_packaging_transport) {
        const dist = num(row.distance_km);
        const wt = num(row.weight);
        if (dist <= 0 || wt <= 0) continue;
        const ef_ = await ef({
            activityType: "transport",
            material: row.transport_mode,
            process: row.transport_mode,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country, region,
            unit: "tkm", unitKind: "freight",
            year,
            sourceQuestion: "q16a_packaging_transport",
            sourceRowId: row.id,
            responseId,
        });
        const tonnes = weightToTonnes(wt, row.unit);
        const contribution = dist * tonnes * ef_;
        if (transportModeIsAircraft(row)) aircraft += contribution;
        else fossil += contribution;
        dbg(`   [Q16a] ${row.transport_mode ?? row.sub_category}: ${dist}km × ${tonnes}t × ${ef_} = ${contribution.toFixed(6)} (${transportModeIsAircraft(row) ? "aircraft" : "fossil"})`);
    }

    // --- Q17 packaging waste
    let packagingWasteFossil = 0; // Q17-only, for the 5-bucket breakdown
    for (const row of data.q17_packaging_waste) {
        const qty = num(row.quantity);
        if (qty <= 0) continue;
        const ef_ = await ef({
            activityType: "waste",
            material: row.packaging_waste_type,
            process: row.treatment_type,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            country, region,
            unit: row.unit, unitKind: "mass",
            year,
            sourceQuestion: "q17_packaging_waste",
            sourceRowId: row.id,
            responseId,
        });
        const contrib = qty * ef_;
        fossil += contrib;
        packagingWasteFossil += contrib;
        dbg(`   [Q17] ${row.packaging_waste_type}${row.treatment_type ? ` / ${row.treatment_type}` : ""}: ` +
            `${qty}${row.unit ?? ""} × ${ef_} = ${contrib.toFixed(6)}`);
    }

    // Q17a packaging-waste transport → logistics (distribution) stage — see
    // computeDistributionStage. Not counted in packaging.

    // Positive magnitude (matches the production-stage convention we set 2026-07-10).
    const biogenicCO2Uptake = packagingBiogenicCarbon * CO2_PER_C;

    fossil *= allocation;
    biogenicNonCO2 *= allocation;
    aircraft *= allocation;
    packagingLuc *= allocation;
    packagingLandMgmt *= allocation;
    packagingWasteFossil *= allocation;

    const pcfExcl = fossil + biogenicNonCO2 + aircraft + packagingLuc + packagingLandMgmt;
    // uptake is a POSITIVE magnitude (CO2 absorbed) → "including uptake" SUBTRACTS it.
    const pcfIncl = pcfExcl - biogenicCO2Uptake;

    dbg(`   ── packaging totals: fossil=${round6(fossil)} aircraft=${round6(aircraft)} ` +
        `LUC=${round6(packagingLuc)} landMgmt=${round6(packagingLandMgmt)} biogenicUptake=${round6(biogenicCO2Uptake)}`);
    dbg(`   ── packaging PCF excl=${round6(pcfExcl)}  incl=${round6(pcfIncl)}  (allocation×${allocation})`);

    return {
        fossilGhgEmissions: round6(fossil),
        biogenicNonCO2Emissions: round6(biogenicNonCO2),
        biogenicCO2Uptake: round6(biogenicCO2Uptake),
        landUseChangeGhgEmissions: round6(packagingLuc),
        landManagementBiogenicCO2Emissions: round6(packagingLandMgmt),
        landManagementBiogenicCO2Removals: 0,
        aircraftGhgEmissions: round6(aircraft),
        pcfExcludingBiogenicUptake: round6(pcfExcl),
        pcfIncludingBiogenicUptake: round6(pcfIncl),
        wasteSubtotal: round6(packagingWasteFossil),
    };
}

// ============================================================
// Distribution Stage (9 fields)
// ============================================================

async function computeDistributionStage(
    data: SupplierData,
    responseId: string
): Promise<StageEmissions> {
    // reference_period_start comes back from pg as a Date, whose .toString() is
    // "Wed Jan 01 2025 …" — slicing that gave "Wed " → NaN. Parse it as a real date.
    const year = new Date(data.main.reference_period_start ?? "").getFullYear() || 2025;
    const primarySite = data.q4_sites.find((s) => s.is_primary) ?? data.q4_sites[0] ?? null;
    const country = primarySite?.country ?? null;
    const region = primarySite?.region ?? null;

    // Excel Logistics = B65(Q8c) + B170(Q19) + B212(Q14a) + B237(Q17a).
    dbg(`\n━━━ DISTRIBUTION / LOGISTICS STAGE ━━━`);
    dbg(`   (Q8c + Q14a + Q17a + Q19)`);
    let fossil = 0;
    let aircraft = 0; // distributionStageAircraftGhgEmissions — any air legs

    // --- Q8c inbound raw-material transport (Excel B65).
    // deployed_t_per_unit = weight_tonnes ÷ Q10b_units; leg = deployed × distance × EF.
    let q8cTotal = 0;
    for (const row of data.q8c_raw_material_transport ?? []) {
        const dist = num(row.distance_km);
        const wt = num(row.weight);
        if (dist <= 0 || wt <= 0) continue;
        const units = q10bUnitsForMpn(data, row.mpn);
        if (units <= 0) {
            dbg(`   [Q8c] skip leg mpn=${row.mpn ?? "?"} — Q10b units missing/0`);
            continue;
        }
        const tonnesTotal = weightToTonnes(wt, row.unit);
        const deployedPerUnit = tonnesTotal / units;
        const ef_ = await ef({
            activityType: "transport",
            material: row.specific_type || row.sub_category || row.category,
            process: row.sub_category,
            category: row.category,
            subCategory: row.sub_category,
            group: row.group_name,
            specificType: row.specific_type,
            country, region,
            unit: "tkm",
            unitKind: "freight",
            year,
            sourceQuestion: "q8c_raw_material_transport",
            sourceRowId: row.id,
            responseId,
        });
        const contribution = deployedPerUnit * dist * ef_;
        q8cTotal += contribution;
        if (transportModeIsAircraft(row)) aircraft += contribution;
        else fossil += contribution;
        dbg(
            `   [Q8c] ${row.specific_type ?? row.sub_category ?? "leg"}: ` +
            `wt=${tonnesTotal}t / units(Q10b)=${units} → deployed=${deployedPerUnit.toFixed(6)}t  ` +
            `× ${dist}km × EF ${ef_} = ${contribution.toFixed(6)} ` +
            `(${transportModeIsAircraft(row) ? "aircraft" : "fossil"})`
        );
    }
    if (q8cTotal > 0) {
        dbg(`   [Q8c] inbound transport TOTAL = ${round6(q8cTotal)} kgCO2e/unit`);
    }

    // --- Q14a production-waste transport (Excel B212). tonnes × distance × EF.
    let q14aTotal = 0;
    for (const row of data.q14a_production_waste_transport ?? []) {
        const dist = num(row.distance_km);
        const wt = num(row.weight);
        if (dist <= 0 || wt <= 0) continue;
        const tonnes = weightToTonnes(wt, row.unit);
        const ef_ = await ef({
            activityType: "transport",
            material: row.specific_type || row.sub_category || row.category,
            process: row.sub_category,
            category: row.category,
            subCategory: row.sub_category,
            group: row.group_name,
            specificType: row.specific_type,
            country, region,
            unit: "tkm",
            unitKind: "freight",
            year,
            sourceQuestion: "q14a_production_waste_transport",
            sourceRowId: row.id,
            responseId,
        });
        const contribution = tonnes * dist * ef_;
        q14aTotal += contribution;
        if (transportModeIsAircraft(row)) aircraft += contribution;
        else fossil += contribution;
        dbg(
            `   [Q14a] ${row.specific_type ?? row.sub_category ?? "leg"}: ` +
            `${tonnes}t × ${dist}km × EF ${ef_} = ${contribution.toFixed(6)} ` +
            `(${transportModeIsAircraft(row) ? "aircraft" : "fossil"})`
        );
    }
    if (q14aTotal > 0) {
        dbg(`   [Q14a] waste transport TOTAL = ${round6(q14aTotal)} kgCO2e`);
    }

    // --- Q17a packaging-waste transport (Excel B237). Same formula as Q14a.
    let q17aTotal = 0;
    for (const row of data.q17a_packaging_waste_transport ?? []) {
        const dist = num(row.distance_km);
        const wt = num(row.weight);
        if (dist <= 0 || wt <= 0) continue;
        const tonnes = weightToTonnes(wt, row.unit);
        const ef_ = await ef({
            activityType: "transport",
            material: row.specific_type || row.sub_category || row.category,
            process: row.sub_category,
            category: row.category,
            subCategory: row.sub_category,
            group: row.group_name,
            specificType: row.specific_type,
            country, region,
            unit: "tkm",
            unitKind: "freight",
            year,
            sourceQuestion: "q17a_packaging_waste_transport",
            sourceRowId: row.id,
            responseId,
        });
        const contribution = tonnes * dist * ef_;
        q17aTotal += contribution;
        if (transportModeIsAircraft(row)) aircraft += contribution;
        else fossil += contribution;
        dbg(
            `   [Q17a] ${row.specific_type ?? row.sub_category ?? "leg"}: ` +
            `${tonnes}t × ${dist}km × EF ${ef_} = ${contribution.toFixed(6)} ` +
            `(${transportModeIsAircraft(row) ? "aircraft" : "fossil"})`
        );
    }
    if (q17aTotal > 0) {
        dbg(`   [Q17a] packaging waste transport TOTAL = ${round6(q17aTotal)} kgCO2e`);
    }

    // --- Q19 outbound distribution legs (Excel B170).
    let q19Total = 0;
    for (const row of data.q19_transport_legs) {
        const dist = num(row.distance_km);
        const wt = num(row.weight);
        if (dist <= 0 || wt <= 0) continue;
        const ef_ = await ef({
            activityType: "transport",
            material: row.transport_mode,
            process: row.transport_mode,
            category: row.category, subCategory: row.sub_category, group: row.group_name, specificType: row.specific_type,
            unit: "tkm", unitKind: "freight",
            year,
            sourceQuestion: "q19_transport_legs",
            sourceRowId: row.id,
            responseId,
        });
        const tonnes = weightToTonnes(wt, row.unit);
        const contribution = dist * tonnes * ef_;
        q19Total += contribution;
        if (transportModeIsAircraft(row)) aircraft += contribution;
        else fossil += contribution;
        dbg(`   [Q19-dist] ${row.transport_mode ?? row.sub_category}: ${dist}km × ${tonnes}t × ${ef_} = ${contribution.toFixed(6)} (${transportModeIsAircraft(row) ? "aircraft" : "fossil"})`);
    }
    if (q19Total > 0) {
        dbg(`   [Q19] distribution transport TOTAL = ${round6(q19Total)} kgCO2e`);
    }

    const pcfExcl = fossil + aircraft;
    dbg(
        `   ── logistics TOTAL = Q8c(${round6(q8cTotal)}) + Q14a(${round6(q14aTotal)}) ` +
        `+ Q17a(${round6(q17aTotal)}) + Q19(${round6(q19Total)}) ` +
        `= ${round6(pcfExcl)}  (fossil=${round6(fossil)} aircraft=${round6(aircraft)})`
    );
    return {
        fossilGhgEmissions: round6(fossil),
        biogenicNonCO2Emissions: 0,
        biogenicCO2Uptake: 0,
        landUseChangeGhgEmissions: 0,
        landManagementBiogenicCO2Emissions: 0,
        landManagementBiogenicCO2Removals: 0,
        aircraftGhgEmissions: round6(aircraft),
        pcfExcludingBiogenicUptake: round6(pcfExcl),
        pcfIncludingBiogenicUptake: round6(pcfExcl),
    };
}

// ============================================================
// Verification & Certification Shares (4 fields)
// ============================================================

function computeVerificationShares(data: SupplierData): ComputedFields["verificationShares"] {
    const totalProd = num(data.main.total_production_volume);
    const totalProduct = num(data.main.total_product_volume) || totalProd;

    const pct = (numerator: number, denom: number) =>
        denom > 0 ? round6((numerator / denom) * 100) : 0;

    return {
        programCertificationShare: pct(num(data.main.certified_volume), totalProd),
        productVerificationShare1stParty: pct(num(data.main.verified_volume_1st_party), totalProduct),
        productVerificationShare2ndParty: pct(num(data.main.verified_volume_2nd_party), totalProduct),
        productVerificationShare3rdParty: pct(num(data.main.verified_volume_3rd_party), totalProduct),
    };
}

// ============================================================
// EF lookup helper — calls findBestEf, returns kgCO2e/unit (0 on miss).
// ============================================================

async function ef(input: EfMatchInput): Promise<number> {
    const result: EfMatchResult = await findBestEf(input);
    const v = result.winningRow ? parseFloat(result.winningRow.kgco2e_per_unit ?? "0") : 0;
    const val = Number.isFinite(v) ? v : 0;
    if (DEBUG) {
        const w = result.winningRow;
        const name = w ? (w.product ?? w.specific_type ?? "?") : null;
        dbg(
            `   [EF] ${String(input.sourceQuestion).padEnd(20)} ` +
            `"${input.material ?? ""}"${input.process ? ` / "${input.process}"` : ""} ` +
            `(${input.unit ?? "-"}, ${input.country ?? "-"}) → ` +
            (w
                ? `${name} = ${val} kgCO2e/${input.unit ?? "unit"}  [${result.confidence} ${Math.round(result.score)}]`
                : `❌ NO MATCH → 0`)
        );
    }
    return val;
}

// ============================================================
// Persist computed fields
// ============================================================

async function persistComputedFields(responseId: string, computed: ComputedFields): Promise<void> {
    const flat: Array<{ path: string; value: number }> = [];

    const walk = (prefix: string, obj: any) => {
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (typeof v === "number") flat.push({ path, value: v });
            else if (typeof v === "boolean") flat.push({ path, value: v ? 1 : 0 });
            else if (v && typeof v === "object") walk(path, v);
        }
    };
    walk("", computed);

    await withClient(async (client: any) => {
        // Clear previous computation for this response → keep table clean.
        await client.query(
            `DELETE FROM pcf_computed_field WHERE response_id = $1`,
            [responseId]
        );
        for (const f of flat) {
            await client.query(
                `INSERT INTO pcf_computed_field (id, response_id, field_path, value)
                 VALUES ($1, $2, $3, $4)`,
                [ulid(), responseId, f.path, f.value]
            );
        }
    });
}

// ============================================================
// Utilities
// ============================================================

function num(v: any): number {
    if (v == null) return 0;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
}

function round6(v: number): number {
    return Math.round(v * 1e6) / 1e6;
}

function isAircraft(mode?: string | null): boolean {
    if (!mode) return false;
    const m = mode.toLowerCase();
    return m.includes("air") || m.includes("plane") || m.includes("aircraft") || m.includes("aviation");
}

// The supplier's transport mode lives in transport_mode on some rows but in
// sub_category / specific_type on others (e.g. sub_category="Aircraft",
// specific_type="Aircraft Freight [Legacy]" while transport_mode is empty).
// Check them all so air freight is booked to aircraftGhgEmissions instead of
// being silently misfiled as fossil.
function transportModeIsAircraft(row: any): boolean {
    return isAircraft(
        [row?.transport_mode, row?.sub_category, row?.group_name, row?.specific_type]
            .filter(Boolean)
            .join(" ")
    );
}
