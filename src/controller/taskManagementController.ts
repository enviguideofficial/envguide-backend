
import { generateResponse } from '../util/genRes.js';
import { updateTaskService } from "../services/taskManagementService.js";
import { withClient } from '../util/database.js';
import { ulid } from 'ulid';
import { sendSupplierTaskEmail } from "../services/taskEmail.service.js";
import pLimit from "p-limit";
import { sendMail } from "../util/mailTransporter.js";

// need to confirm below update api needed or not
export async function updateTask(req: any, res: any) {
    try {
        const data = req.body;

        if (!data.id) {
            return res
                .status(400)
                .json(generateResponse(false, "Task ID is required", 400, null));
        }

        //Ensure at least one field to update is provided
        const allowedFields = [
            "id",
            "task_title",
            "category_id",
            "priority",
            "assign_to",
            "due_date",
            "description",
            "related_product",
            "estimated_hour",
            "tags",
            "attachments",
            "bom_id"
        ];

        const fieldsToUpdate = Object.keys(data).filter(field => allowedFields.includes(field));

        if (fieldsToUpdate.length === 0) {
            return res
                .status(400)
                .json(generateResponse(false, "No valid fields provided to update", 400, null));
        }

        data.update_date = new Date();
        data.updated_by = req.user_id;

        const updatedTask = await updateTaskService(data.id, data);

        return res
            .status(200)
            .json(generateResponse(true, "Task updated successfully", 200, updatedTask));

    } catch (error: any) {
        console.error("Error in updateTask:", error.message);
        return res
            .status(500)
            .json(generateResponse(false, "Something went wrong", 500, error.message));
    }
}

// =============== NEW API ===================
export async function getPCFListDropDown(_req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const query = `
                SELECT 
                    p.id,
                    p.code,
                    p.request_title,
                    p.priority,
                    p.request_organization,
                    p.is_client,
                    p.client_id
                FROM bom_pcf_request p
                WHERE p.is_task_created = FALSE AND p.is_approved = TRUE
                ORDER BY p.created_date DESC;
            `;

            const result = await client.query(query);

            if (result.rows.length === 0) {
                return res
                    .status(200)
                    .json(generateResponse(true, "No PCF records with BOM found", 200, []));
            }

            return res.status(200).json(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );
        } catch (error: any) {
            console.error("❌ Error in getPCFListDropDown:", error);
            return res.status(500).json(
                generateResponse(false, "Something went wrong", 500, error.message)
            );
        }
    });
}

export async function getPCFBOMSupplierListDropDown(req: any, res: any) {
    const { bom_pcf_id } = req.query;

    return withClient(async (client: any) => {
        try {
            const query = `
                  SELECT DISTINCT ON (b.supplier_id)
                    b.code AS bom_code,
                    b.bom_pcf_id,
                    b.supplier_id,
                    s.code AS supplier_code,
                    s.supplier_name,
                    s.supplier_email
                FROM bom b
                JOIN supplier_details s 
                    ON s.sup_id = b.supplier_id
                WHERE b.bom_pcf_id = $1
                ORDER BY b.supplier_id, b.created_date DESC;
            `;

            const result = await client.query(query, [bom_pcf_id]);

            if (result.rows.length === 0) {
                return res
                    .status(200)
                    .json(generateResponse(true, "No supplier records found in BOM", 200, []));
            }

            return res.status(200).json(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );
        } catch (error: any) {
            console.error("❌ Error in getPCFBOMSupplierListDropDown:", error);
            return res.status(500).json(
                generateResponse(false, "Something went wrong", 500, error.message)
            );
        }
    });
}

