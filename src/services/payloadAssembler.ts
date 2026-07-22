// Payload Assembler — final piece of the 28-question → Quintari pipeline.
//
// Inputs : a response_id (saved supplier answers + already-computed pcf_computed_field rows).
// Output : a fully-shaped Catena-X PCF v9.0.0 JSON ready for Quintari publish.
//
// Wiring per the Final_Catena-x_Reporting_Structure CSV:
//   - "As per Supplier Input" fields → copied from sq_response + child tables
//   - "Calculation" fields            → loaded from pcf_computed_field (formula engine output)
//   - "Default" fields                → hardcoded constants
//   - "System Generated" fields       → UUIDs / timestamps generated here or in buildPcfV9Payload
//
// We delegate the final JSON shaping to the existing buildPcfV9Payload() so
// the Quintari publisher contract stays the same. We just supply richer input.

import { computePcfFields } from "./formulaEngine.js";
import {
    buildPcfV9Payload,
    EnviraanPcfInput,
    PcfScope,
    RetroOrProspective,
} from "../util/buildPcfV9Payload.js";
import { withClient } from "../util/database.js";

// ============================================================
// Public entry points
// ============================================================

/**
 * Build the Catena-X v9 JSON for a saved supplier response.
 * If `recompute` is true (default) the formula engine runs first so the
 * payload reflects the freshest supplier data.
 */
export async function buildPayloadFromResponse(
    responseId: string,
    options: { recompute?: boolean } = {}
): Promise<Record<string, unknown>> {
    const recompute = options.recompute !== false;
    if (recompute) {
        await computePcfFields(responseId);
    }

    const input = await assembleEnviraanInput(responseId);
    return buildPcfV9Payload(input);
}

/**
 * Lower-level: builds the EnviraanPcfInput from DB without producing the JSON.
 * Useful for tests or for callers that want to tweak fields before shaping.
 */
