import { Router } from 'express';
import * as userController from '../../controller/userController.js';
import * as  authService from '../../middleware/authService.js'
const userRoutes = Router();

userRoutes.post('/api/user/create', userController.signup)

userRoutes.post('/api/user/login', userController.login)

userRoutes.post('/api/user/verify', userController.verifyMFA)

userRoutes.post('/api/create/role', userController.createRole)

userRoutes.post('/api/create/department', userController.createDepartment)

userRoutes.get('/api/roles/get', userController.getRoles)

userRoutes.get('/api/department/get', userController.getDeparmment)

userRoutes.get('/api/user/getAll', userController.getAllUser)
userRoutes.get('/api/user/active-logins', authService.authenticate, userController.getActiveLoginMonitoring)

userRoutes.get('/api/user/getById', userController.getUserById)

userRoutes.post('/api/user/update', userController.updateUser)
userRoutes.post('/api/user/logout', authService.authenticate, userController.logoutUserSession)

userRoutes.post('/api/user/permission/add', authService.authenticate, userController.addUserPermission)

userRoutes.post('/api/user/permission/update', authService.authenticate, userController.updatePermission)

userRoutes.get('/api/user/permission/get', authService.authenticate, userController.getPermission)

userRoutes.get('/api/user/permission/getById', userController.getUserPermissionById)

userRoutes.get('/api/user/getUsers', userController.getAllUserWithoutPagination)

userRoutes.post('/api/submodule/add', userController.addModule)

userRoutes.get('/api/submodule/get', userController.getModule)

userRoutes.post('/api/submodule/update', userController.addUpdateUpdateModule)

userRoutes.post('/api/main/module/add', userController.addMainModule)

userRoutes.post('/api/sub-submodule/add', authService.authenticate, userController.addSubModule)

userRoutes.post('/api/user/forgot/password', userController.forgotPassword)

userRoutes.post('/api/user/reset/password', userController.resetPassword)

userRoutes.post('/api/user/forgot/mfa', userController.forgotMFA)

userRoutes.post('/api/user/reset/mfa', userController.resetMFA)

userRoutes.post('/api/create/documentType', userController.createDocumentType)

userRoutes.get('/api/get/documentType', userController.getDocumentType)

userRoutes.post('/api/delete/user', authService.authenticate, userController.deleteUserById)

userRoutes.get('/api/users/by-role', userController.getUsersByRole)

userRoutes.get('/api/users/get-manufacturer', userController.getManufacturerDropDown)



userRoutes.post("/api/user/download-mfa-qr", async (req, res) => {
    try {
        const { qrCode } = req.body;

        if (!qrCode || !qrCode.startsWith("data:image/png;base64,")) {
            return res.status(400).json({ success: false, message: "Invalid QR code format" });
        }

        // Remove the prefix "data:image/png;base64,"
        const base64Data = qrCode.replace(/^data:image\/png;base64,/, "");

        // Convert base64 to Buffer
        const imgBuffer = Buffer.from(base64Data, "base64");

        // Set correct content type and send as a file
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", "attachment; filename=qr-code.png");
        res.send(imgBuffer);

    } catch (error) {
        console.error("Error generating QR PNG:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

userRoutes.post('/api/manufacturer/onboarding/create', userController.createManufacturerOnboardingForm)
userRoutes.post('/api/manufacturer/onboarding/update', userController.updateManufacturerOnboardingForm)
userRoutes.get('/api/manufacturer/onboarding/list', userController.getManufacturerList)
userRoutes.get('/api/manufacturer/onboarding/get-by-id', userController.getManufacturerById)
userRoutes.post('/api/manufacturer/onboarding/delete', authService.authenticate, userController.deleteManufacturer)

userRoutes.post('/api/supplier/onboarding/create', userController.addSupplierOnboardingForm)
userRoutes.post('/api/supplier/onboarding/update', userController.updateSupplierOnboardingForm)
userRoutes.get('/api/supplier/onboarding/list', userController.getSupplierList)
userRoutes.get('/api/supplier/onboarding/get-by-id', userController.getSupplierById)
userRoutes.post('/api/supplier/onboarding/delete', authService.authenticate, userController.deleteSupplier)


import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const BUCKET = "images";
const FOLDER = "onboardingformdocs";

// ---------------- Synology C2 S3 Client ----------------
const s3 = new S3Client({
    region: "us-east-1",  // Synology requires ANY region (use us-east-1)
    endpoint: "https://in-maa-1.linodeobjects.com",
    forcePathStyle: true,
    credentials: {
        accessKeyId: "3EPN6WAZACV03T68TS93",
        secretAccessKey: "MqUqwGdyaAlKx3exvduuOyTZEQlc7TboSb7SVPhr",
    }
});

// ---------------- Multer Storage ----------------
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});


userRoutes.post("/api/onboarding-forms-image-or-file", (req: any, res) => {
    const BOMFOLDER = FOLDER;
    upload.single("image")(req, res, async (err: any) => {
        try {
            if (err?.code === "LIMIT_FILE_SIZE") {
                return res.status(400).send({
                    status: false,
                    message: "Image size should not exceed 10 MB"
                });
            }

            if (!req.file) {
                return res.status(400).send({
                    status: false,
                    message: "No file uploaded"
                });
            }

            const file = req.file;
            const fileKey =
                `${BOMFOLDER}/IMG-${Date.now()}-${crypto.randomUUID()}-${file.originalname}`;

            await s3.send(
                new PutObjectCommand({
                    Bucket: BUCKET,
                    Key: fileKey,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                })
            );

            // Public URL format for Synology C2
            const fileUrl = `https://${BUCKET}.in-maa-1.linodeobjects.com/${fileKey}`;

            res.send({
                status: true,
                message: "Uploaded successfully",
                url: fileUrl,
                key: fileKey
            });

        } catch (error) {
            console.error("Upload Error:", error);
            res.status(500).send({ status: false, message: "Upload failed" });
        }
    });
});

userRoutes.get("/api/onboarding-forms-get-image", async (req, res) => {
    try {
        const { key } = req.query;

        if (!key) {
            return res.status(400).send({
                status: false,
                message: "Image key required"
            });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key as string,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

        res.send({ status: true, url: signedUrl });

    } catch (err) {
        console.error(err);
        res.status(500).send({
            status: false,
            message: "Unable to generate signed URL"
        });
    }
});
export default userRoutes;