import { randomUUID } from "node:crypto";
import { withClient } from "../util/database.js";
import type { EnviraanPcfInput } from "../util/buildPcfV9Payload.js";

export interface QuintariPublication {
    id: string;
    bomPcfRequestId: string;
    productCode: string;
    digitalTwinId: string;
    partTypeInformationSubmodelId: string | null;
    pcfSubmodelId: string;
    catenaXId: string | null;
    pcfAspectVersion: string;
    pushedOverallPcf: number | null;
    publishedAt: string;
    lastAnsweredAt: string | null;
    answerCount: number;
}

export interface RecordPublicationInput {
    bomPcfRequestId: string;
    productCode: string;
    digitalTwinId: string;
    partTypeInformationSubmodelId?: string | null;
    pcfSubmodelId: string;
    catenaXId?: string | null;
    pushedOverallPcf?: number | null;
}

export interface EligiblePcfRequestSummary {
    id: string;
    code: string;
    productCode: string | null;
    productName: string | null;
    status: string;
    overallPcf: number | null;
    isOwnEmissionCalculated: boolean;
    createdDate: string;
}

export async function listEligiblePcfRequests(
    limit = 10
): Promise<EligiblePcfRequestSummary[]> {
    return withClient(async (client) => {
        const result = await client.query(
            `
            SELECT
                r.id,
                r.code,
                r.product_code AS "productCode",
                p.product_name AS "productName",
                r.status,
                r.overall_pcf AS "overallPcf",
                r.is_own_emission_calculated AS "isOwnEmissionCalculated",
                r.created_date AS "createdDate"
            FROM bom_pcf_request r
            LEFT JOIN product p ON p.product_code = r.product_code
            WHERE r.overall_pcf IS NOT NULL
              AND r.overall_pcf > 0
            ORDER BY r.created_date DESC
            LIMIT $1
            `,
            [limit]
        );
        return result.rows as EligiblePcfRequestSummary[];
    });
}

export async function buildEnviraanPcfInputFromRequest(
    bomPcfRequestId: string
): Promise<EnviraanPcfInput> {
    return withClient(async (client) => {
        const reqResult = await client.query(
            `
            SELECT
                r.id,
                r.code,
                r.product_code,
                r.overall_pcf,
                r.overall_own_emission_pcf,
                r.manufacturer_id,
                r.client_id,
                r.status,
                r.created_date,
                p.product_name,
                p.ts_weight_kg,
                p.ts_part_number,
                p.description
            FROM bom_pcf_request r
            LEFT JOIN product p ON p.product_code = r.product_code
            WHERE r.id = $1
            `,
            [bomPcfRequestId]
        );

        if (reqResult.rows.length === 0) {
            throw new Error(`bom_pcf_request not found: ${bomPcfRequestId}`);
        }
        const req = reqResult.rows[0];

        const emissionsResult = await client.query(
            `
            SELECT
                COALESCE(SUM(material_value), 0)    AS material_value,
                COALESCE(SUM(production_value), 0)  AS production_value,
                COALESCE(SUM(packaging_value), 0)   AS packaging_value,
                COALESCE(SUM(logistic_value), 0)    AS logistic_value,
                COALESCE(SUM(waste_value), 0)       AS waste_value,
                COALESCE(SUM(total_pcf_value), 0)   AS total_pcf_value
            FROM bom_emission_calculation_engine
            WHERE product_bom_pcf_id = $1
            `,
            [bomPcfRequestId]
        );
        const e = emissionsResult.rows[0];

        const totalPcf = Number(e.total_pcf_value) || Number(req.overall_pcf) || 0;
        const companyName =
            process.env.QUINTARI_OWN_COMPANY_NAME ||
            "Enviguide Techno Solutions Pvt Ltd";
        const companyBpn = process.env.QUINTARI_OWN_BPN || "BPNL000000000001";
        const referenceYear = new Date(req.created_date).getFullYear();

        const productCode = req.product_code || req.code || "UNKNOWN";
        const productName = req.product_name || `Product ${productCode}`;

        return {
            productCode,
            productName,
            productDescription: req.description ?? undefined,
            productMassKg: req.ts_weight_kg != null ? Number(req.ts_weight_kg) : undefined,
            companyName,
            companyBpn,
            totalPcfValue: totalPcf,
            materialValue: Number(e.material_value) || 0,
            productionValue: Number(e.production_value) || 0,
            packagingValue: Number(e.packaging_value) || 0,
            logisticValue: Number(e.logistic_value) || 0,
            wasteValue: Number(e.waste_value) || 0,
            geographyCountry: "IN",
            geographyCountrySubdivision: "IN-TG",
            referencePeriodStart: `${referenceYear}-01-01T00:00:00Z`,
            referencePeriodEnd: `${referenceYear}-12-31T23:59:59Z`,
            pcfScope: "Cradle-to-gate",
            primaryDataShare: 50,
            technologicalDQR: 2,
            geographicalDQR: 2,
            temporalDQR: 2,
            pcfVersion: 1,
            comment: `Generated from Enviraan PCF request ${req.code}`,
        };
    });
}