export async function assembleEnviraanInput(responseId: string): Promise<EnviraanPcfInput> {
    const ctx = await loadAll(responseId);
    if (!ctx.main) throw new Error(`Supplier response not found: ${responseId}`);

    const computed = readComputedFields(ctx.computedRows);
    const primarySite = ctx.q4_sites.find((s) => s.is_primary) ?? ctx.q4_sites[0] ?? null;

    const country = primarySite?.country ?? "IN";
    const region = primarySite?.region ?? null;
    const countrySubdivision = primarySite?.country_subdivision ?? "";

    // PCF type label that buildPcfV9Payload accepts (it only models the two
    // root flavours; the sub-types stay in the supplier answer for audit).
    const retroOrProspective: RetroOrProspective = String(ctx.main.retro_or_prospective_pcf_type ?? "")
        .toLowerCase()
        .includes("retro")
        ? "Retrospective PCF"
        : "Prospective PCF";

    const scope: PcfScope =
        String(ctx.main.system_boundary ?? "cradle-to-gate").toLowerCase().includes("grave")
            ? "Cradle-to-grave"
            : "Cradle-to-gate";

    const ipccVersion = (ctx.main.ipcc_gwp_version === "AR6" ? "AR6" : "AR5") as "AR5" | "AR6";

    const totalPcf =
        computed.productionStage.pcfIncludingBiogenicUptake +
        computed.packagingStage.pcfIncludingBiogenicUptake +
        computed.distributionStage.pcfIncludingBiogenicUptake;

    // Validity window is stamped at report-generation time: it starts on the
    // generation date and ends on the same date one year later. setUTCFullYear
    // normalizes a Feb-29 start to Mar-1 the next year automatically.
    const generatedAt = new Date();
    const validityEndDate = new Date(generatedAt);
    validityEndDate.setUTCFullYear(validityEndDate.getUTCFullYear() + 1);
    const validityStart = generatedAt.toISOString();
    const validityEnd = validityEndDate.toISOString();

    return {
        // --- Identity / product
        productCode: cleanProductId(ctx.main.product_id_urn),
        productName: ctx.main.product_name_company ?? "",
        productDescription: ctx.main.product_description ?? undefined,
        productMassKg: numOrUndef(ctx.main.product_mass_per_declared_unit),
        declaredUnitOfMeasurement: ctx.main.declared_unit ?? undefined,
        declaredUnitAmount: numOrUndef(ctx.main.declared_unit_amount),
        productClassifications: ctx.main.product_classification_urn
            ? [ctx.main.product_classification_urn]
            : [],

        // --- Company
        companyName: ctx.main.company_name ?? "",
        companyBpn: extractBpn(ctx.main.company_id_urn),

        // --- Totals (legacy flat fields kept for backwards compat)
        totalPcfValue: round6(totalPcf),
        materialValue: round6(computed.productionStage.fossilGhgEmissions),
        productionValue: 0,
        packagingValue: round6(computed.packagingStage.pcfIncludingBiogenicUptake),
        logisticValue: round6(computed.distributionStage.pcfIncludingBiogenicUptake),
        wasteValue: 0,

        // --- Geography (supplier input)
        geographyCountry: country,
        geographyCountrySubdivision: countrySubdivision,
        geographyRegionOrSubregion: region ?? undefined,

        // --- Time
        // Reference period is supplier-provided (end auto-derived to complete one
        // financial year). Validity is NOT collected from the supplier: it is set
        // here at PCF report generation — validity runs from the generation date
        // until the same date one year later.
        referencePeriodStart: isoDate(ctx.main.reference_period_start) ?? "2025-01-01T00:00:00Z",
        referencePeriodEnd: isoDate(ctx.main.reference_period_end) ?? "2025-12-31T23:59:59Z",
        validityPeriodStart: validityStart,
        validityPeriodEnd: validityEnd,

        // --- Scope + methodology
        pcfScope: scope,
        crossSectoralStandards: ctx.main.cross_sectoral_standards
            ? [ctx.main.cross_sectoral_standards]
            : ["ISO 14067"],
        productOrSectorSpecificRules: ctx.main.product_or_sector_specific_rules
            ? [ctx.main.product_or_sector_specific_rules]
            : ["Catena-X Rulebook V4"],
        ipccCharacterizationFactors: ipccVersion,
        allocationRecycledCarbon: ctx.main.allocation_recycled_carbon ?? "cut-off",
        allocationWasteIncineration: ctx.main.allocation_waste_incineration ?? "polluter pays principle",
        boundaryProcessesDescription:
            ctx.main.boundary_processes_description ?? "Cradle-to-gate processes including raw materials, production, and packaging.",
        exemptedEmissionsPercent: numOrUndef(ctx.main.exempted_emissions_percent),
        exemptedEmissionsDescription: ctx.main.exempted_emissions_description ?? "No exemption",

        // --- Data quality
        secondaryEmissionFactorSources: ctx.main.secondary_ef_sources
            ? [ctx.main.secondary_ef_sources]
            : ["ecoinvent 3.8"],
        primaryDataShare: numOrUndef(ctx.main.primary_data_share_pct),
        technologicalDQR: numOrUndef(ctx.main.technological_dqr),
        geographicalDQR: numOrUndef(ctx.main.geographical_dqr),
        temporalDQR: numOrUndef(ctx.main.temporal_dqr),

        // --- Mass balancing
        massBalancingUsed: !!ctx.main.mass_balancing_used,
        massBalancingCertificateScheme: ctx.main.mass_balancing_certificate_scheme ?? "Not applicable",
        freeAttributionInMassBalancing: ctx.main.free_attribution_in_mass_balancing ? "true" : "false",

        // --- Technology
        ccsTechnologicalCO2CaptureIncluded: !!ctx.main.ccs_co2_capture_included,

        // --- Verification / certification shares (computed from Q27)
        programCertificationShare: round6(computed.verificationShares.programCertificationShare),
        productVerificationShare1stParty: round6(computed.verificationShares.productVerificationShare1stParty),
        productVerificationShare2ndParty: round6(computed.verificationShares.productVerificationShare2ndParty),
        productVerificationShare3rdParty: round6(computed.verificationShares.productVerificationShare3rdParty),

        // --- Attestation (only included when PCF was verified)
        attestation: ctx.main.is_pcf_verified
            ? {
                  link: ctx.main.attestation_link ?? "",
                  standardName: ctx.main.attestation_conformant_standards ?? "Catena-X Product Carbon Footprint Rulebook v4",
                  completedAt: isoDate(ctx.main.attestation_completed_at) ?? new Date(0).toISOString(),
                  providerId: ctx.main.attestation_provider_id ?? "",
                  providerName: ctx.main.attestation_provider_name ?? "",
                  attestationType: ctx.main.attestation_type ?? "",
                  attestationStandard: ctx.main.attestation_scheme_standard ?? "",
              }
            : undefined,

        // --- Status / type
        retroOrProspectivePcfType: retroOrProspective,
        pcfStatus: "Active",
        pcfVersion: 0,
        precedingPfIds: [],

        // --- General
        comment: ctx.main.comments ?? `Generated from Enviraan supplier response ${responseId}`,

        // --- DETAILED computed fields (the whole point of the new pipeline)
        carbonContentDetail: computed.carbonContent,
        productionStageDetail: computed.productionStage,
        packagingStageDetail: computed.packagingStage,
        distributionStageDetail: computed.distributionStage,
    };
}

// ============================================================
// Internals
// ============================================================

interface LoadedContext {
    main: any;
    q4_sites: any[];
    computedRows: Array<{ field_path: string; value: number }>;
}

