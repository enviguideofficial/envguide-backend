
import { ulid } from 'ulid';
import { generateResponse } from '../util/genRes.js';
import * as userService from '../services/userService.js';
import * as mfaService from "../services/mfaService.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
import { getLocalIP } from '../server.js';
import { getModuleSetting } from './heplerController.js';
import speakeasy from "speakeasy";
import QRCode from "qrcode";

dotenv.config();
import { sendMail } from "../util/mailTransporter.js";


export async function signup(req: any, res: any) {
    try {
        // All newly created users (client, supplier, admin, super admin, admin-d, ...)
        // get a setup-password email with a 24h JWT link. The admin no longer needs
        // to share a password manually — the user sets their own via the email link.
        const isExternalUser = true;

        const adminObj = {
            user_id: ulid(),
            user_name: req.body.user_name,
            user_role: req.body.user_role,
            user_email: req.body.user_email,
            user_password: req.body.user_password,
            user_phone_number: req.body.user_phone_number,
            user_department: req.body.user_department,
            user_role_id: req.body.user_role_id,
            change_password_next_login: req.body.change_password_next_login,
            password_never_expires: req.body.password_never_expires
        }

        const findUser = await userService.finduser(adminObj.user_email)
        if (findUser.rows.length > 0) {
            return res.status(400).send(
                generateResponse(false, `user already exists with ${adminObj.user_email} `, 400, null)
            );
        }

        // For external users (client / supplier), the admin does not set a password.
        // We store a random placeholder hash that the user will replace by clicking
        // the setup link emailed to them.
        const passwordToHash = isExternalUser
            ? `setup-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
            : adminObj.user_password;

        const saltRounds = 10;
        bcrypt.genSalt(saltRounds, function (_err, salt) {
            bcrypt.hash(passwordToHash, salt, async function (err, hash) {
                if (err) {
                    console.log('Unable to create new user', err);
                    return res.json({ message: 'Unable to create new user' });
                }
                if (!hash) return;

                adminObj.user_password = hash;

                const adduser = await userService.addUser(adminObj);
                if (adduser.rows.length === 0) {
                    return res.status(400).send(
                        generateResponse(false, "user create unsuccessful", 400, null)
                    );
                }

                if (!isExternalUser) {
                    return res.status(200).send(
                        generateResponse(true, "user created successfully", 200, null)
                    );
                }

                // External user — send setup-password email with a 24h JWT link.
                try {
                    const TOKEN_SECRET: string = process.env.TOKEN_SECRET ?? 'defaultSecret';
                    const token = jwt.sign(
                        { user_email: adminObj.user_email },
                        TOKEN_SECRET,
                        { expiresIn: "24h" }
                    );
                    const setupLink = `${process.env.FRONTEND_URL || "https://enviraan.com"}/reset-password?token=${token}&setup=1`;
                    const subject = "Welcome to EnviGuide — Set up your account";
                    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <p>Hello ${adminObj.user_name || "there"},</p>

        <p>An EnviGuide account has been created for you. To get started, please set your password using the link below.</p>

        <p style="margin: 20px 0;">
            <a href="${setupLink}"
               style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Set My Password
            </a>
        </p>

        <p>Or copy and paste this link into your browser:<br>
           <a href="${setupLink}">${setupLink}</a>
        </p>

        <p><strong>Note:</strong> This link will expire in 24 hours for security reasons. After setting your password, sign in with your email and the password you choose.</p>

        <p>If you were not expecting this email, please ignore it.</p>

        <p>Best regards,<br>
           <strong>Team EnviGuide</strong></p>
    </div>

    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        <p>This is an automated message from EnviGuide. Please do not reply to this email.</p>
        <p>If you have any questions, please contact our support team at support@enviguide.info</p>
    </div>
</body>
</html>
                    `;

                    await sendMail({
                        to: [adminObj.user_email],
                        subject,
                        html
                    });

                    return res.status(200).send(
                        generateResponse(true, "Account created. Setup link emailed to user.", 200, null)
                    );
                } catch (emailError: any) {
                    console.error("Setup email failed:", emailError);
                    // The account exists; admin can trigger password reset manually as a fallback.
                    return res.status(200).send(
                        generateResponse(
                            true,
                            "Account created, but the setup email could not be sent. Please trigger a password reset for this user.",
                            200,
                            null
                        )
                    );
                }
            });
        });
    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

function generateAccessToken(data: any) {
    console.log(data, "data")
    const TOKEN_SECRET: string = process.env.TOKEN_SECRET ?? 'defaultSecret';

    console.log(TOKEN_SECRET)
    if (TOKEN_SECRET) {
        console.log()
        return jwt.sign(data, TOKEN_SECRET);
    }
}

export async function login(req: any, res: any) {
    try {
        const { user_email, password } = req.body;
        console.log(password);
        const findUser = await userService.findUserByMultiple(user_email);

        const localIP = getLocalIP();
        const is_auto_batch = await getModuleSetting();

        if (findUser.rows.length > 0) {
            const user_password = findUser.rows[0].user_password;
            console.log(user_password);
            const passwordMatch = await bcrypt.compare(password, user_password);

            if (!passwordMatch) {
                return res.status(401).json({ success: false, message: "Wrong password" });
            }

            // Check if MFA secret already exists
            const existingSecret = await mfaService.getSecretByUserId(findUser.rows[0].user_id);
            let secretBase32 = "";
            let qrCodeUrl: string | null = null;

            if (!existingSecret) {
                // Generate new MFA secret
                const secret = speakeasy.generateSecret({
                    name: `Enviguide portal (${user_email})`,
                });

                if (!secret.otpauth_url) {
                    return res.status(500).json({ success: false, message: "Failed to generate OTP URL" });
                }

                // Save secret in DB
                await mfaService.saveMFASecret({
                    user_id: findUser.rows[0].user_id,
                    user_email,
                    mfa_secret: secret.base32
                });

                secretBase32 = secret.base32;
                qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
            } else {
                // If already exists, just send manual code (optional)
                secretBase32 = existingSecret.mfa_secret;
            }

            return res.status(200).json({
                success: true,
                message: "MFA setup initiated. Scan QR or use manual code.",
                qrCode: qrCodeUrl || null,
                manualCode: secretBase32,
                localIP,
                is_auto_batch
            });
        } else {
            return res.status(404).json({ success: false, message: 'user not found' });
        }
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: "Network error occurred" });
    }
}