export async function createTask(req: any, res: any) {
    const {
        task_title,
        category_id,
        priority,
        bom_pcf_id,
        assign_to,
        due_date,
        description,
        product,
        estimated_hour,
        tags,
        attachments,
    } = req.body;

    const created_by = req.user_id; // assuming auth middleware

    return withClient(async (client: any) => {
        try {
            await client.query("BEGIN");

            if (!task_title || !category_id || !assign_to || !bom_pcf_id) {
                return res
                    .status(400)
                    .json(generateResponse(false, "Task title, category,bom_pcf_id and assign_to are required", 400, null));
            }

            /* INSERT TASK */
            const task_id = ulid();

            const insertTaskQuery = `
                INSERT INTO task_managment (
                    id,
                    task_title,
                    category_id,
                    priority,
                    bom_pcf_id,
                    assign_to,
                    due_date,
                    description,
                    product,
                    estimated_hour,
                    tags,
                    attachments,
                    created_by,
                    status
                )
                VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
                )
                RETURNING *;
            `;

            const taskResult = await client.query(insertTaskQuery, [
                task_id,
                task_title,
                category_id,
                priority,
                bom_pcf_id,
                assign_to,
                due_date,
                description,
                product,
                estimated_hour,
                tags,
                attachments,
                created_by,
                "To-Do"
            ]);

            /* FETCH SUPPLIER EMAILS FROM assign_to */
            const supplierEmailQuery = `
                    SELECT sup_id, supplier_email
                    FROM supplier_details
                    WHERE sup_id = ANY($1::VARCHAR[]);
                `;

            const supplierEmailResult = await client.query(supplierEmailQuery, [assign_to]);

            const supplierEmailMap = new Map<string, string>();

            supplierEmailResult.rows.forEach((row: any) => {
                supplierEmailMap.set(row.sup_id, row.supplier_email);
            });


            /* FETCH BOM DATA USING bom_pcf_id */
            const bomQuery = `
                SELECT DISTINCT ON (supplier_id)
                id,supplier_id
                FROM bom
                WHERE bom_pcf_id = $1
                ORDER BY supplier_id;
            `;

            const bomResult = await client.query(bomQuery, [bom_pcf_id]);

            if (!bomResult.rows.length) {
                throw new Error("No BOM records found for given bom_pcf_id");
            }

            /* INSERT INTO pcf_request_data_collection_stage (BULK) */
            const pcfValues: any[] = [];
            const pcfPlaceholders: string[] = [];
            const emailPayloads: any[] = [];

            bomResult.rows.forEach((bom: any, index: number) => {
                const baseIndex = index * 4;

                pcfValues.push(
                    ulid(),          // id
                    bom_pcf_id,      // bom_pcf_id
                    bom.id,          // bom_id
                    bom.supplier_id  // sup_id
                );

                pcfPlaceholders.push(
                    `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
                );

                const email = supplierEmailMap.get(bom.supplier_id);

                if (email) {
                    emailPayloads.push({
                        email,
                        bom_pcf_id,
                        bom_id: bom.id,
                        supplier_id: bom.supplier_id
                    });
                }
            });

            const insertPCFQuery = `
                INSERT INTO pcf_request_data_collection_stage (
                    id,
                    bom_pcf_id,
                    bom_id,
                    sup_id
                )
                VALUES ${pcfPlaceholders.join(", ")}
                ON CONFLICT DO NOTHING;
            `;

            await client.query(insertPCFQuery, pcfValues);

            const insertPCFDataRatingQuery = `
                INSERT INTO pcf_request_data_rating_stage (
                    id,
                    bom_pcf_id,
                    bom_id,
                    sup_id
                )
                VALUES ${pcfPlaceholders.join(", ")}
                ON CONFLICT DO NOTHING;
            `;

            await client.query(insertPCFDataRatingQuery, pcfValues);

            const updatePCFRequest = `
                    UPDATE bom_pcf_request
                    SET is_task_created = TRUE,
                        update_date = NOW(),
                        status = $2
                    WHERE id = $1;
                `;

            await client.query(updatePCFRequest, [bom_pcf_id, "In Progress"]);

            // if (is_client) {
            //     const dataCollectionId = ulid();
            //     const dataRatingId = ulid();

            //     const insertPCFQuery = `
            // INSERT INTO pcf_request_data_collection_stage (
            //         id, bom_pcf_id, client_id
            //     )
            //     VALUES ($1,$2,$3)
            //     RETURNING *;
            // `;

            //     await client.query(insertPCFQuery, [dataCollectionId, bom_pcf_id, client_id]);

            //     const insertPCFDataRatingQuery = `
            //  INSERT INTO pcf_request_data_rating_stage (
            //         id, bom_pcf_id, client_id
            //     )
            //     VALUES ($1,$2,$3)
            //     RETURNING *;
            // `;

            //     await client.query(insertPCFDataRatingQuery, [dataRatingId, bom_pcf_id, client_id]);
            // }

            await client.query("COMMIT");

            /* SEND EMAILS */
            // const limit = pLimit(5);

            // for (const payload of emailPayloads) {
            //     try {
            //         // await Promise.allSettled(
            //         //     emailPayloads.map(payload =>
            //         //         limit(() => sendSupplierTaskEmail(payload))
            //         //     )
            //         // );
            //         console.log(`✅ Email sent to ${payload.email}`);
            //     } catch (err) {
            //         console.error(`❌ Email failed for ${payload.email}`, err);
            //         continue; // 🔥 THIS is what you asked for
            //     }
            // }

            setImmediate(() => {
                const limit = pLimit(5); // concurrency limit

                Promise.allSettled(
                    emailPayloads.map(payload =>
                        limit(() => sendSupplierTaskEmail(payload))
                    )
                ).then(results => {
                    results.forEach((r, i) => {
                        if (r.status === "fulfilled") {
                            console.log(`✅ Email sent: ${emailPayloads[i].email}`);
                        } else {
                            console.error(
                                `❌ Email failed: ${emailPayloads[i].email}`,
                                r.reason
                            );
                        }
                    });
                });
            });

            return res.status(200).json(
                generateResponse(
                    true,
                    "Task created successfully",
                    201,
                    taskResult.rows[0],
                )
            );



        } catch (error: any) {
            await client.query("ROLLBACK");
            console.error("❌ Error in createTask:", error);

            return res.status(500).json(
                generateResponse(false, "Task creation failed", 500, error.message)
            );
        }
    });
}

export async function getTaskList(req: any, res: any) {
    const {
        pageNumber = 1,
        pageSize = 20,
        priority,
        category,
        assignee,
    } = req.query;

    const page = pageNumber;
    const limit = pageSize;
    const offset = (Number(page) - 1) * Number(limit);

    return withClient(async (client: any) => {
        try {
            const filters: string[] = [];
            const values: any[] = [];
            let idx = 1;

            /* FILTERS */
            if (priority) {
                filters.push(`t.priority = $${idx++}`);
                values.push(priority);
            }

            if (category) {
                filters.push(`c.name = $${idx++}`);
                values.push(category);
            }


            if (assignee) {
                const assignees = Array.isArray(assignee)
                    ? assignee
                    : assignee.split(',').map((s: any) => s.trim());

                filters.push(`
        EXISTS (
            SELECT 1
            FROM supplier_details s
            WHERE s.sup_id = ANY(t.assign_to)
            AND s.supplier_name = ANY($${idx})
        )
    `);

                values.push(assignees);
                idx++;
            }

            const whereClause = filters.length
                ? `WHERE ${filters.join(" AND ")}`
                : "";

            /* MAIN QUERY */
            const query = `
                SELECT
                    t.*,

                    /* CATEGORY */
                    jsonb_build_object(
                        'id', c.id,
                        'code', c.code,
                        'name', c.name
                    ) AS category,

                    /* Product */
                    jsonb_build_object(
                        'id', p.id,
                        'product_code', p.product_code,
                        'product_name', p.product_name
                    ) AS product,

                    /* BOM PCF REQUEST */
                    jsonb_build_object(
                        'id', bpr.id,
                        'code', bpr.code,
                        'request_title', bpr.request_title
                    ) AS bom_pcf_request,

                    /* CREATED BY */
                    jsonb_build_object(
                        'user_id', cu.user_id,
                        'user_name', cu.user_name
                    ) AS created_by_user,

                    /* UPDATED BY */
                    jsonb_build_object(
                        'user_id', uu.user_id,
                        'user_name', uu.user_name
                    ) AS updated_by_user,

                    /* ASSIGNED SUPPLIERS */
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'sup_id', s.sup_id,
                                'code', s.code,
                                'supplier_name', s.supplier_name,
                                'supplier_email', s.supplier_email,
                                'supplier_phone_number', s.supplier_phone_number
                            )
                        )
                        FROM supplier_details s
                        WHERE s.sup_id = ANY(t.assign_to)
                    ) AS assigned_suppliers

                FROM task_managment t

                /* JOINS */
                LEFT JOIN category c
                    ON c.id = t.category_id

                LEFT JOIN product p
                    ON p.id = t.product    

                LEFT JOIN bom_pcf_request bpr
                    ON bpr.id = t.bom_pcf_id

                LEFT JOIN users_table cu
                    ON cu.user_id = t.created_by

                LEFT JOIN users_table uu
                    ON uu.user_id = t.updated_by

                ${whereClause}

                ORDER BY t.created_date DESC
                LIMIT $${idx++}
                OFFSET $${idx};
            `;

            values.push(Number(limit), offset);

            const result = await client.query(query, values);

            /* TOTAL COUNT */
            const countValuesForQuery = values.slice(0, values.length - 2);

            const countQuery = `
    SELECT COUNT(*) AS total
    FROM task_managment t
    LEFT JOIN category c
        ON c.id = t.category_id
    ${whereClause};
`;

            const countResult = await client.query(countQuery, countValuesForQuery);

            const total = Number(countResult.rows[0].total);
            const TotalRecordscountQuery = `
                SELECT COUNT(*) AS total_records
                FROM task_managment t;
            `;

            const TotalcountResult = await client.query(
                TotalRecordscountQuery
            );

            const total_records = Number(TotalcountResult.rows[0].total_records);

            // first checking data collection stage if all submitted then make status as completed
            const autoCompleteQuery = `
UPDATE task_managment t
SET status = 'Completed'
WHERE t.bom_pcf_id IN (
    SELECT p.bom_pcf_id
    FROM pcf_request_data_collection_stage p
    WHERE p.own_emission_id IS NULL
    GROUP BY p.bom_pcf_id
    HAVING BOOL_AND(p.is_submitted = TRUE)
);
`;

            await client.query(autoCompleteQuery);

            const statsQuery = `
    SELECT
        COUNT(*) FILTER (WHERE status = 'To-Do') AS to_do_count,
        COUNT(*) FILTER (WHERE status = 'In Progress') AS inprogress_count,
        COUNT(*) FILTER (WHERE status = 'Completed') AS completed_count
    FROM task_managment;
`;

            const statsResult = await client.query(statsQuery);
            const stats = statsResult.rows[0];

            return res.status(200).json(
                generateResponse(true, "Fetched successfully", 200, {
                    data: result.rows,
                    pagination: {
                        total,
                        page: Number(page),
                        limit: Number(limit),
                        totalPages: Math.ceil(total / Number(limit))
                    },
                    total_records:total_records,
                    stats: stats
                })
            );

        } catch (error: any) {
            console.error("❌ Error in listTasks:", error);
            return res.status(500).json(
                generateResponse(false, "Failed to fetch tasks", 500, error.message)
            );
        }
    });
}

export async function getTaskById(req: any, res: any) {
    const { id } = req.query;

    return withClient(async (client: any) => {
        try {

            /* MAIN QUERY */
            const query = `
                SELECT
                    t.*,

                    /* CATEGORY */
                    jsonb_build_object(
                        'id', c.id,
                        'code', c.code,
                        'name', c.name
                    ) AS category,

                    /* Product */
                    jsonb_build_object(
                        'id', p.id,
                        'product_code', p.product_code,
                        'product_name', p.product_name
                    ) AS product,

                    /* BOM PCF REQUEST */
                    jsonb_build_object(
                        'id', bpr.id,
                        'code', bpr.code,
                        'request_title', bpr.request_title
                    ) AS bom_pcf_request,

                    /* CREATED BY */
                    jsonb_build_object(
                        'user_id', cu.user_id,
                        'user_name', cu.user_name
                    ) AS created_by_user,

                    /* UPDATED BY */
                    jsonb_build_object(
                        'user_id', uu.user_id,
                        'user_name', uu.user_name
                    ) AS updated_by_user,

                    /* ASSIGNED SUPPLIERS */
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'sup_id', s.sup_id,
                                'code', s.code,
                                'supplier_name', s.supplier_name,
                                'supplier_email', s.supplier_email,
                                'supplier_phone_number', s.supplier_phone_number
                            )
                        )
                        FROM supplier_details s
                        WHERE s.sup_id = ANY(t.assign_to)
                    ) AS assigned_suppliers

                FROM task_managment t

                /* JOINS */
                LEFT JOIN category c
                    ON c.id = t.category_id

                LEFT JOIN product p
                    ON p.id = t.product 

                LEFT JOIN bom_pcf_request bpr
                    ON bpr.id = t.bom_pcf_id

                LEFT JOIN users_table cu
                    ON cu.user_id = t.created_by

                LEFT JOIN users_table uu
                    ON uu.user_id = t.updated_by

                WHERE t.id = $1
            `;

            const result = await client.query(query, [id]);

            return res.status(200).json(
                generateResponse(true, "Fetched successfully", 200, result.rows)
            );

        } catch (error: any) {
            console.error("❌ Error in listTasks:", error);
            return res.status(500).json(
                generateResponse(false, "Failed to fetch tasks", 500, error.message)
            );
        }
    });
}

export async function deleteTask(req: any, res: any) {
    const { task_id } = req.body; // task_managment.id

    if (!task_id) {
        return res.status(400).json(
            generateResponse(false, "task_id is required", 400, null)
        );
    }

    return withClient(async (client: any) => {
        try {
            await client.query("BEGIN");

            /* 1️⃣ FETCH bom_pcf_id FROM TASK */
            const fetchTaskQuery = `
                SELECT bom_pcf_id
                FROM task_managment
                WHERE id = $1;
            `;

            const taskResult = await client.query(fetchTaskQuery, [task_id]);

            if (!taskResult.rows.length) {
                await client.query("ROLLBACK");
                return res.status(404).json(
                    generateResponse(false, "Task not found", 404, null)
                );
            }

            const { bom_pcf_id } = taskResult.rows[0];

            /* 2️⃣ DELETE PCF REQUEST DATA COLLECTION STAGE */
            const deletePCFQuery = `
                DELETE FROM pcf_request_data_collection_stage
                WHERE bom_pcf_id = $1;
            `;

            await client.query(deletePCFQuery, [bom_pcf_id]);

            /* 3️⃣ DELETE TASK */
            const deleteTaskQuery = `
                DELETE FROM task_managment
                WHERE id = $1;
            `;

            await client.query(deleteTaskQuery, [task_id]);

            await client.query("COMMIT");

            return res.status(200).json(
                generateResponse(
                    true,
                    "Task and related PCF data deleted successfully",
                    200,
                    { task_id, bom_pcf_id }
                )
            );

        } catch (error: any) {
            await client.query("ROLLBACK");
            console.error("❌ Error in deleteTask:", error);

            return res.status(500).json(
                generateResponse(false, "Failed to delete task", 500, error.message)
            );
        }
    });
}

export async function getSupplierDropDown(_req: any, res: any) {
    return withClient(async (client: any) => {
        try {


            const listQuery = `
            SELECT i.sup_id ,
             i.code ,
              i.supplier_name,
              i.supplier_email 
            FROM supplier_details i
            WHERE i.supplier_name IS NOT NULL
        `;


            const listResult = await client.query(listQuery);

            return res.send(generateResponse(true, "List fetched successfully", 200, listResult.rows));
        } catch (error: any) {
            return res.send(generateResponse(false, error.message, 400, null));
        }
    })
}


export async function sampleEmailTest(req: any, res: any) {
    try {
        const { to, subject } = req.body;

        if (!to || !subject) {
            return res.status(400).json({
                success: false,
                message: "to, subject and html are required"
            });
        }

        const bom_pcf_id = '123nbb';
        const supplier_id = '65lko';

        const link = `${process.env.FRONTEND_URL || "https://enviraan.com"}/supplier-questionnaire?bom_pcf_id=${bom_pcf_id}&sup_id=${supplier_id}`;

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
        
        <p>You have been requested to complete a supplier questionnaire for Enviguide.</p>
        
        <p style="margin: 20px 0;">
            <a href="${link}" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
                Complete Supplier Questionnaire
            </a>
        </p>
        
        <p>Or copy and paste this link into your browser:<br>
           <a href="${link}">${link}</a>
        </p>
        
        <p>If you have any questions, please contact our support team.</p>
        
        <p>Best regards,<br>
           <strong>Team Enviguide</strong><br>
      </p>
    </div>
    
    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        <p>This is an automated message from Enviguide. Please do not reply to this email.</p>
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
            message: "Email sent successfully"
        });

    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to send email"
        });
    }
}