async function loadAll(responseId: string): Promise<LoadedContext> {
    return withClient(async (client: any) => {
        const main = (
            await client.query(
                `SELECT * FROM supplier_questionnaire_response WHERE id = $1`,
                [responseId]
            )
        ).rows[0];

        const q4 = (
            await client.query(
                `SELECT * FROM sq_q4_sites WHERE response_id = $1 ORDER BY row_order`,
                [responseId]
            )
        ).rows;

        const computed = (
            await client.query(
                `SELECT field_path, value FROM pcf_computed_field WHERE response_id = $1`,
                [responseId]
            )
        ).rows;

        return { main, q4_sites: q4, computedRows: computed };
    });
}

/**
 * Re-hydrate the flat `pcf_computed_field` rows into the nested ComputedFields shape
 * that buildPcfV9Payload's detail interfaces expect.
 */
function readComputedFields(rows: Array<{ field_path: string; value: number }>) {
    const m = new Map(rows.map((r) => [r.field_path, Number(r.value)]));
    const g = (path: string) => m.get(path) ?? 0;
    const bool = (path: string) => (m.get(path) ?? 0) > 0;

    return {
        carbonContent: {
            biogenicCarbonContent: g("carbonContent.biogenicCarbonContent"),
            fossilCarbonContent: g("carbonContent.fossilCarbonContent"),
            recycledCarbonContent: g("carbonContent.recycledCarbonContent"),
            carbonContentTotal: g("carbonContent.carbonContentTotal"),
            packagingBiogenicCarbonContent: g("carbonContent.packagingBiogenicCarbonContent"),
        },
        productionStage: stageOf("productionStage", g),
        packagingStage: {
            ...stageOf("packagingStage", g),
            packagingEmissionsIncluded: bool("packagingStage.packagingEmissionsIncluded"),
        },
        distributionStage: {
            ...stageOf("distributionStage", g),
            distributionStageIncluded: bool("distributionStage.distributionStageIncluded"),
        },
        verificationShares: {
            programCertificationShare: g("verificationShares.programCertificationShare"),
            productVerificationShare1stParty: g("verificationShares.productVerificationShare1stParty"),
            productVerificationShare2ndParty: g("verificationShares.productVerificationShare2ndParty"),
            productVerificationShare3rdParty: g("verificationShares.productVerificationShare3rdParty"),
        },
    };
}

function stageOf(prefix: string, g: (p: string) => number) {
    return {
        fossilGhgEmissions: g(`${prefix}.fossilGhgEmissions`),
        biogenicNonCO2Emissions: g(`${prefix}.biogenicNonCO2Emissions`),
        biogenicCO2Uptake: g(`${prefix}.biogenicCO2Uptake`),
        landUseChangeGhgEmissions: g(`${prefix}.landUseChangeGhgEmissions`),
        landManagementBiogenicCO2Emissions: g(`${prefix}.landManagementBiogenicCO2Emissions`),
        landManagementBiogenicCO2Removals: g(`${prefix}.landManagementBiogenicCO2Removals`),
        aircraftGhgEmissions: g(`${prefix}.aircraftGhgEmissions`),
        pcfExcludingBiogenicUptake: g(`${prefix}.pcfExcludingBiogenicUptake`),
        pcfIncludingBiogenicUptake: g(`${prefix}.pcfIncludingBiogenicUptake`),
    };
}

// ============================================================
// Small helpers
// ============================================================

function numOrUndef(v: any): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : undefined;
}

function round6(v: number): number {
    return Math.round(v * 1e6) / 1e6;
}

function isoDate(v: any): string | undefined {
    if (!v) return undefined;
    try {
        const d = v instanceof Date ? v : new Date(v);
        if (isNaN(d.getTime())) return undefined;
        return d.toISOString();
    } catch {
        return undefined;
    }
}

/**
 * Supplier types product IDs as either "FBB-001" or a URN like "urn:mycompany.com:product-id:FBB-001".
 * The Quintari publisher just needs the short code; strip URN prefix when present.
 */
function cleanProductId(raw: any): string {
    if (!raw) return "UNKNOWN";
    const s = String(raw).trim();
    const lastColon = s.lastIndexOf(":");
    return lastColon >= 0 ? s.substring(lastColon + 1) : s;
}

/**
 * Extract a bare BPN from "urn:bpn:BPNL000000000DWF" → "BPNL000000000DWF".
 * Pass through if already bare. Default placeholder if missing.
 */
function extractBpn(raw: any): string {
    if (!raw) return "BPNL000000000001";
    const s = String(raw).trim();
    const m = s.match(/BPN[LS][A-Za-z0-9]{12}/);
    return m ? m[0] : s;
}