export async function verifyMFA(req: any, res: any) {
    const { user_email, token } = req.body;

    const findUser = await userService.findUserByMultiple(user_email);
    if (findUser.rows.length === 0) {
        return res.status(404).json({ success: false, message: "User not found" });
    }

    const mfaData = await mfaService.getSecretByUserId(findUser.rows[0].user_id);
    if (!mfaData) {
        return res.status(400).json({ success: false, message: "MFA not setup" });
    }

    const isValid = speakeasy.totp.verify({
        secret: mfaData.mfa_secret,
        encoding: "base32",
        token,
        window: 1
    });

    if (!isValid) {
        return res.status(401).json({ success: false, message: "Invalid or expired MFA code" });
    }

    // Issue final JWT after MFA success
    const jwttoken = generateAccessToken({
        email: findUser.rows[0].user_email,
        role: findUser.rows[0].user_role
    });

    return res.status(200).send(
        generateResponse(true, "MFA verified successfully", 200, {
            token: jwttoken,
            user_id: findUser.rows[0].user_id,
            user_name: findUser.rows[0].user_name,
            user_role: findUser.rows[0].user_role,
            user_email: findUser.rows[0].user_email,
            user_phone_number: findUser.rows[0].user_phone_number,
            user_department: findUser.rows[0].user_department
        }),

    )

    // return res.status(200).json({
    //     success: true,
    //     message: "MFA verified successfully",
    //     token: jwttoken
    // });
}

