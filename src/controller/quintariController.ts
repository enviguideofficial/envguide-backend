import { withClient } from "../util/database.js";
import { generateResponse } from "../util/genRes.js";
import { publishPcfRequestToQuintari } from "../services/quintariPublishService.js";
import {
    findPublicationByBomPcfRequestId,
    buildEnviraanPcfInputFromRequest,
    buildEnviraanPcfInputsPerComponentFromRequest,
} from "../repositories/pcfRequestRepository.js";
import {
    buildPcfV9Payload,
    PCF_V9_SEMANTIC_ID,
    PCF_V9_SPEC_VERSION,
} from "../util/buildPcfV9Payload.js";
import {
    buildSubmodelsPerComponent,
    buildAggregateSubmodel,
} from "../services/pcfSubmodelService.js";

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

export async function publishPcfToQuintari(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        if (!(await isSuperAdmin(req.user_id))) {
            return res.status(403).send(generateResponse(false, "super admin only", 403, null));
        }

        const bomPcfRequestId = req.params.bomPcfRequestId || req.body?.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }

        const force = req.body?.force === true || req.query?.force === "true";
        console.log(
            `[quintari-publish] user=${req.user_id} bomPcfRequestId=${bomPcfRequestId} force=${force}`
        );
        const result = await publishPcfRequestToQuintari(bomPcfRequestId, { force });

        const message = result.alreadyPublished
            ? "PCF already published to Quintari"
            : "PCF published to Quintari";
        console.log(
            `[quintari-publish] ${result.alreadyPublished ? "ALREADY-PUBLISHED" : "PUBLISHED"} ` +
                `twin=${result.digitalTwinId} pcfSubmodel=${result.pcfSubmodelId}`
        );
        return res.status(200).send(generateResponse(true, message, 200, result));
    } catch (error: any) {
        console.error("publishPcfToQuintari error:", error);
        const msg = error?.response?.data
            ? `Quintari error: ${JSON.stringify(error.response.data)}`
            : (error?.message || "publish failed");
        return res.status(500).send(generateResponse(false, msg, 500, null));
    }
}

/**
 * Read-only preview of the assembled Catena-X PCF submodel for a request.
 * Returns the exact JSON that would be published to Quintari — used by the
 * frontend "Catena-X Semantic PCF Data Model" section to show real values
 * next to each field. No side effects (does not publish or persist).
 */
export async function getPcfSubmodelPreview(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }
        const input = await buildEnviraanPcfInputFromRequest(bomPcfRequestId);
        const submodel = buildPcfV9Payload(input);
        return res.status(200).send(
            generateResponse(true, "ok", 200, {
                semanticId: PCF_V9_SEMANTIC_ID,
                specVersion: PCF_V9_SPEC_VERSION,
                submodel,
            })
        );
    } catch (error: any) {
        console.error("getPcfSubmodelPreview error:", error);
        return res
            .status(500)
            .send(generateResponse(false, error?.message || "submodel preview failed", 500, null));
    }
}

/**
 * Read-only preview of the Catena-X PCF submodel for EACH calculated BOM
 * component of a request (in addition to the product-level aggregate exposed by
 * getPcfSubmodelPreview). Returns one submodel per component so the frontend can
 * show a per-component overview. No side effects.
 */
export async function getPcfSubmodelsPreviewPerComponent(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }
        const inputs = await buildEnviraanPcfInputsPerComponentFromRequest(bomPcfRequestId);
        const components = inputs.map((c) => ({
            bomId: c.bomId,
            componentName: c.componentName,
            materialNumber: c.materialNumber,
            componentCategory: c.componentCategory,
            supplierName: c.supplierName,
            semanticId: PCF_V9_SEMANTIC_ID,
            specVersion: PCF_V9_SPEC_VERSION,
            submodel: buildPcfV9Payload(c.input),
        }));
        return res.status(200).send(generateResponse(true, "ok", 200, { components }));
    } catch (error: any) {
        console.error("getPcfSubmodelsPreviewPerComponent error:", error);
        return res
            .status(500)
            .send(generateResponse(false, error?.message || "per-component submodel preview failed", 500, null));
    }
}

export async function getQuintariPublicationStatus(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }
        const existing = await findPublicationByBomPcfRequestId(bomPcfRequestId);
        return res
            .status(200)
            .send(generateResponse(true, "ok", 200, { published: !!existing, publication: existing ?? null }));
    } catch (error: any) {
        console.error("getQuintariPublicationStatus error:", error);
        return res.status(500).send(generateResponse(false, error?.message || "status failed", 500, null));
    }
}

// Read-only preview of the aggregate (product-level) Catena-X PCF submodel for a
// request — the same JSON that would be published to Quintari. Used by the
// "Catena-X Semantic PCF Data Model" section. No side effects.
export async function getQuintariPcfSubmodel(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }
        const agg = await buildAggregateSubmodel(bomPcfRequestId);
        if (!agg) {
            return res
                .status(404)
                .send(
                    generateResponse(
                        false,
                        "no calculated PCF for this request yet — run PCF calculation first",
                        404,
                        null
                    )
                );
        }
        return res.status(200).send(generateResponse(true, "ok", 200, agg));
    } catch (error: any) {
        console.error("getQuintariPcfSubmodel error:", error);
        return res.status(500).send(generateResponse(false, error?.message || "submodel failed", 500, null));
    }
}

// Read-only preview of the Catena-X PCF submodel for EACH calculated component
// of a request: { components: [{ bomId, componentName, materialNumber,
// componentCategory, supplierName, submodel, semanticId, specVersion }] }.
export async function getQuintariPcfSubmodelsPerComponent(req: any, res: any) {
    try {
        if (!req.user_id) {
            return res.status(401).send(generateResponse(false, "not authenticated", 401, null));
        }
        const bomPcfRequestId = req.params.bomPcfRequestId;
        if (!bomPcfRequestId) {
            return res.status(400).send(generateResponse(false, "bomPcfRequestId required", 400, null));
        }
        const components = await buildSubmodelsPerComponent(bomPcfRequestId);
        if (components.length === 0) {
            return res
                .status(404)
                .send(
                    generateResponse(
                        false,
                        "no calculated components for this request yet — run PCF calculation first",
                        404,
                        null
                    )
                );
        }
        return res.status(200).send(generateResponse(true, "ok", 200, { components }));
    } catch (error: any) {
        console.error("getQuintariPcfSubmodelsPerComponent error:", error);
        return res.status(500).send(generateResponse(false, error?.message || "submodels failed", 500, null));
    }
}
