import {
    buildEnviraanPcfInputFromRequest,
    findPublicationByBomPcfRequestId,
    recordPublication,
} from "../repositories/pcfRequestRepository.js";
import { createProductTwin } from "./quintariDigitalTwinService.js";
import { addPcfSubmodel, deleteSubmodel } from "./quintariSubmodelService.js";
import { aggregateComputedDetail } from "./pcfSubmodelService.js";

export interface PublishResult {
    bomPcfRequestId: string;
    digitalTwinId: string;
    partTypeInformationSubmodelId: string;
    pcfSubmodelId: string;
    alreadyPublished: boolean;
}

export interface PublishOptions {
    force?: boolean;
}

/**
 * Build the publish input and attach the real computed detail. The request-level
 * builder only carries emission summary buckets, so without this the carbon-content
 * block AND the granular stage sub-fields (aircraft, biogenic uptake, land, …) fall
 * back to zeros. The real values live in pcf_computed_field (keyed by supplier
 * response) — aggregateComputedDetail sums them across the request's components.
 */
async function buildEnrichedPcfInput(bomPcfRequestId: string) {
    const input = await buildEnviraanPcfInputFromRequest(bomPcfRequestId);
    const detail = await aggregateComputedDetail(bomPcfRequestId);
    if (detail) {
        input.carbonContentDetail = detail.carbonContentDetail;
        input.productionStageDetail = detail.productionStageDetail;
        input.packagingStageDetail = detail.packagingStageDetail;
        input.distributionStageDetail = detail.distributionStageDetail;
    }
    return input;
}

export async function publishPcfRequestToQuintari(
    bomPcfRequestId: string,
    options: PublishOptions = {}
): Promise<PublishResult> {
    if (!options.force) {
        const existing = await findPublicationByBomPcfRequestId(bomPcfRequestId);
        if (existing) {
            return {
                bomPcfRequestId,
                digitalTwinId: existing.digitalTwinId,
                partTypeInformationSubmodelId:
                    existing.partTypeInformationSubmodelId ?? "",
                pcfSubmodelId: existing.pcfSubmodelId,
                alreadyPublished: true,
            };
        }
    }

    const input = await buildEnrichedPcfInput(bomPcfRequestId);

    const twin = await createProductTwin({
        manufacturerId: input.companyBpn,
        manufacturerPartId: input.productCode,
        nameAtManufacturer: input.productName,
        productDescription: input.productDescription,
    });

    const submodel = await addPcfSubmodel(twin.digitalTwinId, input);

    const partTypeInformationSubmodelId = twin.submodelIds[0]?.submodelId ?? "";
    const catenaXId = twin.submodelIds[0]?.catenaXId ?? null;

    await recordPublication({
        bomPcfRequestId,
        productCode: input.productCode,
        digitalTwinId: twin.digitalTwinId,
        partTypeInformationSubmodelId,
        pcfSubmodelId: submodel.submodelId,
        catenaXId,
        pushedOverallPcf: input.totalPcfValue,
    });

    return {
        bomPcfRequestId,
        digitalTwinId: twin.digitalTwinId,
        partTypeInformationSubmodelId,
        pcfSubmodelId: submodel.submodelId,
        alreadyPublished: false,
    };
}

/**
 * Refresh an ALREADY-published request's PCF data on its EXISTING twin. Quintari
 * has no submodel-update endpoint, so we delete the stale PCF submodel and add the
 * corrected one to the same digital twin (identity/part-type submodel untouched,
 * no duplicate twin). Falls back to a first-time publish if never published.
 */
export async function republishPcfRequestToQuintari(
    bomPcfRequestId: string
): Promise<PublishResult> {
    const existing = await findPublicationByBomPcfRequestId(bomPcfRequestId);
    if (!existing) {
        return publishPcfRequestToQuintari(bomPcfRequestId);
    }

    const input = await buildEnrichedPcfInput(bomPcfRequestId);

    // Delete the stale PCF submodel (tolerate it being already gone), then re-add
    // the corrected one to the SAME twin.
    if (existing.pcfSubmodelId) {
        try {
            await deleteSubmodel(existing.pcfSubmodelId);
        } catch {
            // already deleted / not found — proceed to re-add
        }
    }

    const submodel = await addPcfSubmodel(existing.digitalTwinId, input);

    await recordPublication({
        bomPcfRequestId,
        productCode: input.productCode,
        digitalTwinId: existing.digitalTwinId,
        partTypeInformationSubmodelId: existing.partTypeInformationSubmodelId ?? "",
        pcfSubmodelId: submodel.submodelId,
        catenaXId: existing.catenaXId ?? null,
        pushedOverallPcf: input.totalPcfValue,
    });

    return {
        bomPcfRequestId,
        digitalTwinId: existing.digitalTwinId,
        partTypeInformationSubmodelId: existing.partTypeInformationSubmodelId ?? "",
        pcfSubmodelId: submodel.submodelId,
        alreadyPublished: false,
    };
}