export async function createRole(req: any, res: any) {
    try {

        const roleData = req.body
        roleData.role_id = ulid();

        const createRoleData = await userService.createRole(roleData)
        console.log(createRoleData.rows)
        if (createRoleData.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "role added successfully", 200, createRoleData.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "role adding unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getRoles(_req: any, res: any) {
    try {

        const getRole = await userService.getRole()

        if (getRole.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "role fetched successfully", 200, getRole.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "role fetching unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function createDepartment(req: any, res: any) {
    try {

        const departmentData = req.body


        departmentData.department_id = ulid();


        const createDepartment = await userService.createDepartment(departmentData)

        if (createDepartment.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "deparment added successfully", 200, createDepartment.rows[0])
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "deparment adding unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getDeparmment(_req: any, res: any) {
    try {

        const getDeparmment = await userService.getDepartment()

        if (getDeparmment.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "deparment fetched successfully", 200, getDeparmment.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "deparment fetching unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function addUserPermission(req: any, res: any) {

    try {

        const permissionData = req.body
        permissionData.permission_id = ulid()
        const addPermissionData = await userService.addUserPermission(permissionData)
        if (addPermissionData.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "permission updated succesfully", 200, addPermissionData.rows)
            )
        } else {
            return res.status(400).send(
                generateResponse(true, "permission update unsuccesfully", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function updatePermission(req: any, res: any) {

    try {

        const permissionData = req.body
        var updatePermissionData = []
        for (let permission of permissionData) {

            let result = await userService.updatePermission(permission)
            if (result.rows.length > 0) {
                updatePermissionData.push(result.rows)
            }
        }
        if (updatePermissionData.length > 0) {
            return res.status(200).send(
                generateResponse(true, "permission updated succesfully", 200, updatePermissionData)
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "permission update unsuccesfully", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getPermission(req: any, res: any) {

    try {


        const getPermission = await userService.getPermission(req.user_id)
        if (getPermission.rows.length > 0) {


            return res.status(200).send(
                generateResponse(true, "permission fetched succesfully", 200, getPermission.rows)
            )
        } else {
            return res.status(400).send(
                generateResponse(true, "permission fetching unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}


// export async function getUserPermissionById(req: any, res: any) {
//     try {
//         const getPermission = await userService.getUserModulePermission(req.query);
//         if (getPermission.rows.length > 0) {
//             let permissions = getPermission.rows;

//             // Group permissions by main module name
//             const groupedPermissions: any = {};
//             permissions.forEach((permission: any) => {
//                 const mainModuleName = permission.main_module_name;
//                 if (!groupedPermissions[mainModuleName]) {
//                     groupedPermissions[mainModuleName] = [];
//                 }
//                 groupedPermissions[mainModuleName].push(permission);
//             });

//             // Construct the response array
//             const response: any = [];
//             const settingItems: any = [];

//             for (const mainModuleName in groupedPermissions) {
//                 const permissionsForModule = groupedPermissions[mainModuleName];

//                 if (mainModuleName.endsWith("setting")) {
//                     // Add to settingItems if mainModuleName ends with 'setting'
//                     const hasItems = permissionsForModule.map((permission: any) => ({
//                         ...permission,
//                         main_module_name: undefined,
//                         main_module_id: undefined,
//                         parent_main_module_id: undefined
//                     }));

//                     settingItems.push({
//                         module_name: mainModuleName,
//                         hasItems
//                     });
//                 } else if (permissionsForModule.length === 1 && !permissionsForModule[0].module_name.includes('_')) {
//                     // If there's only one item and it's not part of a nested structure, add it directly
//                     response.push({
//                         module: mainModuleName,
//                         ...permissionsForModule[0]
//                     });
//                 } else {
//                     // Create a nested structure
//                     const hasItems = permissionsForModule.map((permission: any) => ({
//                         ...permission,
//                         main_module_name: undefined,
//                         main_module_id: undefined,
//                         parent_main_module_id: undefined
//                     }));

//                     response.push({
//                         module_name: mainModuleName,
//                         hasItems
//                     });
//                 }
//             }

//             // Add settingItems under a single settings module
//             if (settingItems.length > 0) {
//                 response.push({
//                     module_name: "settings",
//                     hasItems: settingItems
//                 });
//             }

//             response.sort((a: any, b: any) => {
//                 const nameA = a.module_name || a.module || '';
//                 const nameB = b.module_name || b.module || '';
//                 return nameA.localeCompare(nameB);
//             });

//             return res.status(200).send(
//                 generateResponse(true, "permission fetched successfully", 200, response)
//             );
//         } else {
//             return res.status(400).send(
//                 generateResponse(false, "permission fetching unsuccessful", 400, null)
//             );
//         }
//     } catch (error: any) {
//         return res.status(400).send(generateResponse(false, error, 400, null));
//     }
// }
export async function getUserPermissionById(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { user_id } = req.query;

            if (!user_id) {
                return res.status(400).send(generateResponse(false, "user_id is required", 400, null));
            }

            const result = await userService.getUserModulePermission({ user_id }, client);
            const tree: any = {};

            for (const row of result.rows) {
                // ================= MAIN MODULE =================
                if (!tree[row.main_module_id]) {
                    tree[row.main_module_id] = {
                        main_module_id: row.main_module_id,
                        main_module_name: row.main_module_name,
                        permission_id: row.main_permission_id ?? null,
                        user_id: row.main_user_id ?? user_id,
                        create: row.main_create,
                        update: row.main_update,
                        delete: row.main_delete,
                        print: row.main_print,
                        export: row.main_export,
                        send: row.main_send,
                        read: row.main_read,
                        all: row.main_all,
                        modules: {}
                    };
                }

                // ================= MODULE =================
                if (row.module_id) {
                    if (!tree[row.main_module_id].modules[row.module_id]) {
                        tree[row.main_module_id].modules[row.module_id] = {
                            module_name: row.module_name,
                            permission_id: row.module_permission_id ?? null,
                            user_id: row.module_user_id ?? user_id,
                            create: row.module_create,
                            update: row.module_update,
                            delete: row.module_delete,
                            print: row.module_print,
                            export: row.module_export,
                            send: row.module_send,
                            read: row.module_read,
                            all: row.module_all,
                            submodules: []
                        };
                    }

                    // ================= SUBMODULE =================
                    if (row.submodule_id) {
                        tree[row.main_module_id].modules[row.module_id].submodules.push({
                            submodule_id: row.submodule_id,
                            submodule_name: row.submodule_name,
                            permission_id: row.submodule_permission_id ?? null,
                            user_id: row.submodule_user_id ?? user_id,
                            create: row.submodule_create,
                            update: row.submodule_update,
                            delete: row.submodule_delete,
                            print: row.submodule_print,
                            export: row.submodule_export,
                            send: row.submodule_send,
                            read: row.submodule_read,
                            all: row.submodule_all
                        });
                    }
                }
            }

            // ================= FINAL RESPONSE =================
            const response = Object.values(tree).map((main: any) => ({
                main_module_id: main.main_module_id,
                main_module_name: main.main_module_name,
                permission_id: main.permission_id,
                user_id: main.user_id,
                create: main.create,
                update: main.update,
                delete: main.delete,
                print: main.print,
                export: main.export,
                send: main.send,
                read: main.read,
                all: main.all,
                modules: Object.values(main.modules)
            }));

            return res.status(200).send(
                generateResponse(true, "Permission fetched successfully", 200, response)
            );
        } catch (error: any) {
            console.error(error);
            return res.status(500).send(generateResponse(false, error.message, 500, null));
        }
    });
}



export async function getAllUser(req: any, res: any) {

    try {

        const getAllUser = await userService.getAllUser(req.query)
        if (getAllUser) {
            return res.status(200).send(
                generateResponse(true, "users fetched succesfully", 200, {
                    totalCount: getAllUser.totalRowsCount,
                    userList: getAllUser.userList
                })
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "user fetching unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getUserById(req: any, res: any) {

    try {
        const { user_id } = req.query
        if (user_id) {
            const getUser = await userService.getUserById(user_id)
            if (getUser.rows.length > 0) {
                return res.status(200).send(
                    generateResponse(true, "user fetched succesfully ", 200, getUser.rows))
            } else {
                return res.status(400).send(
                    generateResponse(false, "user not found", 400, null))
            }
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function updateUser(req: any, res: any) {
    try {
        const userObj = req.body;

        const findUser = await userService.getUserById(userObj.user_id)

        const user_password = findUser.rows[0].user_password;
        console.log(user_password)

        if (userObj.old_user_password) {
            const isPasswordMatch = await bcrypt.compare(userObj.old_user_password, user_password);
            console.log(isPasswordMatch)
            if (isPasswordMatch) {
                if (userObj.new_user_password) {
                    const saltRounds = 10;
                    const hash = await bcrypt.hash(userObj.new_user_password, saltRounds);
                    userObj.user_password = hash;
                    delete userObj.old_user_password;
                    delete userObj.new_user_password;
                }
            } else {


                return res.status(401).send(
                    generateResponse(false, "wrong old password", 401, null)
                );
            }
        }

        const updateuser = await userService.updateUser(userObj.user_id, userObj);

        if (updateuser.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "user updated successfully", 200, null)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "user update unsuccessful", 400, null)
            );
        }
    }
    catch (error: any) {
        console.log(error)
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}


export async function getAllUserWithoutPagination(req: any, res: any) {

    try {

        const getAllUser = await userService.getAllUserWithoutPagination(req.query)

        if (getAllUser) {
            return res.status(200).send(
                generateResponse(true, "users fetched succesfully", 200, {
                    userList: getAllUser
                })
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "user fetching unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}


export async function addModule(req: any, res: any) {

    try {
        const moduleBody = req.body
        moduleBody.module_id = ulid();
        const addModule = await userService.addModule(moduleBody)
        if (addModule) {
            return res.status(200).send(
                generateResponse(true, "module added succesfully", 200, addModule.rows)
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "module module unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getModule(_req: any, res: any) {

    try {

        const getModule = await userService.getModule()
        if (getModule.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "module fetched succesfully", 200, getModule.rows)
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "module fetching unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function addMainModule(req: any, res: any) {

    try {
        const moduleBody = req.body
        moduleBody.main_module_id = ulid();
        const addModule = await userService.addMainModule(moduleBody)
        if (addModule) {
            return res.status(200).send(
                generateResponse(true, "module added succesfully", 200, addModule.rows)
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "module module unsuccesfull", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function addSubModule(req: any, res: any) {
    try {
        const moduleBody = req.body;
        moduleBody.submodule_id = ulid(); // Generate unique module_id

        const addModuleResult = await userService.addSubModule(moduleBody);

        if (addModuleResult) {
            return res.status(200).send(
                generateResponse(true, "Submodule added successfully", 200, addModuleResult.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "Submodule creation unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function addUpdateUpdateModule(req: any, res: any) {

    try {

        const subModuleData = req.body


        let result = await userService.addUpdateUpdateModule(subModuleData)


        if (result.rows[0].length > 0) {
            return res.status(200).send(
                generateResponse(true, "module updated succesfully", 200, result.rows[0])
            )
        } else {
            return res.status(400).send(
                generateResponse(false, "permission update unsuccesfully", 400, null)
            )
        }
    }
    catch (error: any) {
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function forgotPassword(req: any, res: any) {
    try {

        const findUser = await userService.finduser(req.body.user_email)
        if (findUser.rows.length === 0) {
            return res.status(400).send(generateResponse(false, 'User with this email does not exist', 400, null));
        }
        const token = generateAccessToken({ user_email: findUser.rows[0].user_email });

        const resetLink = `${process.env.FRONTEND_URL || "https://enviraan.com"}/reset-password?token=${token}`;
        const subject = "Password Reset Request - Enviguide";

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <p>Hello,</p>
        
        <p>We received a request to reset your password for your Enviguide account.</p>
        
        <p>Please use the following link to reset your password:</p>
        
        <p style="margin: 20px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Reset Password
            </a>
        </p>
        
        <p>Or copy and paste this link into your browser:<br>
           <a href="${resetLink}">${resetLink}</a>
        </p>
        
        <p><strong>Note:</strong> This link will expire in 15 minutes for security reasons.</p>
        
        <p>If you did not request a password reset, please ignore this email or contact our support team if you have concerns.</p>
        
        <p>Best regards,<br>
           <strong>Team Enviguide</strong><br>
        </p>
    </div>
    
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        <p>This is an automated message from Enviguide. Please do not reply to this email.</p>
        <p>If you have any questions, please contact our support team at support@enviguide.info</p>
    </div>
</body>
</html>
        `;

        const to = req.body.user_email;

        await sendMail({
            to: Array.isArray(to) ? to : [to],
            subject,
            html
        });

        return res.status(200).json({
            success: true,
            message: "Password reset email sent successfully"
        });

    } catch (error: any) {

        console.error('Error:', error);
        return res.status(400).send(generateResponse(false, error.message, 400, null));


    }
}

export async function resetPassword(req: any, res: any) {
    try {
        const token = req.body.token

        const TOKEN_SECRET: string = process.env.TOKEN_SECRET ?? 'defaultSecret';

        console.log(TOKEN_SECRET)
        if (TOKEN_SECRET) {
            const user: any = jwt.verify(token, TOKEN_SECRET);
            console.log(user, "admindataaa")


            const findUser = await userService.finduser(user.user_email)
            if (findUser.rows.length === 0) {
                return res.status(400).send(generateResponse(false, 'User with this email does not exist', 400, null));
            }
            const updateObj = {
                user_password: req.body.user_password,
            }

            const saltRounds = 10;
            console.log(saltRounds,)
            bcrypt.genSalt(saltRounds, function (_err, salt) {
                bcrypt.hash(updateObj.user_password, salt, async function (err, hash) {
                    // Store hash in your password DB.
                    if (err) {
                        console.log('Unable to create new user')
                        console.log(err)
                        res.json({ message: 'Unable to create new user' })
                    }
                    if (hash) {
                        updateObj.user_password = hash


                        const updateuser = await userService.updateUser(findUser.rows[0].user_id, updateObj)
                        if (updateuser.rows.length > 0) {
                            return res.status(200).send(
                                generateResponse(true, "user password reset successfully", 200, null)
                            );
                        } else {
                            return res.status(400).send(
                                generateResponse(false, "user password reset unsuccessful", 400, null)
                            );
                        }
                    }
                });
            })
        } else {
            return res.status(400).send(generateResponse(false, "something went wrong", 400, null));
        }
    } catch (error: any) {

        console.error('Error:', error);
        return res.status(400).send(generateResponse(false, error.message, 400, null));


    }
}

function generateAccessTokenForResetPassAndMFA(data: any) {
    const TOKEN_SECRET: string = process.env.TOKEN_SECRET ?? 'defaultSecret';

    if (TOKEN_SECRET) {
        // return jwt.sign(data, TOKEN_SECRET);
        return jwt.sign(data, TOKEN_SECRET, { expiresIn: "15m" });
    }
}

export async function forgotMFA(req: any, res: any) {
    try {

        const findUser = await userService.finduser(req.body.user_email)
        if (findUser.rows.length === 0) {
            return res.status(400).send(generateResponse(false, 'User with this email does not exist', 400, null));
        }
        const token = generateAccessTokenForResetPassAndMFA({ user_email: findUser.rows[0].user_email });
        const resetLink = `${process.env.FRONTEND_URL || "https://enviraan.com"}/reset-mfa?token=${token}`;
        const subject = "Reset Your Enviguide MFA";

        const to = req.body.user_email;
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background-color: #f4f4f4; padding: 20px; border-radius: 5px;">
        <p>Hello,</p>
        
        <p>We received a request to reset your Multi-Factor Authentication (MFA) for your Enviguide account.</p>
        
        <p>Please use the following link to reset your MFA settings:</p>
        
        <p style="margin: 20px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Reset MFA
            </a>
        </p>
        
        <p>Or copy and paste this link into your browser:<br>
           <a href="${resetLink}">${resetLink}</a>
        </p>
        
        <p><strong>Note:</strong> This link will expire in 15 minutes for security reasons.</p>
        
        <p>If you did not request an MFA reset, please ignore this email or contact our support team immediately if you have security concerns.</p>
        
        <p>Best regards,<br>
           <strong>Team Enviguide</strong><br>
        </p>
    </div>
    
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        <p>This is an automated message from Enviguide. Please do not reply to this email.</p>
        <p>If you have any questions, please contact our support team at support@enviguide.info</p>
    </div>
</body>
</html>
        `;

        await sendMail({
            to: Array.isArray(to) ? to : [to],
            subject,
            html
        });

        return res.status(200).json({
            success: true,
            message: "MFA reset email sent successfully"
        });

    } catch (error: any) {

        console.error('Error:', error);
        return res.status(400).send(generateResponse(false, error.message, 400, null));


    }
}

export async function resetMFA(req: any, res: any) {
    try {
        const { token } = req.body;
        const TOKEN_SECRET = process.env.TOKEN_SECRET ?? 'defaultSecret';

        if (!token) {
            return res.status(400).json({ success: false, message: "Token required" });
        }

        const user: any = jwt.verify(token, TOKEN_SECRET);
        const findUser = await userService.finduser(user.user_email);

        if (findUser.rows.length === 0) {
            return res.status(400).send(generateResponse(false, 'User with this email does not exist', 400, null));
        }

        // Generate new MFA secret
        const secret = speakeasy.generateSecret({
            name: `Enviguide portal (${user.user_email})`
        });

        if (!secret.otpauth_url) {
            return res.status(500).json({ success: false, message: "Failed to generate OTP URL" });
        }

        // // Save new MFA secret
        await mfaService.updateMFASecret(findUser.rows[0].user_id, secret.base32);

        const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
        const localIP = getLocalIP();
        const is_auto_batch = await getModuleSetting();

        return res.status(200).send(
            generateResponse(true, "MFA Reset Successful", 200, {
                qrCode: qrCodeUrl,
                manualCode: secret.base32,
                localIP,
                is_auto_batch,
                message: "Scan QR or enter manual code to enable MFA again"
            })
        );

    } catch (error: any) {
        console.error('Error:', error);
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function asyncUserAuth(data: any) {
    try {
        const groupedPermissions = data.reduce((acc: any, curr: any) => {
            const { user_id, user_name, user_role_id, user_role, user_email, user_password, user_phone_number, user_department, change_password_next_login,
                password_never_expires, password_expiry_date, update_date, created_date, data_synced, permission_id, module_name, ...permissions } = curr;


            // Check if user_id already exists in accumulator
            if (!acc[user_id]) {
                // Initialize new entry for the user
                acc[user_id] = {
                    user_id,
                    user_name,
                    user_role_id,
                    user_role,
                    user_email,
                    user_password,
                    user_phone_number,
                    user_department,
                    change_password_next_login,
                    password_never_expires,
                    password_expiry_date,
                    permissions: [],
                };
            }

            // Add permission if not already included
            const existingPermission = acc[user_id].permissions.find((p: { permission_id: any; }) => p.permission_id === permission_id);
            if (!existingPermission) {
                acc[user_id].permissions.push({
                    user_id,
                    permission_id,
                    module_name,
                    ...permissions,
                });
            }

            return acc;
        }, {});

        // Convert to an array if needed
        const result = Object.values(groupedPermissions);

        console.log(result)

        await userService.userSync(result)


    } catch (error: any) {

    }
}





export async function createDocumentType(req: any, res: any) {
    try {

        const documentData = req.body


        const createDocumentData = await userService.createDocumentType(documentData)

        if (createDocumentData.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "document type added successfully", 200, createDocumentData.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "role adding unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function getDocumentType(_req: any, res: any) {
    try {

        const getDocumentDropDown = await userService.getDocumentDropDown()

        if (getDocumentDropDown.rows.length > 0) {
            return res.status(200).send(
                generateResponse(true, "document type fetched successfully", 200, getDocumentDropDown.rows)
            );
        } else {
            return res.status(400).send(
                generateResponse(false, "document type fetching unsuccessful", 400, null)
            );
        }

    } catch (error: any) {
        console.log(error, "error");
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
}

export async function deleteUserById(req: any, res: any) {
    return withClient(async (client: any) => {

        try {
            const { user_id } = req.body;
            if (!user_id) {
                return res.status(400).json({
                    status: false,
                    message: "user_id is required"
                });
            }

            // Check if user exists
            const checkUser = await client.query(
                `SELECT user_phone_number FROM users_table WHERE user_id = $1`,
                [user_id]
            );

            if (checkUser.rowCount === 0) {
                return res.status(404).json({
                    status: false,
                    message: "User not found"
                });
            }

            await client.query('BEGIN'); // Start transaction

            await client.query(
                `DELETE FROM users_permission_table WHERE user_id = $1`,
                [user_id]
            );

            // Delete user
            await client.query(
                `DELETE FROM users_table WHERE user_id = $1`,
                [user_id]
            );

            await client.query(
                `DELETE FROM user_mfa_secret WHERE user_id = $1`,
                [user_id]
            );

            await client.query('COMMIT');

            return res.status(200).json({
                status: true,
                message: "User deleted successfully"
            });

        } catch (error: any) {
            await client.query('ROLLBACK'); // rollback in case of error
            console.error("Error in deleteUserById:", error);
            return res.status(500).json({
                status: false,
                message: "Internal Server Error"
            });
        }
    });
}



import { withClient } from '../util/database.js';

// Manufacturer onboarding form
async function generateManufacturerCode(client: any) {
    const result = await client.query(`
        SELECT code
        FROM manufacturer
        WHERE code LIKE 'MANF%'
        ORDER BY code DESC
        LIMIT 1
    `);

    if (result.rowCount === 0) {
        return "MANF0001";
    }

    const lastCode = result.rows[0].code; // MANF0009
    const num = parseInt(lastCode.replace("MANF", ""), 10) + 1;

    return `MANF${num.toString().padStart(4, "0")}`;
}


export async function createManufacturerOnboardingForm(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const data = req.body;
            const id = ulid();

            const code = await generateManufacturerCode(client);

            // uniqueness check
            const check = await client.query(
                `SELECT name, email, phone_number
                 FROM manufacturer
                 WHERE name ILIKE $1
                    OR email ILIKE $2
                    OR phone_number = $3`,
                [data.name, data.email, data.phone_number]
            );

            if (check.rowCount > 0) {
                const row = check.rows[0];

                if (row.name?.toLowerCase() === data.name.toLowerCase())
                    return res.send(generateResponse(false, "Name already exists", 400, null));

                if (row.email?.toLowerCase() === data.email.toLowerCase())
                    return res.send(generateResponse(false, "Email already exists", 400, null));

                if (row.phone_number === data.phone_number)
                    return res.send(generateResponse(false, "Phone number already exists", 400, null));
            }

            const query = `
                INSERT INTO manufacturer (
                    id, code, name, address, lat, long,
                    email, phone_number, alternate_phone_number,
                    gender, date_of_birth, image, company_logo,
                    company_website, factory_or_plant_name,
                    factory_address, city, state, country,
                    manufacturing_capabilities,
                    installed_capacity_or_month,
                    machinery_list, years_of_operation,
                    number_of_employees, key_oem_clients,
                    iso_9001, iso_14001, ohsas_18001,
                    iatf_16949, other_certifications,
                    reach_compliance, rohs_ompliance,
                    conflict_minerals_declaration,
                    environmental_safety_policy,
                    factory_layout_pdf,
                    factory_profile_or_capability_deck,
                    qa_or_qc_lab_availability,
                    testing_certifications,
                    contact_person_name,
                    contact_person_designation,
                    contact_person_email,
                    contact_person_phone
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,
                    $7,$8,$9,
                    $10,$11,$12,$13,
                    $14,$15,$16,$17,$18,$19,
                    $20,$21,$22,$23,
                    $24,$25,$26,$27,
                    $28,$29,$30,
                    $31,$32,$33,
                    $34,$35,$36,
                    $37,$38,$39,
                    $40,$41,$42
                )
                RETURNING *;
            `;

            const values = [
                id, code, data.name, data.address, data.lat, data.long,
                data.email, data.phone_number, data.alternate_phone_number,
                data.gender, data.date_of_birth, data.image, data.company_logo,
                data.company_website, data.factory_or_plant_name,
                data.factory_address, data.city, data.state, data.country,
                data.manufacturing_capabilities,
                data.installed_capacity_or_month,
                data.machinery_list, data.years_of_operation,
                data.number_of_employees, data.key_oem_clients,
                data.iso_9001, data.iso_14001, data.ohsas_18001,
                data.iatf_16949, data.other_certifications,
                data.reach_compliance, data.rohs_ompliance,
                data.conflict_minerals_declaration,
                data.environmental_safety_policy,
                data.factory_layout_pdf,
                data.factory_profile_or_capability_deck,
                data.qa_or_qc_lab_availability,
                data.testing_certifications,
                data.contact_person_name,
                data.contact_person_designation,
                data.contact_person_email,
                data.contact_person_phone
            ];

            const result = await client.query(query, values);

            return res.send(generateResponse(true, "Manufacturer created", 200, result.rows[0]));
        } catch (error: any) {
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

export async function updateManufacturerOnboardingForm(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const id = req.body.id;
            const data = { ...req.body };

            // prevent updating restricted fields
            delete data.id;
            delete data.code;

            /* ---------- uniqueness check ---------- */
            const check = await client.query(
                `SELECT id, name, email, phone_number
                 FROM manufacturer
                 WHERE (name ILIKE $1
                        OR email ILIKE $2
                        OR phone_number = $3)
                   AND id <> $4`,
                [data.name, data.email, data.phone_number, id]
            );

            if (check.rowCount > 0) {
                const row = check.rows[0];

                if (row.name?.toLowerCase() === data.name?.toLowerCase())
                    return res.send(generateResponse(false, "Name already exists", 400, null));

                if (row.email?.toLowerCase() === data.email?.toLowerCase())
                    return res.send(generateResponse(false, "Email already exists", 400, null));

                if (row.phone_number === data.phone_number)
                    return res.send(generateResponse(false, "Phone number already exists", 400, null));
            }

            /* ---------- dynamic update ---------- */
            const keys = Object.keys(data);
            if (!keys.length) {
                return res.send(generateResponse(false, "No fields to update", 400, null));
            }

            const setClause = keys
                .map((key, i) => `${key} = $${i + 1}`)
                .join(", ");

            const values = keys.map(k => data[k]);

            const query = `
                UPDATE manufacturer
                SET ${setClause},
                    update_date = CURRENT_TIMESTAMP
                WHERE id = $${keys.length + 1}
                RETURNING *;
            `;

            const result = await client.query(query, [...values, id]);

            return res.send(
                generateResponse(true, "Manufacturer updated", 200, result.rows[0])
            );
        } catch (error: any) {
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

export async function getManufacturerById(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { id } = req.query;

            const query = `
                SELECT *
                FROM manufacturer
                WHERE id = $1
                LIMIT 1;
            `;

            const result = await client.query(query, [id]);

            if (result.rowCount === 0) {
                return res.send(
                    generateResponse(false, "Manufacturer not found", 404, null)
                );
            }

            return res.send(
                generateResponse(true, "Manufacturer fetched successfully", 200, result.rows[0])
            );

        } catch (error: any) {
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

export async function getManufacturerList(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,
        code,
        name,
        email,
        phone_number,
        factory_or_plant_name,
        contact_person_name,
        search
    } = req.query;

    const page = pageNumber;
    const limit = pageSize;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`m.code ILIKE $${idx++}`);
                values.push(`%${code}%`);
            }

            if (name) {
                conditions.push(`m.name ILIKE $${idx++}`);
                values.push(`%${name}%`);
            }

            if (email) {
                conditions.push(`m.email ILIKE $${idx++}`);
                values.push(`%${email}%`);
            }

            if (phone_number) {
                conditions.push(`m.phone_number ILIKE $${idx++}`);
                values.push(`%${phone_number}%`);
            }

            if (factory_or_plant_name) {
                conditions.push(`m.factory_or_plant_name ILIKE $${idx++}`);
                values.push(`%${factory_or_plant_name}%`);
            }

            if (contact_person_name) {
                conditions.push(`m.contact_person_name ILIKE $${idx++}`);
                values.push(`%${contact_person_name}%`);
            }

            /* Global search */
            if (search) {
                conditions.push(`
                    (
                        m.code ILIKE $${idx}
                        OR m.name ILIKE $${idx}
                        OR m.email ILIKE $${idx}
                        OR m.phone_number ILIKE $${idx}
                        OR m.factory_or_plant_name ILIKE $${idx}
                        OR m.contact_person_name ILIKE $${idx}
                    )
                `);
                values.push(`%${search}%`);
                idx++;
            }

            // Correct placement of limit & offset
            const limitIndex = idx++;
            const offsetIndex = idx++;

            values.push(limit, offset);

            const query = `
                SELECT m.*
                FROM manufacturer m
                WHERE 1=1
                ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""}
                ORDER BY m.created_date DESC
                LIMIT $${limitIndex} OFFSET $${offsetIndex}
            `;


            const countQuery = `
                SELECT COUNT(*) AS total
                FROM manufacturer t;
            `;

            const countResult = await client.query(
                countQuery
                // params.slice(0, params.length - 2)
            );

            const total = Number(countResult.rows[0].total);

            const result = await client.query(query, values);

            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    // page,
                    // pageSize: limit,
                    // totalCount: result.rows.length,
                    data: result.rows,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit))
                    }
                })
            );

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });
}


export async function deleteManufacturer(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { id } = req.body; // or req.body

            const check = await client.query(
                `SELECT id FROM manufacturer WHERE id = $1`,
                [id]
            );

            if (check.rowCount === 0) {
                return res.send(
                    generateResponse(false, "Manufacturer not found", 404, null)
                );
            }

            await client.query(
                `DELETE FROM manufacturer WHERE id = $1`,
                [id]
            );

            return res.send(
                generateResponse(true, "Manufacturer deleted successfully", 200, null)
            );

        } catch (error: any) {
            return res.send(
                generateResponse(false, error.message, 400, null)
            );
        }
    });
}


// export async function addSupplierOnboardingForm(req: any, res: any) {
//     return withClient(async (client: any) => {
//         try {
//             const sup_id = ulid();
//             const data = req.body;

//             /* ---------- uniqueness check ---------- */
//             const exists = await client.query(
//                 `SELECT supplier_email
//                  FROM supplier_details
//                  WHERE supplier_email ILIKE $1`,
//                 [data.supplier_email]
//             );

//             if (exists.rowCount > 0) {
//                 return res.send(
//                     generateResponse(false, "Supplier email already exists", 400, null)
//                 );
//             }

//             const keys = Object.keys(data);
//             const columns = ["sup_id", ...keys];
//             const placeholders = columns.map((_, i) => `$${i + 1}`);

//             const values = [sup_id, ...keys.map(k => data[k])];

//             const query = `
//                 INSERT INTO supplier_details (${columns.join(",")})
//                 VALUES (${placeholders.join(",")})
//                 RETURNING *;
//             `;

//             const result = await client.query(query, values);

//             return res.send(
//                 generateResponse(true, "Supplier created", 200, result.rows[0])
//             );
//         } catch (error: any) {
//             return res.send(generateResponse(false, error.message, 400, null));
//         }
//     });
// }

export async function addSupplierOnboardingForm(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const sup_id = ulid();

            /* ✅ Allowed fields ONLY */
            const allowedFields = [
                "supplier_name",
                "supplier_email",
                "supplier_phone_number",
                "supplier_alternate_phone_number",
                "supplier_gender",
                "supplier_date_of_birth",
                "supplier_image",
                "supplier_company_logo",
                "supplier_company_website",
                "supplier_company_name",
                "supplier_business_type",
                "supplier_supplied_categories",
                "supplier_years_in_business",
                "supplier_city",
                "supplier_state",
                "supplier_country",
                "supplier_registered_address",
                "supplier_gst_number",
                "supplier_pan_number",
                "supplier_bank_account_number",
                "supplier_ifsc_code",
                "supplier_bank_name",
                "supplier_bank_branch",
                "supplier_key_automotive_clients",
                "supplier_business_registration_certificate",
                "supplier_tax_registration_proof",
                "supplier_product_catalogue",
                "supplier_additional_supporting_documents"
            ];

            /* ✅ Pick only allowed keys */
            const filteredData: any = {};
            for (const key of allowedFields) {
                if (req.body[key] !== undefined) {
                    filteredData[key] = req.body[key];
                }
            }

            /* ❌ Mandatory field check */
            if (!filteredData.supplier_email) {
                return res.send(
                    generateResponse(false, "supplier_email is required", 400, null)
                );
            }

            /* ---------- uniqueness check ---------- */
            const exists = await client.query(
                `SELECT 1 FROM supplier_details WHERE supplier_email ILIKE $1`,
                [filteredData.supplier_email]
            );

            if (exists.rowCount > 0) {
                return res.send(
                    generateResponse(false, "Supplier email already exists", 400, null)
                );
            }

            /* ---------- Insert ---------- */
            const keys = Object.keys(filteredData);
            const columns = ["sup_id", ...keys];
            const placeholders = columns.map((_, i) => `$${i + 1}`);
            const values = [sup_id, ...keys.map(k => filteredData[k])];

            const query = `
                INSERT INTO supplier_details (${columns.join(",")})
                VALUES (${placeholders.join(",")})
                RETURNING *;
            `;

            const result = await client.query(query, values);

            return res.send(
                generateResponse(true, "Supplier created", 200, result.rows[0])
            );
        } catch (error: any) {
            return res.send(
                generateResponse(false, error.message, 400, null)
            );
        }
    });
}

// export async function updateSupplierOnboardingForm(req: any, res: any) {
//     return withClient(async (client: any) => {
//         try {
//             const sup_id = req.body.sup_id;
//             const data = { ...req.body };

//             delete data.sup_id;
//             delete data.code;

//             /* ---------- uniqueness check ---------- */
//             if (data.supplier_email) {
//                 const exists = await client.query(
//                     `SELECT sup_id
//                      FROM supplier_details
//                      WHERE supplier_email ILIKE $1
//                        AND sup_id <> $2`,
//                     [data.supplier_email, sup_id]
//                 );

//                 if (exists.rowCount > 0) {
//                     return res.send(
//                         generateResponse(false, "Supplier email already exists", 400, null)
//                     );
//                 }
//             }

//             const keys = Object.keys(data);

//             if (!keys.length) {
//                 return res.send(
//                     generateResponse(false, "No fields to update", 400, null)
//                 );
//             }

//             const setClause = keys
//                 .map((key, i) => `${key} = $${i + 1}`)
//                 .join(", ");

//             const values = keys.map(k => data[k]);

//             const query = `
//                 UPDATE supplier_details
//                 SET ${setClause},
//                     update_date = CURRENT_TIMESTAMP
//                 WHERE sup_id = $${keys.length + 1}
//                 RETURNING *;
//             `;

//             const result = await client.query(query, [...values, sup_id]);

//             return res.send(
//                 generateResponse(true, "Supplier updated", 200, result.rows[0])
//             );
//         } catch (error: any) {
//             return res.send(generateResponse(false, error.message, 400, null));
//         }
//     });
// }

export async function updateSupplierOnboardingForm(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const sup_id = req.body.sup_id;

            if (!sup_id) {
                return res.send(
                    generateResponse(false, "sup_id is required", 400, null)
                );
            }

            /* ✅ Allowed update fields */
            const allowedFields = [
                "supplier_name",
                "supplier_email",
                "supplier_phone_number",
                "supplier_alternate_phone_number",
                "supplier_gender",
                "supplier_date_of_birth",
                "supplier_image",
                "supplier_company_logo",
                "supplier_company_website",
                "supplier_company_name",
                "supplier_business_type",
                "supplier_supplied_categories",
                "supplier_years_in_business",
                "supplier_city",
                "supplier_state",
                "supplier_country",
                "supplier_registered_address",
                "supplier_gst_number",
                "supplier_pan_number",
                "supplier_bank_account_number",
                "supplier_ifsc_code",
                "supplier_bank_name",
                "supplier_bank_branch",
                "supplier_key_automotive_clients",
                "supplier_business_registration_certificate",
                "supplier_tax_registration_proof",
                "supplier_product_catalogue",
                "supplier_additional_supporting_documents"
            ];

            /* ✅ Pick only allowed fields */
            const data: any = {};
            for (const key of allowedFields) {
                if (req.body[key] !== undefined) {
                    data[key] = req.body[key];
                }
            }

            /* ❌ No valid fields */
            const keys = Object.keys(data);
            if (!keys.length) {
                return res.send(
                    generateResponse(false, "No valid fields to update", 400, null)
                );
            }

            /* ---------- uniqueness check ---------- */
            if (data.supplier_email) {
                const exists = await client.query(
                    `SELECT 1
                     FROM supplier_details
                     WHERE supplier_email ILIKE $1
                       AND sup_id <> $2`,
                    [data.supplier_email, sup_id]
                );

                if (exists.rowCount > 0) {
                    return res.send(
                        generateResponse(false, "Supplier email already exists", 400, null)
                    );
                }
            }

            /* ---------- Update ---------- */
            const setClause = keys
                .map((key, i) => `${key} = $${i + 1}`)
                .join(", ");

            const values = keys.map(k => data[k]);

            const query = `
                UPDATE supplier_details
                SET ${setClause},
                    update_date = CURRENT_TIMESTAMP
                WHERE sup_id = $${keys.length + 1}
                RETURNING *;
            `;

            const result = await client.query(query, [...values, sup_id]);

            if (!result.rowCount) {
                return res.send(
                    generateResponse(false, "Supplier not found", 404, null)
                );
            }

            return res.send(
                generateResponse(true, "Supplier updated", 200, result.rows[0])
            );
        } catch (error: any) {
            return res.send(
                generateResponse(false, error.message, 400, null)
            );
        }
    });
}

export async function getSupplierById(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { id } = req.query;

            const query = `
                SELECT *
                FROM supplier_details
                WHERE sup_id = $1
                LIMIT 1;
            `;

            const result = await client.query(query, [id]);

            if (result.rowCount === 0) {
                return res.send(
                    generateResponse(false, "Supplier not found", 404, null)
                );
            }

            return res.send(
                generateResponse(true, "Supplier fetched successfully", 200, result.rows[0])
            );

        } catch (error: any) {
            return res.send(generateResponse(false, error.message, 400, null));
        }
    });
}

export async function getSupplierList(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,

        code,
        supplier_name,
        supplier_email,
        supplier_phone_number,
        supplier_gst_number,
        supplier_company_name,

        search
    } = req.query;

    const page = pageNumber;
    const limit = pageSize;
    const offset = (Number(page) - 1) * Number(limit);

    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    return withClient(async (client: any) => {
        try {

            if (code) {
                conditions.push(`s.code ILIKE $${idx++}`);
                values.push(`%${code}%`);
            }

            if (supplier_name) {
                conditions.push(`s.supplier_name ILIKE $${idx++}`);
                values.push(`%${supplier_name}%`);
            }

            if (supplier_email) {
                conditions.push(`s.supplier_email ILIKE $${idx++}`);
                values.push(`%${supplier_email}%`);
            }

            if (supplier_phone_number) {
                conditions.push(`s.supplier_phone_number ILIKE $${idx++}`);
                values.push(`%${supplier_phone_number}%`);
            }

            if (supplier_gst_number) {
                conditions.push(`s.supplier_gst_number ILIKE $${idx++}`);
                values.push(`%${supplier_gst_number}%`);
            }

            if (supplier_company_name) {
                conditions.push(`s.supplier_company_name ILIKE $${idx++}`);
                values.push(`%${supplier_company_name}%`);
            }

            /* Global search */
            if (search) {
                conditions.push(`
                    (
                        s.code ILIKE $${idx}
                        OR s.supplier_name ILIKE $${idx}
                        OR s.supplier_email ILIKE $${idx}
                        OR s.supplier_phone_number ILIKE $${idx}
                        OR s.supplier_gst_number ILIKE $${idx}
                        OR s.supplier_company_name ILIKE $${idx}
                    )
                `);
                values.push(`%${search}%`);
                idx++;
            }

            const limitIndex = idx++;
            const offsetIndex = idx++;

            values.push(limit, offset);

            const result = await client.query(
                `
                SELECT s.*
                FROM supplier_details s
                WHERE 1=1
                ${conditions.length ? `AND ${conditions.join(" AND ")}` : ""}
                ORDER BY s.created_date DESC
                LIMIT $${limitIndex} OFFSET $${offsetIndex}
                `,
                values
            );

            const rows = result.rows;

            const countQuery = `
                SELECT COUNT(*) AS total
                FROM supplier_details t;
            `;

            const countResult = await client.query(
                countQuery
                // params.slice(0, params.length - 2)
            );

            const total = Number(countResult.rows[0].total);


            return res.status(200).send(
                generateResponse(true, "Success!", 200, {
                    // page,
                    // pageSize: limit,
                    // totalCount: rows.length,
                    data: rows,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit))
                    }
                })
            );

        } catch (error: any) {
            return res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });
}


export async function deleteSupplier(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { sup_id } = req.body; // or req.body

            const check = await client.query(
                `SELECT sup_id FROM supplier_details WHERE sup_id = $1`,
                [sup_id]
            );

            if (check.rowCount === 0) {
                return res.send(
                    generateResponse(false, "Supplier not found", 404, null)
                );
            }

            await client.query(
                `DELETE FROM supplier_details WHERE sup_id = $1`,
                [sup_id]
            );

            return res.send(
                generateResponse(true, "Supplier deleted successfully", 200, null)
            );

        } catch (error: any) {
            return res.send(
                generateResponse(false, error.message, 400, null)
            );
        }
    });
}

export async function getUsersByRole(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { user_role } = req.query;

            if (!user_role) {
                return res.status(400).send(
                    generateResponse(false, "user_role is required", 400, null)
                );
            }

            // Normalize role inputs: lowercase + strip spaces so "Super Admin" matches legacy "superadmin"
            const roles = user_role
                .split(',')
                .map((r: string) => r.trim().toLowerCase().replace(/\s+/g, ''));

            const query = `
                SELECT
                    user_id,
                    user_name,
                    user_role
                FROM users_table
                WHERE LOWER(REPLACE(TRIM(user_role), ' ', '')) = ANY($1)
                ORDER BY user_name ASC;
            `;

            const result = await client.query(query, [roles]);

            return res.status(200).send(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );

        } catch (error: any) {
            console.error("Error fetching users by role:", error);
            return res.status(500).send(
                generateResponse(false, error.message, 500, null)
            );
        }
    });
}

export async function getManufacturerDropDown(_req: any, res: any) {
    return withClient(async (client: any) => {

        try {

            const query = `
                SELECT
                    user_id,
                    user_name,
                    user_role
                FROM users_table
                WHERE LOWER(TRIM(user_role)) = 'client'
                ORDER BY user_name ASC;
            `;

            const result = await client.query(query);

            return res.status(200).send(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );
        }
        catch (error: any) {
            return res.status(400).send(generateResponse(false, error.message, 400, null));
        }
    });
}