// Resend the supplier-questionnaire email to a single supplier (e.g. when a previous send was missed/bounced)
export async function resendSupplierEmail(req: any, res: any) {
    return withClient(async (client: any) => {
        try {
            const { bom_pcf_id, supplier_id } = req.body || {};

            if (!bom_pcf_id || !supplier_id) {
                return res.status(400).json({
                    success: false,
                    message: "bom_pcf_id and supplier_id are required"
                });
            }

            // Look up supplier email + bom_id (a supplier may appear in multiple BOM rows; one is enough for the link)
            const lookupResult = await client.query(
                `
                SELECT s.supplier_email,
                       s.supplier_name,
                       b.id AS bom_id
                FROM bom b
                JOIN supplier_details s ON s.sup_id = b.supplier_id
                WHERE b.bom_pcf_id = $1
                  AND b.supplier_id = $2
                LIMIT 1
                `,
                [bom_pcf_id, supplier_id]
            );

            if (!lookupResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Supplier not found for this BOM/PCF"
                });
            }

            const row = lookupResult.rows[0];
            const email = row.supplier_email;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: "Supplier has no email on file"
                });
            }

            await sendSupplierTaskEmail({
                email,
                bom_pcf_id,
                bom_id: row.bom_id,
                supplier_id,
            });

            console.log(`Resent supplier questionnaire email to ${email}`);

            return res.status(200).json({
                success: true,
                message: `Email resent to ${row.supplier_name || email}`,
                data: { email }
            });

        } catch (error: any) {
            console.error("Resend supplier email error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to resend email"
            });
        }
    });
}