export interface PerComponentPcfInput {
    bomId: string;
    componentName: string;
    materialNumber: string;
    componentCategory: string;
    supplierName: string;
    input: EnviraanPcfInput;
}

/**
 * Builds one EnviraanPcfInput per calculated BOM component of a request (rather
 * than the single product-level aggregate). Each component's per-stage values
 * come from its own bom_emission_calculation_engine row (product_id IS NULL).
 * Used by the read-only per-component submodel preview — no side effects.
 */
export async function buildEnviraanPcfInputsPerComponentFromRequest(
    bomPcfRequestId: string
): Promise<PerComponentPcfInput[]> {
    return withClient(async (client) => {
        const reqResult = await client.query(
            `SELECT r.id, r.code, r.created_date
             FROM bom_pcf_request r
             WHERE r.id = $1`,
            [bomPcfRequestId]
        );
        if (reqResult.rows.length === 0) {
            throw new Error(`bom_pcf_request not found: ${bomPcfRequestId}`);
        }
        const req = reqResult.rows[0];
        const referenceYear = new Date(req.created_date).getFullYear();
        const companyName =
            process.env.QUINTARI_OWN_COMPANY_NAME ||
            "Enviguide Techno Solutions Pvt Ltd";
        const companyBpn = process.env.QUINTARI_OWN_BPN || "BPNL000000000001";

        const compResult = await client.query(
            `SELECT
                b.id                 AS bom_id,
                b.code               AS bom_code,
                b.material_number,
                b.component_name,
                b.component_category,
                b.detail_description,
                b.weight_gms,
                b.total_weight_gms,
                sd.supplier_name,
                bec.material_value,
                bec.production_value,
                bec.packaging_value,
                bec.logistic_value,
                bec.waste_value,
                bec.total_pcf_value
             FROM bom b
             LEFT JOIN bom_emission_calculation_engine bec
                 ON bec.bom_id = b.id AND bec.product_id IS NULL
             LEFT JOIN supplier_details sd
                 ON sd.sup_id = b.supplier_id
             WHERE b.bom_pcf_id = $1 AND b.is_bom_calculated = TRUE
             ORDER BY b.created_date ASC`,
            [bomPcfRequestId]
        );

        return compResult.rows.map((row: any): PerComponentPcfInput => {
            // weight_gms is the per-piece mass (total_weight_gms = qty × weight_gms).
            // The submodel declares 1 piece and the per-component emission rows are
            // per declared unit, so use the per-piece weight to stay consistent.
            const massGms =
                row.weight_gms != null
                    ? Number(row.weight_gms)
                    : row.total_weight_gms != null
                      ? Number(row.total_weight_gms)
                      : null;
            const productCode =
                row.material_number || row.bom_code || "COMPONENT";
            const componentName =
                row.component_name || `Component ${productCode}`;
            const componentCategory = row.component_category || "";
            const supplierName = row.supplier_name || "";

            const input: EnviraanPcfInput = {
                productCode,
                productName: componentName,
                productDescription: row.detail_description ?? componentName,
                productMassKg: massGms != null ? massGms / 1000 : undefined,
                productClassifications: componentCategory
                    ? [componentCategory]
                    : [],
                companyName,
                companyBpn,
                totalPcfValue: Number(row.total_pcf_value) || 0,
                materialValue: Number(row.material_value) || 0,
                productionValue: Number(row.production_value) || 0,
                packagingValue: Number(row.packaging_value) || 0,
                logisticValue: Number(row.logistic_value) || 0,
                wasteValue: Number(row.waste_value) || 0,
                geographyCountry: "IN",
                geographyCountrySubdivision: "IN-TG",
                referencePeriodStart: `${referenceYear}-01-01T00:00:00Z`,
                referencePeriodEnd: `${referenceYear}-12-31T23:59:59Z`,
                pcfScope: "Cradle-to-gate",
                primaryDataShare: 50,
                technologicalDQR: 2,
                geographicalDQR: 2,
                temporalDQR: 2,
                pcfVersion: 1,
                comment: `Component ${componentName} of Enviraan PCF request ${req.code}`,
            };

            return {
                bomId: row.bom_id,
                componentName,
                materialNumber: row.material_number || "",
                componentCategory,
                supplierName,
                input,
            };
        });
    });
}

