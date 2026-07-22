// ------------------------------------------------------------------
// PCF Submodel (read-only preview) service.
//
// The PCF request page shows, after "Run PCF Calculation", the Catena-X
// Semantic PCF Data Model v9.0.0 submodel for the product and for EACH
// component. The frontend flattens the raw submodel itself (its own field
// catalog) — so here we just return the raw submodel JSON, the same shape
// that would be published to Quintari.
//
// Component -> response mapping mirrors pcfCalcV3Service:
//   bom row (bom_pcf_id = request) -> supplier_id -> supplier_questionnaire_response
// ------------------------------------------------------------------

import { withClient } from "../util/database.js";
import { assembleEnviraanInput } from "./payloadAssembler.js";
import {
    buildPcfV9Payload,
    EnviraanPcfInput,
    PCF_V9_SEMANTIC_ID,
    PCF_V9_SPEC_VERSION,
} from "../util/buildPcfV9Payload.js";

export interface ComponentSubmodel {
    bomId: string;
    componentName: string | null;
    materialNumber: string | null;
    componentCategory: string | null;
    supplierName: string | null;
    submodel: Record<string, unknown>;
    semanticId: string;
    specVersion: string;
}

interface BomComponent {
    id: string;
    component_name: string | null;
    material_number: string | null;
    component_category: string | null;
    supplier_id: string | null;
}

// Resolve every component of a request that has a saved questionnaire response,
// paired with that response id.
async function loadComponentResponses(
    bomPcfId: string
): Promise<Array<{ bom: BomComponent; responseId: string }>> {
    return withClient(async (client: any) => {
        const boms: BomComponent[] = (
            await client.query(
                `SELECT id, component_name, material_number, component_category, supplier_id
                 FROM bom WHERE bom_pcf_id = $1`,
                [bomPcfId]
            )
        ).rows;

        const out: Array<{ bom: BomComponent; responseId: string }> = [];
        for (const bom of boms) {
            if (!bom.supplier_id) continue;
            const resp = (
                await client.query(
                    `SELECT id FROM supplier_questionnaire_response
                     WHERE bom_pcf_request_id = $1 AND supplier_id = $2
                     ORDER BY id DESC LIMIT 1`,
                    [bomPcfId, bom.supplier_id]
                )
            ).rows[0];
            if (resp) out.push({ bom, responseId: String(resp.id) });
        }
        return out;
    });
}

// Best-effort supplier display name (supplier_details schema varies; tolerate absence).
async function lookupSupplierName(supplierId: string | null): Promise<string | null> {
    if (!supplierId) return null;
    try {
        return await withClient(async (client: any) => {
            const sup = (
                await client.query(
                    `SELECT * FROM supplier_details WHERE sup_id = $1 LIMIT 1`,
                    [supplierId]
                )
            ).rows[0];
            if (!sup) return null;
            return (
                sup.supplier_name ?? sup.company_name ?? sup.name ?? sup.sup_name ?? null
            );
        });
    } catch {
        return null;
    }
}

/**
 * Per-component submodels for a PCF request. Only components whose supplier has
 * a saved response are included (others aren't calculable yet). Returns [] if
 * none — caller can 404.
 */
export async function buildSubmodelsPerComponent(
    bomPcfId: string
): Promise<ComponentSubmodel[]> {
    const pairs = await loadComponentResponses(bomPcfId);

    const results: ComponentSubmodel[] = [];
    for (const { bom, responseId } of pairs) {
        const input = await assembleEnviraanInput(responseId);
        const submodel = buildPcfV9Payload(input);
        const supplierName = await lookupSupplierName(bom.supplier_id);
        results.push({
            bomId: bom.id,
            componentName: bom.component_name ?? null,
            materialNumber: bom.material_number ?? null,
            componentCategory: bom.component_category ?? null,
            supplierName,
            submodel,
            semanticId: PCF_V9_SEMANTIC_ID,
            specVersion: PCF_V9_SPEC_VERSION,
        });
    }
    return results;
}

export interface AggregatedComputedDetail {
    /** Identity/methodology from the first component (for the aggregate submodel). */
    base: EnviraanPcfInput;
    totalPcfValue: number;
    productionStageDetail: any;
    packagingStageDetail: any;
    distributionStageDetail: any;
    carbonContentDetail: {
        biogenicCarbonContent: number;
        fossilCarbonContent: number;
        recycledCarbonContent: number;
        carbonContentTotal: number;
        packagingBiogenicCarbonContent: number;
    };
}

