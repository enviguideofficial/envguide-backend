// Questionnaire Service — DB read/write + validation for the 28-question form.
//
// One supplier_questionnaire_response per (bom_pcf_request_id, supplier_id).
// Save is an UPSERT inside a single transaction so partial child-row writes
// can never leave a half-saved response in the DB.
//
// Validation is split:
//   - validateForSave   → minimal: must have bom_pcf_request_id + supplier_id.
//                          Drafts are intentionally permissive — supplier fills
//                          the form across multiple sessions.
//   - validateForSubmit → strict: every [mandatory] field from the PDF must be
//                          present, conditional rules honoured (Q15 / Q18 / Q22).

import { ulid } from "ulid";
import { withClient } from "../util/database.js";

// ============================================================
// Types — the JSON shape the API accepts/returns
// ============================================================

export interface QuestionnaireInput {
    // Identity (for upsert)
    responseId?: string;
    bomPcfRequestId: string;
    supplierId: string;
    status?: "draft" | "submitted";

    // Q1
    companyName?: string;
    companyIdUrn?: string;

    // Q2
    productNameCompany?: string;
    productIdUrn?: string;
    productDescription?: string;
    productClassificationUrn?: string;

    // Q3
    declaredUnit?: string;
    declaredUnitAmount?: number;
    productMassPerDeclaredUnit?: number;

    // Q5
    referencePeriodStart?: string; // ISO date
    referencePeriodEnd?: string;
    validityPeriodStart?: string;
    validityPeriodEnd?: string;

    // Q6 + Q7
    retroOrProspectivePcfType?: string;
    systemBoundary?: string;

    // Q9
    coProductsPresent?: boolean;

    // Q15
    packagingEmissionsIncluded?: boolean;

    // Q18
    distributionStageIncluded?: boolean;

    // Q20 flat
    usesAgriculturalForestryLand?: boolean;
    landAreaHectares?: number;
    forestConvertedYN?: boolean;
    lucEmissionFactor?: number;

    // Q21
    crossSectoralStandards?: string;
    productOrSectorSpecificRules?: string;
    ipccGwpVersion?: "AR4" | "AR5" | "AR6";

    // Q22
    massBalancingUsed?: boolean;
    massBalancingCertificateScheme?: string;
    freeAttributionInMassBalancing?: boolean;

    // Q23
    allocationRulesDescription?: string;
    allocationRecycledCarbon?: string;
    allocationWasteIncineration?: string;

    // Q24
    boundaryProcessesDescription?: string;
    ccsCo2CaptureIncluded?: boolean;
    exemptedEmissionsDescription?: string;
    exemptedEmissionsPercent?: number;

    // Q25
    primaryDataSharePct?: number;
    secondaryEfSources?: string;
    dataCollectedYear?: number;
    technologicalDqr?: number;
    temporalDqr?: number;
    geographicalDqr?: number;

    // Q26
    isProductCertified?: boolean;
    certificationScheme?: string;
    certificateNumber?: string;
    certificateValidFrom?: string;
    certificateValidTo?: string;
    isPcfVerified?: boolean;
    attestationType?: string;
    attestationConformantStandards?: string;
    attestationSchemeStandard?: string;
    attestationOfConformanceId?: string;
    attestationProviderName?: string;
    attestationProviderId?: string;
    attestationLink?: string;
    attestationCompletedAt?: string;

    // Q27
    totalProductionVolume?: number;
    certifiedVolume?: number;
    verifiedVolume1stParty?: number;
    verifiedVolume2ndParty?: number;
    verifiedVolume3rdParty?: number;
    totalProductVolume?: number;

    // Q10 electricity factory-allocation inputs (per-unit production electricity
    // = (component_weight / factory_weight) × factory_energy / num_products).
    factoryTotalEnergyKwh?: number;
    factoryTotalWeightKg?: number;
    componentTotalWeightKg?: number;
    componentNumProducts?: number;

    // Q28
    comments?: string;

    // Raw V3 form snapshot — the exact form state the supplier had, stored
    // verbatim so the form can reload it losslessly (no reverse mapping needed).
    formSnapshot?: any;

    // Child arrays
    sites?: SiteRow[];
    bom?: BomRow[];
    coProducts?: CoProductRow[];
    // Q8b — process consumable materials (auxiliaries) used in production, not in
    // the BOM. Emission = mass-allocated per component × EF, added to the total.
    processConsumables?: ProcessConsumableRow[];
    electricity?: ElectricityRow[];
    // Q10a (per-product factory weight) + Q10b (per-product units). Summed Q10a
    // = factory total weight (allocation denominator); Q10b = units per product.
    factoryProductWeights?: FactoryProductWeightRow[];
    factoryProductUnits?: FactoryProductUnitRow[];
    fuels?: FuelRow[];
    processGases?: ProcessGasRow[];
    qcItEnergy?: QcItRow[];
    productionWaste?: WasteRow[];
    packagingMaterials?: PackagingMaterialRow[];
    packagingTransport?: PackagingTransportRow[];
    packagingWaste?: PackagingWasteRow[];
    transportLegs?: TransportLegRow[];
    biomass?: BiomassRow[];
}

export interface SiteRow { siteName?: string; siteAddress?: string; region?: string; country?: string; countrySubdivision?: string; isPrimary?: boolean; notes?: string; }
export interface BomRow { productIdOrMpn?: string; componentName?: string; material?: string; subCategory?: string; materialGroup?: string; specificType?: string; process?: string; massPct?: number; carbonPct?: number; biogenicYN?: boolean; biogenicCarbonPct?: number; recycledYN?: boolean; recycledCarbonPct?: number; }
export interface CoProductRow { mpn?: string; componentName?: string; coProductName?: string; coProductPrice?: number; priceCurrency?: string; isPrimaryProduct?: boolean; }
export interface ElectricityRow { electricityType?: string; generatorType?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; geography?: string; quantity?: number; unit?: string; renewablePct?: number; renewableSourcing?: string; infrastructureEmissionsIncluded?: boolean; }
export interface FactoryProductWeightRow { mpn?: string; totalWeightKg?: number; }
export interface FactoryProductUnitRow { mpn?: string; unitsProduced?: number; }
export interface ProcessConsumableRow { mpn?: string; consumableMaterial?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; totalQuantity?: number; unit?: string; }
export interface FuelRow { fuelCarrier?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; quantity?: number; unit?: string; biogenicYN?: boolean; }
export interface ProcessGasRow { directProcessGas?: string; quantity?: number; unit?: string; fossilOrBiogenic?: string; }
export interface QcItRow { item?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; geography?: string; value?: number; unit?: string; alreadyInQ10?: boolean; }
export interface WasteRow { productIdOrMpn?: string; componentName?: string; wasteType?: string; treatmentType?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; quantity?: number; unit?: string; energyRecovered?: boolean; polluterPaysApplied?: boolean; }
export interface PackagingMaterialRow { productIdOrMpn?: string; componentName?: string; packagingType?: string; processType?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; packagingWeight?: number; unit?: string; region?: string; country?: string; recycledPct?: number; carbonBiogenicPct?: number; }
export interface PackagingTransportRow { packagingProductIdOrMpn?: string; componentName?: string; transportMode?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; weight?: number; unit?: string; distanceKm?: number; }
export interface PackagingWasteRow { mpnCode?: string; componentName?: string; packagingWasteType?: string; treatmentType?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; quantity?: number; unit?: string; energyRecovered?: boolean; }
export interface TransportLegRow { productIdOrMpn?: string; componentName?: string; transportMode?: string; category?: string; subCategory?: string; materialGroup?: string; specificType?: string; source?: string; destination?: string; weight?: number; unit?: string; distanceKm?: number; lowCarbonFuel?: boolean; fuelCertificateRef?: string; }
export interface BiomassRow { biomassFeedstockType?: string; quantity?: number; unit?: string; biogenicCarbonContentPct?: number; }

