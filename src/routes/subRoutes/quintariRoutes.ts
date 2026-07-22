import { Router } from "express";
import * as Controller from "../../controller/quintariController.js";
import * as authService from "../../middleware/authService.js";

const Routes = Router();

Routes.post(
    "/api/quintari/publish/:bomPcfRequestId",
    authService.authenticate,
    Controller.publishPcfToQuintari
);
Routes.get(
    "/api/quintari/publication-status/:bomPcfRequestId",
    authService.authenticate,
    Controller.getQuintariPublicationStatus
);
Routes.get(
    "/api/quintari/pcf-submodel/:bomPcfRequestId",
    authService.authenticate,
    Controller.getPcfSubmodelPreview
);
Routes.get(
    "/api/quintari/pcf-submodels/:bomPcfRequestId",
    authService.authenticate,
    Controller.getPcfSubmodelsPreviewPerComponent
);

// Read-only submodel previews for the Catena-X PCF Data Model section.
Routes.get(
    "/api/quintari/pcf-submodel/:bomPcfRequestId",
    authService.authenticate,
    Controller.getQuintariPcfSubmodel
);
Routes.get(
    "/api/quintari/pcf-submodels/:bomPcfRequestId",
    authService.authenticate,
    Controller.getQuintariPcfSubmodelsPerComponent
);

export default Routes;