function rowToPublication(row: any): QuintariPublication {
    return {
        id: row.id,
        bomPcfRequestId: row.bom_pcf_request_id,
        productCode: row.product_code,
        digitalTwinId: row.digital_twin_id,
        partTypeInformationSubmodelId: row.part_type_information_submodel_id,
        pcfSubmodelId: row.pcf_submodel_id,
        catenaXId: row.catena_x_id,
        pcfAspectVersion: row.pcf_aspect_version,
        pushedOverallPcf: row.pushed_overall_pcf != null ? Number(row.pushed_overall_pcf) : null,
        publishedAt: row.published_at,
        lastAnsweredAt: row.last_answered_at,
        answerCount: Number(row.answer_count) || 0,
    };
}

export async function findPublicationByBomPcfRequestId(
    bomPcfRequestId: string
): Promise<QuintariPublication | null> {
    return withClient(async (client) => {
        const result = await client.query(
            `SELECT * FROM quintari_published_pcfs WHERE bom_pcf_request_id = $1 LIMIT 1`,
            [bomPcfRequestId]
        );
        if (result.rows.length === 0) return null;
        return rowToPublication(result.rows[0]);
    });
}

export async function findPublicationByProductCode(
    productCode: string
): Promise<QuintariPublication | null> {
    return withClient(async (client) => {
        const result = await client.query(
            `SELECT * FROM quintari_published_pcfs
             WHERE product_code = $1
             ORDER BY published_at DESC
             LIMIT 1`,
            [productCode]
        );
        if (result.rows.length === 0) return null;
        return rowToPublication(result.rows[0]);
    });
}

export async function recordPublication(
    input: RecordPublicationInput
): Promise<QuintariPublication> {
    return withClient(async (client) => {
        const id = randomUUID();
        const result = await client.query(
            `
            INSERT INTO quintari_published_pcfs (
                id, bom_pcf_request_id, product_code, digital_twin_id,
                part_type_information_submodel_id, pcf_submodel_id,
                catena_x_id, pcf_aspect_version, pushed_overall_pcf
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (bom_pcf_request_id) DO UPDATE SET
                product_code = EXCLUDED.product_code,
                digital_twin_id = EXCLUDED.digital_twin_id,
                part_type_information_submodel_id = EXCLUDED.part_type_information_submodel_id,
                pcf_submodel_id = EXCLUDED.pcf_submodel_id,
                catena_x_id = EXCLUDED.catena_x_id,
                pcf_aspect_version = EXCLUDED.pcf_aspect_version,
                pushed_overall_pcf = EXCLUDED.pushed_overall_pcf,
                update_date = CURRENT_TIMESTAMP
            RETURNING *
            `,
            [
                id,
                input.bomPcfRequestId,
                input.productCode,
                input.digitalTwinId,
                input.partTypeInformationSubmodelId ?? null,
                input.pcfSubmodelId,
                input.catenaXId ?? null,
                "9.0.0",
                input.pushedOverallPcf ?? null,
            ]
        );
        return rowToPublication(result.rows[0]);
    });
}

export async function markPublicationAnswered(pcfSubmodelId: string): Promise<void> {
    await withClient(async (client) => {
        await client.query(
            `UPDATE quintari_published_pcfs
             SET last_answered_at = CURRENT_TIMESTAMP,
                 answer_count = answer_count + 1,
                 update_date = CURRENT_TIMESTAMP
             WHERE pcf_submodel_id = $1`,
            [pcfSubmodelId]
        );
    });
}