export interface ValidationError {
    field: string;
    message: string;
}

export interface SaveResult {
    responseId: string;
    bomPcfRequestId: string;
    supplierId: string;
    status: string;
    updatedAt: string;
    warnings: ValidationError[];
}

// ============================================================
// Save (UPSERT in one transaction)
// ============================================================

// Q5 — reference period end completes one financial year from the start:
// end = start + 1 year − 1 day. The form derives this and sends it, but we
// derive it defensively here too so an end is always present when a start is.
// UTC arithmetic avoids DST/local-offset day shifts.
function deriveReferencePeriodEnd(start?: string): string | undefined {
    if (!start) return undefined;
    const d = new Date(start);
    if (isNaN(d.getTime())) return undefined;
    const end = new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
    end.setUTCDate(end.getUTCDate() - 1);
    return end.toISOString().slice(0, 10);
}

export async function saveQuestionnaire(input: QuestionnaireInput): Promise<SaveResult> {
    // Backfill the auto-derived reference end if the client didn't send one.
    if (!input.referencePeriodEnd && input.referencePeriodStart) {
        input.referencePeriodEnd = deriveReferencePeriodEnd(input.referencePeriodStart);
    }

    const errors = validateForSave(input);
    if (errors.length > 0) {
        throw new ValidationException(errors);
    }

    return withClient(async (client: any) => {
        await client.query("BEGIN");
        try {
            // NOTE: `let` not `const` — on an ON CONFLICT update the existing row
            // keeps its original id, so we must overwrite this with the id the DB
            // actually returns (RETURNING id) before touching child tables, or the
            // children get orphaned to a non-existent parent and submit 404s.
            let responseId = input.responseId ?? ulid();
            const now = new Date().toISOString();

            // Upsert main row.
            const mainRes = await client.query(
                `INSERT INTO supplier_questionnaire_response (
                    id, bom_pcf_request_id, supplier_id, status,
                    company_name, company_id_urn,
                    product_name_company, product_id_urn, product_description, product_classification_urn,
                    declared_unit, declared_unit_amount, product_mass_per_declared_unit,
                    reference_period_start, reference_period_end, validity_period_start, validity_period_end,
                    retro_or_prospective_pcf_type, system_boundary,
                    co_products_present, packaging_emissions_included, distribution_stage_included,
                    uses_agricultural_forestry_land, land_area_hectares, forest_converted_y_n, luc_emission_factor,
                    cross_sectoral_standards, product_or_sector_specific_rules, ipcc_gwp_version,
                    mass_balancing_used, mass_balancing_certificate_scheme, free_attribution_in_mass_balancing,
                    allocation_rules_description, allocation_recycled_carbon, allocation_waste_incineration,
                    boundary_processes_description, ccs_co2_capture_included,
                    exempted_emissions_description, exempted_emissions_percent,
                    primary_data_share_pct, secondary_ef_sources, data_collected_year,
                    technological_dqr, temporal_dqr, geographical_dqr,
                    is_product_certified, certification_scheme, certificate_number,
                    certificate_valid_from, certificate_valid_to,
                    is_pcf_verified, attestation_type, attestation_conformant_standards,
                    attestation_scheme_standard, attestation_of_conformance_id,
                    attestation_provider_name, attestation_provider_id, attestation_link, attestation_completed_at,
                    total_production_volume, certified_volume,
                    verified_volume_1st_party, verified_volume_2nd_party, verified_volume_3rd_party,
                    total_product_volume, comments,
                    factory_total_energy_kwh, factory_total_weight_kg,
                    component_total_weight_kg, component_num_products
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6,
                    $7, $8, $9, $10,
                    $11, $12, $13,
                    $14, $15, $16, $17,
                    $18, $19,
                    $20, $21, $22,
                    $23, $24, $25, $26,
                    $27, $28, $29,
                    $30, $31, $32,
                    $33, $34, $35,
                    $36, $37,
                    $38, $39,
                    $40, $41, $42,
                    $43, $44, $45,
                    $46, $47, $48,
                    $49, $50,
                    $51, $52, $53,
                    $54, $55,
                    $56, $57, $58, $59,
                    $60, $61,
                    $62, $63, $64,
                    $65, $66,
                    $67, $68, $69, $70
                )
                ON CONFLICT (bom_pcf_request_id, supplier_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    company_name = EXCLUDED.company_name,
                    company_id_urn = EXCLUDED.company_id_urn,
                    product_name_company = EXCLUDED.product_name_company,
                    product_id_urn = EXCLUDED.product_id_urn,
                    product_description = EXCLUDED.product_description,
                    product_classification_urn = EXCLUDED.product_classification_urn,
                    declared_unit = EXCLUDED.declared_unit,
                    declared_unit_amount = EXCLUDED.declared_unit_amount,
                    product_mass_per_declared_unit = EXCLUDED.product_mass_per_declared_unit,
                    reference_period_start = EXCLUDED.reference_period_start,
                    reference_period_end = EXCLUDED.reference_period_end,
                    validity_period_start = EXCLUDED.validity_period_start,
                    validity_period_end = EXCLUDED.validity_period_end,
                    retro_or_prospective_pcf_type = EXCLUDED.retro_or_prospective_pcf_type,
                    system_boundary = EXCLUDED.system_boundary,
                    co_products_present = EXCLUDED.co_products_present,
                    packaging_emissions_included = EXCLUDED.packaging_emissions_included,
                    distribution_stage_included = EXCLUDED.distribution_stage_included,
                    uses_agricultural_forestry_land = EXCLUDED.uses_agricultural_forestry_land,
                    land_area_hectares = EXCLUDED.land_area_hectares,
                    forest_converted_y_n = EXCLUDED.forest_converted_y_n,
                    luc_emission_factor = EXCLUDED.luc_emission_factor,
                    cross_sectoral_standards = EXCLUDED.cross_sectoral_standards,
                    product_or_sector_specific_rules = EXCLUDED.product_or_sector_specific_rules,
                    ipcc_gwp_version = EXCLUDED.ipcc_gwp_version,
                    mass_balancing_used = EXCLUDED.mass_balancing_used,
                    mass_balancing_certificate_scheme = EXCLUDED.mass_balancing_certificate_scheme,
                    free_attribution_in_mass_balancing = EXCLUDED.free_attribution_in_mass_balancing,
                    allocation_rules_description = EXCLUDED.allocation_rules_description,
                    allocation_recycled_carbon = EXCLUDED.allocation_recycled_carbon,
                    allocation_waste_incineration = EXCLUDED.allocation_waste_incineration,
                    boundary_processes_description = EXCLUDED.boundary_processes_description,
                    ccs_co2_capture_included = EXCLUDED.ccs_co2_capture_included,
                    exempted_emissions_description = EXCLUDED.exempted_emissions_description,
                    exempted_emissions_percent = EXCLUDED.exempted_emissions_percent,
                    primary_data_share_pct = EXCLUDED.primary_data_share_pct,
                    secondary_ef_sources = EXCLUDED.secondary_ef_sources,
                    data_collected_year = EXCLUDED.data_collected_year,
                    technological_dqr = EXCLUDED.technological_dqr,
                    temporal_dqr = EXCLUDED.temporal_dqr,
                    geographical_dqr = EXCLUDED.geographical_dqr,
                    is_product_certified = EXCLUDED.is_product_certified,
                    certification_scheme = EXCLUDED.certification_scheme,
                    certificate_number = EXCLUDED.certificate_number,
                    certificate_valid_from = EXCLUDED.certificate_valid_from,
                    certificate_valid_to = EXCLUDED.certificate_valid_to,
                    is_pcf_verified = EXCLUDED.is_pcf_verified,
                    attestation_type = EXCLUDED.attestation_type,
                    attestation_conformant_standards = EXCLUDED.attestation_conformant_standards,
                    attestation_scheme_standard = EXCLUDED.attestation_scheme_standard,
                    attestation_of_conformance_id = EXCLUDED.attestation_of_conformance_id,
                    attestation_provider_name = EXCLUDED.attestation_provider_name,
                    attestation_provider_id = EXCLUDED.attestation_provider_id,
                    attestation_link = EXCLUDED.attestation_link,
                    attestation_completed_at = EXCLUDED.attestation_completed_at,
                    total_production_volume = EXCLUDED.total_production_volume,
                    certified_volume = EXCLUDED.certified_volume,
                    verified_volume_1st_party = EXCLUDED.verified_volume_1st_party,
                    verified_volume_2nd_party = EXCLUDED.verified_volume_2nd_party,
                    verified_volume_3rd_party = EXCLUDED.verified_volume_3rd_party,
                    total_product_volume = EXCLUDED.total_product_volume,
                    comments = EXCLUDED.comments,
                    factory_total_energy_kwh = EXCLUDED.factory_total_energy_kwh,
                    factory_total_weight_kg = EXCLUDED.factory_total_weight_kg,
                    component_total_weight_kg = EXCLUDED.component_total_weight_kg,
                    component_num_products = EXCLUDED.component_num_products,
                    update_date = CURRENT_TIMESTAMP
                RETURNING id`,
                [
                    responseId, input.bomPcfRequestId, input.supplierId, input.status ?? "draft",
                    input.companyName ?? null, input.companyIdUrn ?? null,
                    input.productNameCompany ?? null, input.productIdUrn ?? null, input.productDescription ?? null, input.productClassificationUrn ?? null,
                    input.declaredUnit ?? null, input.declaredUnitAmount ?? null, input.productMassPerDeclaredUnit ?? null,
                    input.referencePeriodStart ?? null, input.referencePeriodEnd ?? null, input.validityPeriodStart ?? null, input.validityPeriodEnd ?? null,
                    input.retroOrProspectivePcfType ?? null, input.systemBoundary ?? "cradle-to-gate",
                    input.coProductsPresent ?? false, input.packagingEmissionsIncluded ?? true, input.distributionStageIncluded ?? false,
                    input.usesAgriculturalForestryLand ?? null, input.landAreaHectares ?? null, input.forestConvertedYN ?? null, input.lucEmissionFactor ?? null,
                    input.crossSectoralStandards ?? null, input.productOrSectorSpecificRules ?? null, input.ipccGwpVersion ?? "AR6",
                    input.massBalancingUsed ?? false, input.massBalancingCertificateScheme ?? null, input.freeAttributionInMassBalancing ?? null,
                    input.allocationRulesDescription ?? null, input.allocationRecycledCarbon ?? "cut-off", input.allocationWasteIncineration ?? "polluter pays principle",
                    input.boundaryProcessesDescription ?? null, input.ccsCo2CaptureIncluded ?? false,
                    input.exemptedEmissionsDescription ?? null, input.exemptedEmissionsPercent ?? 0,
                    input.primaryDataSharePct ?? null, input.secondaryEfSources ?? null, input.dataCollectedYear ?? null,
                    input.technologicalDqr ?? null, input.temporalDqr ?? null, input.geographicalDqr ?? null,
                    input.isProductCertified ?? null, input.certificationScheme ?? null, input.certificateNumber ?? null,
                    input.certificateValidFrom ?? null, input.certificateValidTo ?? null,
                    input.isPcfVerified ?? null, input.attestationType ?? null, input.attestationConformantStandards ?? null,
                    input.attestationSchemeStandard ?? null, input.attestationOfConformanceId ?? null,
                    input.attestationProviderName ?? null, input.attestationProviderId ?? null, input.attestationLink ?? null, input.attestationCompletedAt ?? null,
                    input.totalProductionVolume ?? null, input.certifiedVolume ?? null,
                    input.verifiedVolume1stParty ?? null, input.verifiedVolume2ndParty ?? null, input.verifiedVolume3rdParty ?? null,
                    input.totalProductVolume ?? null, input.comments ?? null,
                    input.factoryTotalEnergyKwh ?? null, input.factoryTotalWeightKg ?? null,
                    input.componentTotalWeightKg ?? null, input.componentNumProducts ?? null,
                ]
            );

            // Use the id the DB actually persisted. On a conflict (same
            // bom_pcf_request_id + supplier_id) the existing row's id is kept, so
            // the locally-generated ulid above may differ from reality. Children
            // and the returned id must use this, not the generated one.
            responseId = mainRes.rows[0].id;

            // Store the raw V3 form snapshot so the form can reload losslessly.
            if (input.formSnapshot !== undefined) {
                await client.query(
                    `UPDATE supplier_questionnaire_response SET form_snapshot = $1 WHERE id = $2`,
                    [JSON.stringify(input.formSnapshot), responseId]
                );
            }

            // Wipe child tables for this response and re-insert.
            // Simple, correct, and matches frontend behaviour ("save whole form").
            await replaceChildTable(client, "sq_q4_sites", responseId, input.sites ?? [], (row, i) => [
                row.siteName ?? null, row.siteAddress ?? null, row.region ?? null, row.country ?? null, row.countrySubdivision ?? null, row.isPrimary ?? false, row.notes ?? null, i,
            ], [
                "site_name", "site_address", "region", "country", "country_subdivision", "is_primary", "notes", "row_order",
            ]);

            await replaceChildTable(client, "sq_q8_bom", responseId, input.bom ?? [], (row, i) => [
                row.productIdOrMpn ?? null, row.componentName ?? null, row.material ?? null, row.process ?? null,
                row.massPct ?? null, row.carbonPct ?? null, row.biogenicYN ?? null, row.biogenicCarbonPct ?? null,
                row.recycledYN ?? null, row.recycledCarbonPct ?? null,
                row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null, i,
            ], [
                "product_id_or_mpn", "component_name", "material", "process",
                "mass_pct", "carbon_pct", "biogenic_y_n", "biogenic_carbon_pct",
                "recycled_y_n", "recycled_carbon_pct",
                "sub_category", "group_name", "specific_type", "row_order",
            ]);

            await replaceChildTable(client, "sq_q9a_coproducts", responseId, input.coProducts ?? [], (row, i) => [
                row.mpn ?? null, row.componentName ?? null, row.coProductName ?? null, row.coProductPrice ?? null,
                row.priceCurrency ?? null, row.isPrimaryProduct ?? false, i,
            ], [
                "mpn", "component_name", "co_product_name", "co_product_price",
                "price_currency", "is_primary_product", "row_order",
            ]);

            await replaceChildTable(client, "sq_q10_electricity", responseId, input.electricity ?? [], (row, i) => [
                row.electricityType ?? null, row.generatorType ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.geography ?? null,
                row.quantity ?? null, row.unit ?? null,
                row.renewablePct ?? null, row.renewableSourcing ?? null, row.infrastructureEmissionsIncluded ?? null, i,
            ], [
                "electricity_type", "generator_type",
                "category", "sub_category", "group_name", "specific_type",
                "geography",
                "quantity", "unit",
                "renewable_pct", "renewable_sourcing", "infrastructure_emissions_included", "row_order",
            ]);

            // Q10a — per-product total weight produced at the factory (summed →
            // allocation denominator). Q10b — units produced per product.
            await replaceChildTable(client, "sq_q10a_factory_weights", responseId, input.factoryProductWeights ?? [], (row, i) => [
                row.mpn ?? null, row.totalWeightKg ?? null, i,
            ], ["mpn", "total_weight_kg", "row_order"]);

            await replaceChildTable(client, "sq_q10b_factory_units", responseId, input.factoryProductUnits ?? [], (row, i) => [
                row.mpn ?? null, row.unitsProduced ?? null, i,
            ], ["mpn", "units_produced", "row_order"]);

            // Q8b — process consumable materials (auxiliaries).
            await replaceChildTable(client, "sq_q8b_process_consumables", responseId, input.processConsumables ?? [], (row, i) => [
                row.mpn ?? null, row.consumableMaterial ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.totalQuantity ?? null, row.unit ?? null, i,
            ], [
                "mpn", "consumable_material",
                "category", "sub_category", "group_name", "specific_type",
                "total_quantity", "unit", "row_order",
            ]);

            await replaceChildTable(client, "sq_q11_fuels", responseId, input.fuels ?? [], (row, i) => [
                row.fuelCarrier ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.quantity ?? null, row.unit ?? null, row.biogenicYN ?? null, i,
            ], ["fuel_carrier", "category", "sub_category", "group_name", "specific_type", "quantity", "unit", "biogenic_y_n", "row_order"]);

            await replaceChildTable(client, "sq_q12_process_gases", responseId, input.processGases ?? [], (row, i) => [
                row.directProcessGas ?? null, row.quantity ?? null, row.unit ?? null, row.fossilOrBiogenic ?? null, i,
            ], ["direct_process_gas", "quantity", "unit", "fossil_or_biogenic", "row_order"]);

            await replaceChildTable(client, "sq_q13_qc_it_energy", responseId, input.qcItEnergy ?? [], (row, i) => [
                row.item ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.geography ?? null,
                row.value ?? null, row.unit ?? null, row.alreadyInQ10 ?? false, i,
            ], ["item", "category", "sub_category", "group_name", "specific_type", "geography", "value", "unit", "already_in_q10", "row_order"]);

            await replaceChildTable(client, "sq_q14_production_waste", responseId, input.productionWaste ?? [], (row, i) => [
                row.productIdOrMpn ?? null, row.componentName ?? null, row.wasteType ?? null, row.treatmentType ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.quantity ?? null, row.unit ?? null, row.energyRecovered ?? null, row.polluterPaysApplied ?? null, i,
            ], [
                "product_id_or_mpn", "component_name", "waste_type", "treatment_type",
                "category", "sub_category", "group_name", "specific_type",
                "quantity", "unit", "energy_recovered", "polluter_pays_applied", "row_order",
            ]);

            await replaceChildTable(client, "sq_q16_packaging_materials", responseId, input.packagingMaterials ?? [], (row, i) => [
                row.productIdOrMpn ?? null, row.componentName ?? null, row.packagingType ?? null, row.processType ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.packagingWeight ?? null, row.unit ?? null, row.region ?? null, row.country ?? null,
                row.recycledPct ?? null, row.carbonBiogenicPct ?? null, i,
            ], [
                "product_id_or_mpn", "component_name", "packaging_type", "process_type",
                "category", "sub_category", "group_name", "specific_type",
                "packaging_weight", "unit", "region", "country",
                "recycled_pct", "carbon_biogenic_pct", "row_order",
            ]);

            await replaceChildTable(client, "sq_q16a_packaging_transport", responseId, input.packagingTransport ?? [], (row, i) => [
                row.packagingProductIdOrMpn ?? null, row.componentName ?? null, row.transportMode ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.weight ?? null, row.unit ?? null, row.distanceKm ?? null, i,
            ], [
                "packaging_product_id_or_mpn", "component_name", "transport_mode",
                "category", "sub_category", "group_name", "specific_type",
                "weight", "unit", "distance_km", "row_order",
            ]);

            await replaceChildTable(client, "sq_q17_packaging_waste", responseId, input.packagingWaste ?? [], (row, i) => [
                row.mpnCode ?? null, row.componentName ?? null, row.packagingWasteType ?? null, row.treatmentType ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.quantity ?? null, row.unit ?? null, row.energyRecovered ?? null, i,
            ], [
                "mpn_code", "component_name", "packaging_waste_type", "treatment_type",
                "category", "sub_category", "group_name", "specific_type",
                "quantity", "unit", "energy_recovered", "row_order",
            ]);

            await replaceChildTable(client, "sq_q19_transport_legs", responseId, input.transportLegs ?? [], (row, i) => [
                row.productIdOrMpn ?? null, row.componentName ?? null, row.transportMode ?? null, row.source ?? null, row.destination ?? null,
                row.category ?? null, row.subCategory ?? null, row.materialGroup ?? null, row.specificType ?? null,
                row.weight ?? null, row.unit ?? null, row.distanceKm ?? null, row.lowCarbonFuel ?? null, row.fuelCertificateRef ?? null, i,
            ], [
                "product_id_or_mpn", "component_name", "transport_mode", "source", "destination",
                "category", "sub_category", "group_name", "specific_type",
                "weight", "unit", "distance_km", "low_carbon_fuel", "fuel_certificate_ref", "row_order",
            ]);

            await replaceChildTable(client, "sq_q20_biomass_feedstock", responseId, input.biomass ?? [], (row, i) => [
                row.biomassFeedstockType ?? null, row.quantity ?? null, row.unit ?? null, row.biogenicCarbonContentPct ?? null, i,
            ], [
                "biomass_feedstock_type", "quantity", "unit", "biogenic_carbon_content_pct", "row_order",
            ]);

            await client.query("COMMIT");

            return {
                responseId,
                bomPcfRequestId: input.bomPcfRequestId,
                supplierId: input.supplierId,
                status: input.status ?? "draft",
                updatedAt: now,
                warnings: [],
            };
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
    });
}

async function replaceChildTable(
    client: any,
    table: string,
    responseId: string,
    rows: any[],
    valueExtractor: (row: any, i: number) => any[],
    columns: string[]
): Promise<void> {
    await client.query(`DELETE FROM ${table} WHERE response_id = $1`, [responseId]);
    if (rows.length === 0) return;

    for (let i = 0; i < rows.length; i++) {
        const values = valueExtractor(rows[i], i);
        const allColumns = ["id", "response_id", ...columns];
        const placeholders = allColumns.map((_, idx) => `$${idx + 1}`).join(", ");
        await client.query(
            `INSERT INTO ${table} (${allColumns.join(", ")}) VALUES (${placeholders})`,
            [ulid(), responseId, ...values]
        );
    }
}

// ============================================================
// Load
// ============================================================

export async function loadQuestionnaire(responseId: string): Promise<QuestionnaireInput | null> {
    return withClient(async (client: any) => {
        const main = (
            await client.query(
                `SELECT * FROM supplier_questionnaire_response WHERE id = $1`,
                [responseId]
            )
        ).rows[0];
        if (!main) return null;

        const loadChild = async (table: string): Promise<any[]> =>
            (
                await client.query(
                    `SELECT * FROM ${table} WHERE response_id = $1 ORDER BY row_order`,
                    [responseId]
                )
            ).rows;

        return {
            responseId: main.id,
            bomPcfRequestId: main.bom_pcf_request_id,
            supplierId: main.supplier_id,
            status: main.status,
            formSnapshot: main.form_snapshot ?? null,
            companyName: main.company_name,
            companyIdUrn: main.company_id_urn,
            productNameCompany: main.product_name_company,
            productIdUrn: main.product_id_urn,
            productDescription: main.product_description,
            productClassificationUrn: main.product_classification_urn,
            declaredUnit: main.declared_unit,
            declaredUnitAmount: numOrUndef(main.declared_unit_amount),
            productMassPerDeclaredUnit: numOrUndef(main.product_mass_per_declared_unit),
            referencePeriodStart: dateOrUndef(main.reference_period_start),
            referencePeriodEnd: dateOrUndef(main.reference_period_end),
            validityPeriodStart: dateOrUndef(main.validity_period_start),
            validityPeriodEnd: dateOrUndef(main.validity_period_end),
            retroOrProspectivePcfType: main.retro_or_prospective_pcf_type,
            systemBoundary: main.system_boundary,
            coProductsPresent: main.co_products_present,
            packagingEmissionsIncluded: main.packaging_emissions_included,
            distributionStageIncluded: main.distribution_stage_included,
            usesAgriculturalForestryLand: main.uses_agricultural_forestry_land,
            landAreaHectares: numOrUndef(main.land_area_hectares),
            forestConvertedYN: main.forest_converted_y_n,
            lucEmissionFactor: numOrUndef(main.luc_emission_factor),
            crossSectoralStandards: main.cross_sectoral_standards,
            productOrSectorSpecificRules: main.product_or_sector_specific_rules,
            ipccGwpVersion: main.ipcc_gwp_version,
            massBalancingUsed: main.mass_balancing_used,
            massBalancingCertificateScheme: main.mass_balancing_certificate_scheme,
            freeAttributionInMassBalancing: main.free_attribution_in_mass_balancing,
            allocationRulesDescription: main.allocation_rules_description,
            allocationRecycledCarbon: main.allocation_recycled_carbon,
            allocationWasteIncineration: main.allocation_waste_incineration,
            boundaryProcessesDescription: main.boundary_processes_description,
            ccsCo2CaptureIncluded: main.ccs_co2_capture_included,
            exemptedEmissionsDescription: main.exempted_emissions_description,
            exemptedEmissionsPercent: numOrUndef(main.exempted_emissions_percent),
            primaryDataSharePct: numOrUndef(main.primary_data_share_pct),
            secondaryEfSources: main.secondary_ef_sources,
            dataCollectedYear: numOrUndef(main.data_collected_year),
            technologicalDqr: numOrUndef(main.technological_dqr),
            temporalDqr: numOrUndef(main.temporal_dqr),
            geographicalDqr: numOrUndef(main.geographical_dqr),
            isProductCertified: main.is_product_certified,
            certificationScheme: main.certification_scheme,
            certificateNumber: main.certificate_number,
            certificateValidFrom: dateOrUndef(main.certificate_valid_from),
            certificateValidTo: dateOrUndef(main.certificate_valid_to),
            isPcfVerified: main.is_pcf_verified,
            attestationType: main.attestation_type,
            attestationConformantStandards: main.attestation_conformant_standards,
            attestationSchemeStandard: main.attestation_scheme_standard,
            attestationOfConformanceId: main.attestation_of_conformance_id,
            attestationProviderName: main.attestation_provider_name,
            attestationProviderId: main.attestation_provider_id,
            attestationLink: main.attestation_link,
            attestationCompletedAt: dateOrUndef(main.attestation_completed_at),
            totalProductionVolume: numOrUndef(main.total_production_volume),
            certifiedVolume: numOrUndef(main.certified_volume),
            verifiedVolume1stParty: numOrUndef(main.verified_volume_1st_party),
            verifiedVolume2ndParty: numOrUndef(main.verified_volume_2nd_party),
            verifiedVolume3rdParty: numOrUndef(main.verified_volume_3rd_party),
            totalProductVolume: numOrUndef(main.total_product_volume),
            factoryTotalEnergyKwh: numOrUndef(main.factory_total_energy_kwh),
            factoryTotalWeightKg: numOrUndef(main.factory_total_weight_kg),
            componentTotalWeightKg: numOrUndef(main.component_total_weight_kg),
            componentNumProducts: numOrUndef(main.component_num_products),
            comments: main.comments,

            sites: (await loadChild("sq_q4_sites")).map((r) => ({
                siteName: r.site_name, siteAddress: r.site_address, region: r.region,
                country: r.country, countrySubdivision: r.country_subdivision,
                isPrimary: r.is_primary, notes: r.notes,
            })),
            bom: (await loadChild("sq_q8_bom")).map((r) => ({
                productIdOrMpn: r.product_id_or_mpn, componentName: r.component_name,
                material: r.material, subCategory: r.sub_category,
                materialGroup: r.group_name, specificType: r.specific_type, process: r.process,
                massPct: numOrUndef(r.mass_pct), carbonPct: numOrUndef(r.carbon_pct),
                biogenicYN: r.biogenic_y_n, biogenicCarbonPct: numOrUndef(r.biogenic_carbon_pct),
                recycledYN: r.recycled_y_n, recycledCarbonPct: numOrUndef(r.recycled_carbon_pct),
            })),
            coProducts: (await loadChild("sq_q9a_coproducts")).map((r) => ({
                mpn: r.mpn, componentName: r.component_name, coProductName: r.co_product_name,
                coProductPrice: numOrUndef(r.co_product_price), priceCurrency: r.price_currency,
                isPrimaryProduct: r.is_primary_product,
            })),
            electricity: (await loadChild("sq_q10_electricity")).map((r) => ({
                electricityType: r.electricity_type, generatorType: r.generator_type,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                geography: r.geography,
                quantity: numOrUndef(r.quantity), unit: r.unit,
                renewablePct: numOrUndef(r.renewable_pct), renewableSourcing: r.renewable_sourcing,
                infrastructureEmissionsIncluded: r.infrastructure_emissions_included,
            })),
            factoryProductWeights: (await loadChild("sq_q10a_factory_weights")).map((r) => ({
                mpn: r.mpn, totalWeightKg: numOrUndef(r.total_weight_kg),
            })),
            factoryProductUnits: (await loadChild("sq_q10b_factory_units")).map((r) => ({
                mpn: r.mpn, unitsProduced: numOrUndef(r.units_produced),
            })),
            processConsumables: (await loadChild("sq_q8b_process_consumables")).map((r) => ({
                mpn: r.mpn, consumableMaterial: r.consumable_material,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                totalQuantity: numOrUndef(r.total_quantity), unit: r.unit,
            })),
            fuels: (await loadChild("sq_q11_fuels")).map((r) => ({
                fuelCarrier: r.fuel_carrier,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                quantity: numOrUndef(r.quantity),
                unit: r.unit, biogenicYN: r.biogenic_y_n,
            })),
            processGases: (await loadChild("sq_q12_process_gases")).map((r) => ({
                directProcessGas: r.direct_process_gas, quantity: numOrUndef(r.quantity),
                unit: r.unit, fossilOrBiogenic: r.fossil_or_biogenic,
            })),
            qcItEnergy: (await loadChild("sq_q13_qc_it_energy")).map((r) => ({
                item: r.item,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                geography: r.geography,
                value: numOrUndef(r.value), unit: r.unit, alreadyInQ10: r.already_in_q10,
            })),
            productionWaste: (await loadChild("sq_q14_production_waste")).map((r) => ({
                productIdOrMpn: r.product_id_or_mpn, componentName: r.component_name,
                wasteType: r.waste_type, treatmentType: r.treatment_type,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                quantity: numOrUndef(r.quantity), unit: r.unit,
                energyRecovered: r.energy_recovered, polluterPaysApplied: r.polluter_pays_applied,
            })),
            packagingMaterials: (await loadChild("sq_q16_packaging_materials")).map((r) => ({
                productIdOrMpn: r.product_id_or_mpn, componentName: r.component_name,
                packagingType: r.packaging_type, processType: r.process_type,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                packagingWeight: numOrUndef(r.packaging_weight), unit: r.unit,
                region: r.region, country: r.country,
                recycledPct: numOrUndef(r.recycled_pct),
                carbonBiogenicPct: numOrUndef(r.carbon_biogenic_pct),
            })),
            packagingTransport: (await loadChild("sq_q16a_packaging_transport")).map((r) => ({
                packagingProductIdOrMpn: r.packaging_product_id_or_mpn, componentName: r.component_name,
                transportMode: r.transport_mode,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                weight: numOrUndef(r.weight),
                unit: r.unit, distanceKm: numOrUndef(r.distance_km),
            })),
            packagingWaste: (await loadChild("sq_q17_packaging_waste")).map((r) => ({
                mpnCode: r.mpn_code, componentName: r.component_name,
                packagingWasteType: r.packaging_waste_type, treatmentType: r.treatment_type,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                quantity: numOrUndef(r.quantity), unit: r.unit, energyRecovered: r.energy_recovered,
            })),
            transportLegs: (await loadChild("sq_q19_transport_legs")).map((r) => ({
                productIdOrMpn: r.product_id_or_mpn, componentName: r.component_name,
                transportMode: r.transport_mode, source: r.source, destination: r.destination,
                category: r.category, subCategory: r.sub_category, materialGroup: r.group_name, specificType: r.specific_type,
                weight: numOrUndef(r.weight), unit: r.unit, distanceKm: numOrUndef(r.distance_km),
                lowCarbonFuel: r.low_carbon_fuel, fuelCertificateRef: r.fuel_certificate_ref,
            })),
            biomass: (await loadChild("sq_q20_biomass_feedstock")).map((r) => ({
                biomassFeedstockType: r.biomass_feedstock_type, quantity: numOrUndef(r.quantity),
                unit: r.unit, biogenicCarbonContentPct: numOrUndef(r.biogenic_carbon_content_pct),
            })),
        };
    });
}

// Find a supplier's own response (id + status + raw form snapshot) for a PCF
// request, so the form can reload exactly what they last saved/submitted.
export async function findMyResponse(
    bomPcfRequestId: string,
    supplierId: string
): Promise<{ responseId: string; status: string; formSnapshot: any } | null> {
    return withClient(async (client: any) => {
        const r = await client.query(
            `SELECT id, status, form_snapshot
               FROM supplier_questionnaire_response
              WHERE bom_pcf_request_id = $1 AND supplier_id = $2
              LIMIT 1`,
            [bomPcfRequestId, supplierId]
        );
        if (!r.rows.length) return null;
        return {
            responseId: r.rows[0].id,
            status: r.rows[0].status,
            formSnapshot: r.rows[0].form_snapshot ?? null,
        };
    });
}

export async function listByPcf(bomPcfRequestId: string): Promise<Array<{
    responseId: string; supplierId: string; status: string; submittedAt: string | null; updatedAt: string;
}>> {
    return withClient(async (client: any) => {
        const r = await client.query(
            `SELECT id, supplier_id, status, submitted_at, update_date
               FROM supplier_questionnaire_response
              WHERE bom_pcf_request_id = $1
              ORDER BY update_date DESC`,
            [bomPcfRequestId]
        );
        return r.rows.map((row: any) => ({
            responseId: row.id,
            supplierId: row.supplier_id,
            status: row.status,
            submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
            updatedAt: new Date(row.update_date).toISOString(),
        }));
    });
}

export async function markSubmitted(responseId: string): Promise<void> {
    await withClient(async (client: any) => {
        const r = await client.query(
            `UPDATE supplier_questionnaire_response
                SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, update_date = CURRENT_TIMESTAMP
              WHERE id = $1
              RETURNING bom_pcf_request_id, supplier_id`,
            [responseId]
        );
        if (r.rowCount === 0) throw new Error(`Response not found: ${responseId}`);

        // Bridge to the legacy PCF-request workflow: the stage tracker and DQR
        // page read pcf_request_data_collection_stage.is_submitted (keyed by
        // bom_pcf_id + sup_id), NOT supplier_questionnaire_response. Flip it here
        // so the request shows the supplier as submitted and advances to DQR.
        const { bom_pcf_request_id, supplier_id } = r.rows[0];
        if (bom_pcf_request_id && supplier_id) {
            await client.query(
                `UPDATE pcf_request_data_collection_stage
                    SET is_submitted = true, completed_date = NOW()
                  WHERE bom_pcf_id = $1 AND sup_id = $2`,
                [bom_pcf_request_id, supplier_id]
            );

            // Surface this supplier on the DQR page: that page lists suppliers
            // from supplier_general_info_questions (sgiq). V3 doesn't create an
            // sgiq row, so without this the submitted supplier never appears in
            // DQR. Create a minimal sgiq row (idempotent) carrying the company
            // name + reporting period from the V3 response.
            const exists = await client.query(
                `SELECT 1 FROM supplier_general_info_questions
                  WHERE bom_pcf_id = $1 AND sup_id = $2 LIMIT 1`,
                [bom_pcf_request_id, supplier_id]
            );
            if (exists.rowCount === 0) {
                const meta = await client.query(
                    `SELECT company_name, reference_period_start
                       FROM supplier_questionnaire_response WHERE id = $1`,
                    [responseId]
                );
                const orgName = meta.rows[0]?.company_name ?? null;
                const rp = meta.rows[0]?.reference_period_start;
                // pg returns timestamps as Date; pull the 4-digit year safely.
                const period = rp
                    ? (rp instanceof Date ? String(rp.getFullYear()) : String(rp).slice(0, 4))
                    : null;
                await client.query(
                    `INSERT INTO supplier_general_info_questions (
                        sgiq_id, bom_pcf_id, sup_id, organization_name,
                        annual_reporting_period, ere_acknowledge, repm_acknowledge,
                        dc_acknowledge, availability_of_scope_one_two_three_emissions_data
                     ) VALUES ($1, $2, $3, $4, $5, true, true, true, false)`,
                    [ulid(), bom_pcf_request_id, supplier_id, orgName, period]
                );
            }
        }
    });
}

// ============================================================
// Validation
// ============================================================

export class ValidationException extends Error {
    constructor(public errors: ValidationError[]) {
        super(`Validation failed: ${errors.map((e) => e.field).join(", ")}`);
    }
}

export function validateForSave(input: QuestionnaireInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!input.bomPcfRequestId) errors.push({ field: "bomPcfRequestId", message: "required" });
    if (!input.supplierId) errors.push({ field: "supplierId", message: "required" });
    return errors;
}