/**
 * Sum the life-cycle-stage emissions and carbon content across every calculable
 * component of a request (read from pcf_computed_field via assembleEnviraanInput).
 * Shared by the aggregate submodel builder AND the Quintari publish path so both
 * send identical, real values. Returns null when no component has a saved response.
 */
export async function aggregateComputedDetail(
    bomPcfId: string
): Promise<AggregatedComputedDetail | null> {
    const pairs = await loadComponentResponses(bomPcfId);
    if (pairs.length === 0) return null;

    const inputs: EnviraanPcfInput[] = [];
    for (const { responseId } of pairs) {
        inputs.push(await assembleEnviraanInput(responseId));
    }

    // Base identity/methodology from the first component.
    const base = inputs[0];
    const zeroStage = () => ({
        fossilGhgEmissions: 0,
        biogenicNonCO2Emissions: 0,
        biogenicCO2Uptake: 0,
        landUseChangeGhgEmissions: 0,
        landManagementBiogenicCO2Emissions: 0,
        landManagementBiogenicCO2Removals: 0,
        aircraftGhgEmissions: 0,
        pcfExcludingBiogenicUptake: 0,
        pcfIncludingBiogenicUptake: 0,
    });
    const prod = zeroStage();
    const pack = { ...zeroStage(), packagingEmissionsIncluded: false };
    const dist = { ...zeroStage(), distributionStageIncluded: false };
    const carbon = {
        biogenicCarbonContent: 0,
        fossilCarbonContent: 0,
        recycledCarbonContent: 0,
        carbonContentTotal: 0,
        packagingBiogenicCarbonContent: 0,
    };
    let totalPcf = 0;

    const addStage = (acc: any, s: any) => {
        if (!s) return;
        for (const k of Object.keys(acc)) {
            if (typeof acc[k] === "number") acc[k] += Number(s[k] ?? 0);
        }
    };

    for (const inp of inputs) {
        addStage(prod, inp.productionStageDetail);
        addStage(pack, inp.packagingStageDetail);
        addStage(dist, inp.distributionStageDetail);
        if (inp.carbonContentDetail) {
            for (const k of Object.keys(carbon) as Array<keyof typeof carbon>) {
                carbon[k] += Number((inp.carbonContentDetail as any)[k] ?? 0);
            }
        }
        if (inp.packagingStageDetail?.packagingEmissionsIncluded) pack.packagingEmissionsIncluded = true;
        if (inp.distributionStageDetail?.distributionStageIncluded) dist.distributionStageIncluded = true;
        totalPcf += Number(inp.totalPcfValue ?? 0);
    }

    const round6 = (v: number) => Math.round(v * 1e6) / 1e6;
    const roundStage = (s: any) => {
        for (const k of Object.keys(s)) if (typeof s[k] === "number") s[k] = round6(s[k]);
        return s;
    };

    return {
        base,
        totalPcfValue: round6(totalPcf),
        productionStageDetail: roundStage(prod),
        packagingStageDetail: roundStage(pack),
        distributionStageDetail: roundStage(dist),
        carbonContentDetail: roundStage(carbon),
    };
}

/**
 * Aggregate "product (all components)" submodel: identity/methodology taken from
 * the first component, with the life-cycle-stage emissions and carbon content
 * SUMMED across all components (the product's total footprint). Returns null
 * when there are no calculable components.
 */
export async function buildAggregateSubmodel(
    bomPcfId: string
): Promise<{ submodel: Record<string, unknown>; semanticId: string; specVersion: string } | null> {
    const d = await aggregateComputedDetail(bomPcfId);
    if (!d) return null;

    const aggregateInput: EnviraanPcfInput = {
        ...d.base,
        totalPcfValue: d.totalPcfValue,
        productionStageDetail: d.productionStageDetail,
        packagingStageDetail: d.packagingStageDetail,
        distributionStageDetail: d.distributionStageDetail,
        carbonContentDetail: d.carbonContentDetail,
    };

    return {
        submodel: buildPcfV9Payload(aggregateInput),
        semanticId: PCF_V9_SEMANTIC_ID,
        specVersion: PCF_V9_SPEC_VERSION,
    };
}