export function validateForSubmit(input: QuestionnaireInput): ValidationError[] {
    const errors: ValidationError[] = [];

    // Q1 mandatory
    if (!input.companyName) errors.push({ field: "companyName", message: "Q1 — company legal name is required" });
    if (!input.companyIdUrn) errors.push({ field: "companyIdUrn", message: "Q1 — company ID (BPN/DUNS/VAT/CIN) is required" });

    // Q2 mandatory
    if (!input.productNameCompany) errors.push({ field: "productNameCompany", message: "Q2 — product name is required" });
    if (!input.productIdUrn) errors.push({ field: "productIdUrn", message: "Q2 — product ID is required" });

    // Q3 mandatory
    if (!input.declaredUnit) errors.push({ field: "declaredUnit", message: "Q3 — declared unit is required" });
    if (input.declaredUnitAmount == null) errors.push({ field: "declaredUnitAmount", message: "Q3 — declared unit amount is required" });
    if (input.productMassPerDeclaredUnit == null) errors.push({ field: "productMassPerDeclaredUnit", message: "Q3 — product mass per declared unit is required" });

    // Q4 mandatory (at least one site, must have country + region)
    if (!input.sites || input.sites.length === 0) {
        errors.push({ field: "sites", message: "Q4 — at least one manufacturing site is required" });
    } else {
        const primary = input.sites.find((s) => s.isPrimary);
        if (!primary) errors.push({ field: "sites", message: "Q4 — one site must be marked as primary" });
        input.sites.forEach((s, i) => {
            if (!s.country) errors.push({ field: `sites[${i}].country`, message: "Q4 — site country is required" });
            if (!s.region) errors.push({ field: `sites[${i}].region`, message: "Q4 — site region is required" });
            if (!s.countrySubdivision) errors.push({ field: `sites[${i}].countrySubdivision`, message: "Q4 — country subdivision is required" });
        });
    }

    // Q5 mandatory — only the reference period is supplier-provided. The
    // reference end is auto-derived in the form (start + 1 year − 1 day).
    // Validity is no longer collected from the supplier; it is set at PCF
    // report generation (generation date → +1 year), so it is not required here.
    if (!input.referencePeriodStart) errors.push({ field: "referencePeriodStart", message: "Q5 — reference period start is required" });
    if (!input.referencePeriodEnd) errors.push({ field: "referencePeriodEnd", message: "Q5 — reference period end is required" });

    // Q6 + Q7 mandatory
    if (!input.retroOrProspectivePcfType) errors.push({ field: "retroOrProspectivePcfType", message: "Q6 — PCF type is required" });
    if (!input.systemBoundary) errors.push({ field: "systemBoundary", message: "Q7 — system boundary is required" });

    // Q8 mandatory
    if (!input.bom || input.bom.length === 0) {
        errors.push({ field: "bom", message: "Q8 — at least one BOM component is required" });
    } else {
        input.bom.forEach((b, i) => {
            // The Q8 cascade (category→sub→group→specific type) replaced the old
            // free-text "process" field. Require the category (stored in `material`)
            // and the specific type, since those pin the exact EF row.
            if (!b.material) errors.push({ field: `bom[${i}].material`, message: "Q8 — category required" });
            if (!b.specificType) errors.push({ field: `bom[${i}].specificType`, message: "Q8 — specific type required" });
            if (b.massPct == null) errors.push({ field: `bom[${i}].massPct`, message: "Q8 — mass % required" });
        });
    }

    // Q9 + Q9a conditional
    if (input.coProductsPresent && (!input.coProducts || input.coProducts.length === 0)) {
        errors.push({ field: "coProducts", message: "Q9a — co-products required when Q9 is Yes" });
    }

    // Q10 mandatory (at least one electricity row)
    if (!input.electricity || input.electricity.length === 0) {
        errors.push({ field: "electricity", message: "Q10 — at least one electricity entry is required" });
    }

    // Q14 mandatory
    if (!input.productionWaste || input.productionWaste.length === 0) {
        errors.push({ field: "productionWaste", message: "Q14 — at least one waste entry is required" });
    }

    // Q15 + (Q16, Q16a, Q17) conditional skip
    if (input.packagingEmissionsIncluded) {
        if (!input.packagingMaterials || input.packagingMaterials.length === 0) {
            errors.push({ field: "packagingMaterials", message: "Q16 — packaging materials required when Q15 = Yes" });
        }
        // Q16a (packaging transport) is optional: packaging may be sourced on-site
        // or its inbound transport may be negligible/unknown. Not all included
        // packaging has a separate transport leg, so we don't force a row here.
        if (!input.packagingWaste || input.packagingWaste.length === 0) {
            errors.push({ field: "packagingWaste", message: "Q17 — packaging waste required when Q15 = Yes" });
        }
    }

    // Q18 + Q19 conditional
    if (input.distributionStageIncluded && (!input.transportLegs || input.transportLegs.length === 0)) {
        errors.push({ field: "transportLegs", message: "Q19 — transport legs required when Q18 = Yes" });
    }

    // Q21 mandatory
    if (!input.crossSectoralStandards) errors.push({ field: "crossSectoralStandards", message: "Q21 — cross-sectoral standard is required" });
    if (!input.productOrSectorSpecificRules) errors.push({ field: "productOrSectorSpecificRules", message: "Q21 — product/sector PCR is required" });
    if (!input.ipccGwpVersion) errors.push({ field: "ipccGwpVersion", message: "Q21 — IPCC GWP version is required" });

    // Q22 conditional (Mif)
    if (input.massBalancingUsed === true) {
        if (!input.massBalancingCertificateScheme) errors.push({ field: "massBalancingCertificateScheme", message: "Q22 — certificate scheme required when mass balancing = true" });
        if (input.freeAttributionInMassBalancing == null) errors.push({ field: "freeAttributionInMassBalancing", message: "Q22 — free attribution flag required when mass balancing = true" });
    }

    // Q23 mandatory
    if (!input.allocationWasteIncineration) errors.push({ field: "allocationWasteIncineration", message: "Q23 — waste incineration method is required" });

    // Q24 mandatory
    if (input.ccsCo2CaptureIncluded == null) errors.push({ field: "ccsCo2CaptureIncluded", message: "Q24 — CCS/CCU flag is required" });
    if (!input.exemptedEmissionsDescription) errors.push({ field: "exemptedEmissionsDescription", message: "Q24 — excluded flows description is required" });

    // Q26 conditional + mandatory parts
    if (input.isPcfVerified === true) {
        if (!input.attestationType) errors.push({ field: "attestationType", message: "Q26 — attestation type required when verified" });
        if (!input.attestationConformantStandards) errors.push({ field: "attestationConformantStandards", message: "Q26 — conformant standards required when verified" });
        if (!input.attestationSchemeStandard) errors.push({ field: "attestationSchemeStandard", message: "Q26 — attestation scheme required when verified" });
        if (!input.attestationOfConformanceId) errors.push({ field: "attestationOfConformanceId", message: "Q26 — attestation ID required when verified" });
        if (!input.attestationProviderName) errors.push({ field: "attestationProviderName", message: "Q26 — issuer name required when verified" });
    }

    return errors;
}

// ============================================================
// Small helpers
// ============================================================

function numOrUndef(v: any): number | undefined {
    if (v == null) return undefined;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : undefined;
}

function dateOrUndef(v: any): string | undefined {
    if (!v) return undefined;
    try {
        const d = v instanceof Date ? v : new Date(v);
        return isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
        return undefined;
    }
}
