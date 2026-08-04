import { withClient } from '../util/database.js';
import { ulid } from 'ulid';

async function ensureLoginMonitoringColumns(client: any) {
    await client.query(`
        ALTER TABLE users_table
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_logged_in BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS session_last_activity_at TIMESTAMPTZ;
    `);
}


export async function finduser(user_email: any) {
    return withClient(async (client: any) => {
        try {

            const query = 'SELECT * FROM users_table WHERE user_email = $1';

            const result = await client.query(query, [user_email]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

// Suppliers live in `supplier_details`, not `users_table`. Supplier-facing
// flows (e.g. the supplier questionnaire) carry a JWT whose email is the
// supplier_email, so the auth middleware needs a way to resolve it here.
export async function findSupplier(supplier_email: any) {
    return withClient(async (client: any) => {
        try {
            const query = 'SELECT * FROM supplier_details WHERE LOWER(supplier_email) = LOWER($1)';
            const result = await client.query(query, [supplier_email]);
            return result;
        } catch (error: any) {
            throw new Error(error)
        }
    })
}


export async function findUserByMultiple(user_email: any) {
    return withClient(async (client: any) => {
        try {

            const query = `
        SELECT * FROM users_table 
        WHERE user_email = $1 
        OR user_name = $1 
        OR user_phone_number = $1
        LIMIT 1
    `;

            const result = await client.query(query, [user_email]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function recordLoginSuccess(user_id: string) {
    return withClient(async (client: any) => {
        await ensureLoginMonitoringColumns(client);
        const query = `
            UPDATE users_table
            SET
                last_login_at = CURRENT_TIMESTAMP,
                login_count = COALESCE(login_count, 0) + 1,
                is_logged_in = true,
                session_last_activity_at = CURRENT_TIMESTAMP,
                update_date = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING user_id;
        `;
        return client.query(query, [user_id]);
    });
}

export async function markUserLoggedOut(user_id: string) {
    return withClient(async (client: any) => {
        await ensureLoginMonitoringColumns(client);
        const query = `
            UPDATE users_table
            SET
                is_logged_in = false,
                session_last_activity_at = CURRENT_TIMESTAMP,
                update_date = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING user_id;
        `;
        return client.query(query, [user_id]);
    });
}

export async function touchUserSessionActivity(user_id: string) {
    return withClient(async (client: any) => {
        await ensureLoginMonitoringColumns(client);
        const query = `
            UPDATE users_table
            SET
                is_logged_in = true,
                session_last_activity_at = CURRENT_TIMESTAMP,
                update_date = CURRENT_TIMESTAMP
            WHERE user_id = $1
            RETURNING user_id;
        `;
        return client.query(query, [user_id]);
    });
}

export async function getActiveLoginMonitoring(query: any) {
    return withClient(async (client: any) => {
        const {
            pageNumber = 1,
            pageSize = 10,
            searchValue = "",
            role = ""
        } = query;

        await ensureLoginMonitoringColumns(client);

        const page = Math.max(Number(pageNumber) || 1, 1);
        const limit = Math.max(Number(pageSize) || 10, 1);
        const offset = (page - 1) * limit;

        const whereParts: string[] = ['is_logged_in = true'];
        const params: any[] = [];
        let i = 1;

        if (searchValue) {
            whereParts.push(`(
                user_name ILIKE $${i}
                OR user_email ILIKE $${i}
                OR user_phone_number ILIKE $${i}
            )`);
            params.push(`%${searchValue}%`);
            i++;
        }

        if (role) {
            whereParts.push(`user_role ILIKE $${i}`);
            params.push(role);
            i++;
        }

        const whereClause = `WHERE ${whereParts.join(' AND ')}`;
        const countQuery = `SELECT COUNT(*)::int AS total FROM users_table ${whereClause}`;
        const listQuery = `
            SELECT
                user_id,
                user_name,
                user_role,
                user_email,
                user_phone_number,
                login_count,
                last_login_at,
                is_logged_in,
                session_last_activity_at
            FROM users_table
            ${whereClause}
            ORDER BY last_login_at DESC NULLS LAST
            OFFSET $${i}
            LIMIT $${i + 1};
        `;

        const countResult = await client.query(countQuery, params);
        const listResult = await client.query(listQuery, [...params, offset, limit]);

        return {
            totalRowsCount: countResult.rows[0]?.total || 0,
            userList: listResult.rows
        };
    });
}


export async function addUser(userData: any) {
    return withClient(async (client: any) => {
        try {

            const columns = Object.keys(userData);
            const values = Object.values(userData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO users_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);

            const user_id = userData.user_id;

            const [mainModules, modules, submodules] = await Promise.all([
                client.query(`SELECT main_module_id AS id, main_module_name AS name FROM main_module_table`),
                client.query(`SELECT module_id AS id, module_name AS name FROM module_table`),
                client.query(`SELECT submodule_id AS id, submodule_name AS name FROM submodule_table`)
            ]);

            // const [mainModules, modules] = await Promise.all([
            //     client.query(`SELECT main_module_id AS id, main_module_name AS name FROM main_module_table`),
            //     client.query(`SELECT module_id AS id, module_name AS name FROM module_table`)
            // ]);

            const permissions: any[] = [];

            const pushPermission = (id: string, name: string) => {
                permissions.push({
                    permission_id: ulid(),
                    user_id,
                    module_id: id,
                    module_name: name,
                    create: false,
                    update: false,
                    delete: false,
                    read: false,
                    print: false,
                    export: false,
                    send: false,
                    all: false
                });
            };

            mainModules.rows.forEach((m: any) => pushPermission(m.id, m.name));
            modules.rows.forEach((m: any) => pushPermission(m.id, m.name));
            submodules.rows.forEach((s: any) => pushPermission(s.id, s.name));


            for (const perm of permissions) {
                await addUserPermission(perm);
            }

            return result

        } catch (error: any) {

            console.log(error)
            throw new Error(error)
        }
    })
}


export async function getPermissionType(user_id: any, module: any) {
    return withClient(async (client: any) => {
        try {

            const query = `SELECT *
         FROM users_permission_table 
         WHERE user_id = $1 AND module_name = $2`;

            const result = await client.query(query, [user_id, module]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function createRole(roleData: any) {
    return withClient(async (client: any) => {
        try {

            const columns = Object.keys(roleData);
            const values = Object.values(roleData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO roles_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);


            return result

        } catch (error: any) {
            console.log(error)
            throw new Error(error)
        }
    })
}

export async function getRole() {
    return withClient(async (client: any) => {
        try {

            const query = 'SELECT * FROM roles_table ';

            const result = await client.query(query);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function createDepartment(departmentData: any) {
    return withClient(async (client: any) => {
        try {

            const columns = Object.keys(departmentData);
            const values = Object.values(departmentData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO department_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);


            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function getDepartment() {
    return withClient(async (client: any) => {
        try {

            const query = 'SELECT * FROM department_table ';

            const result = await client.query(query);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}



export async function getAllUser(query: any) {
    return withClient(async (client: any) => {
        try {
            const { pageNumber, pageSize, sortBy, sortOrder, fromDate, toDate, role, searchColumn, searchValue } = query


            const offset = (pageNumber - 1) * pageSize;
            const limit = pageSize;

            let whereClause = '';
            let orderByClause = '';

            // Add date range filter to the WHERE clause
            if (fromDate && toDate) {
                whereClause += ` AND us.created_date >= '${fromDate}' AND us.created_date < '${toDate}'::date + interval '1 day'`;  // Specify the table alias
            }

            // Add payment status filter to the WHERE clause
            if (role) {
                whereClause += ` AND us.user_role = '${role}'`;  // Specify the table alias
            }

            // Add order status filter to the WHERE clause


            // Add sorting to the ORDER BY clause
            if (sortBy && sortOrder) {

                orderByClause = `ORDER BY us.${sortBy} ${sortOrder}`;  // Sort by other columns in sales_order

            } else {
                // Default sorting by created_date in descending order if no sorting parameters provided
                orderByClause = 'ORDER BY us.created_date DESC';
            }




            // Add search condition for the specified column in both tables
            const searchCondition = searchColumn
                ? `AND (LOWER(${searchColumn}) ILIKE LOWER('%${searchValue}%'))`
                : '';

            const queryCount = `SELECT COUNT(*) FROM users_table us WHERE 1=1 ${whereClause} ${searchCondition};`;
            const findquery: any = `SELECT us.user_id, us.user_name,us.user_role, us.user_department, us.user_phone_number, us.user_email FROM users_table us
      WHERE 1=1 ${whereClause} ${searchCondition} ${orderByClause ? orderByClause : ''} OFFSET $1 LIMIT $2;`;

            console.log(query);
            const totalCount = await client.query(queryCount);
            const getUserList = await client.query(findquery, [offset, limit]);
            const totalRowsCount = totalCount.rows[0].count
            const userList = getUserList.rows

            return { totalRowsCount, userList }

        } catch (error: any) {
            throw new Error(error)
        }
    })
}


export async function getAllUserWithoutPagination(query: any) {
    return withClient(async (client: any) => {
        try {
            const { sortBy, sortOrder, role } = query

            console.log("useeee")

            let whereClause = '';
            let orderByClause = '';

            // Add date range filter to the WHERE clause


            // Add payment status filter to the WHERE clause
            if (role) {
                whereClause += ` WHERE user_role = '${role}'`;  // Specify the table alias
            }

            // Add order status filter to the WHERE clause


            // Add sorting to the ORDER BY clause
            if (sortBy && sortOrder) {

                orderByClause = `ORDER BY ${sortBy} ${sortOrder}`;  // Sort by other columns in sales_order

            } else {
                // Default sorting by created_date in descending order if no sorting parameters provided
                orderByClause = 'ORDER BY created_date DESC';
            }



            //const queryCount = `SELECT COUNT(*) FROM users_table us ${whereClause};`;
            const findquery: any = `SELECT user_id, user_name, user_role, user_department, user_phone_number, user_email FROM users_table 
        ${whereClause}  ${orderByClause ? orderByClause : ''}`;
            console.log(findquery)
            console.log(query);
            // const totalCount = await client.query(queryCount);
            const getUserList = await client.query(findquery);
            //  const totalRowsCount = totalCount.rows[0].count
            const userList = getUserList.rows
            console.log(userList)
            return userList

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function getUserById(user_id: any) {
    return withClient(async (client: any) => {
        try {

            const query = 'SELECT * FROM users_table WHERE user_id = $1';

            const result = await client.query(query, [user_id]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}


export async function updateUser(user_id: any, userData: any) {
    return withClient(async (client: any) => {
        try {

            const columnValuePairs = Object.entries(userData)
                .map(([columnName, _value], index) => `${columnName} = $${index + 1}`)
                .join(', ');
            // Extracting values from the updatedFields object
            const values = Object.values(userData);

            const query = `
    UPDATE users_table
    SET ${columnValuePairs}
    WHERE user_id = $${Object.keys(userData).length + 1}
    RETURNING *;`;
            console.log(values)
            const result = await client.query(query, [...values, user_id]);
            console.log(result.rows, "result.rows")
            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function addModule(moduleData: any) {
    return withClient(async (client: any) => {
        try {
            await client.query('BEGIN');
            const columns = Object.keys(moduleData);
            const values = Object.values(moduleData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO module_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);

            if (result.rows.length > 0) {
                const getAllUserQuery = 'SELECT * FROM users_table'
                const getAllUserQueryResult = await client.query(getAllUserQuery);

                if (getAllUserQueryResult.rows.length > 0) {
                    for (let user of getAllUserQueryResult.rows) {
                        let permissionobj = {
                            permission_id: ulid(),
                            user_id: user.user_id,
                            module_name: result.rows[0].module_name,
                            module_id: result.rows[0].module_id
                        }
                        console.log(permissionobj, "permissionobj")
                        await addUserPermission(permissionobj)

                    }
                }


            }
            await client.query('COMMIT');

            return result

        } catch (error: any) {
            await client.query('ROLLBACK');
            throw new Error(error)
        }
    })
}

// export async function getUserModulePermission(query: any) {
//     return withClient(async (client: any) => {
//         try {
//             console.log(query, "query")
//             let findQuery;
//             if (query.module_name) {
//                 // Using parameterized query to prevent SQL injection
//                 findQuery = {

//                     text: `SELECT 
//         u.permission_id,
//         u.module_name,
//         u.module_id,
//         u.user_id,
//         u.create,
//         u.update,
//         u.delete,
//         u.print,
//         u.export,
//         u.send,
//         u.read,
//         u.all,
//         mmt.main_module_name,
//         mmt.main_module_id 


//     FROM 
//         users_permission_table u
//     JOIN 
//         module_table mt ON u.module_id = mt.module_id
//     JOIN 
//         main_module_table mmt ON mt.main_module_id = mmt.main_module_id
//     WHERE 
//     u.module_name ILIKE $1 AND u.user_id = $2`,

//                     values: [`%${query.module_name}%`, query.user_id],
//                 };
//             } else {
//                 findQuery = {
//                     text: `SELECT 
//         u.permission_id,
//         u.module_name,
//         u.module_id,
//         u.user_id,
//         u.create,
//         u.update,
//         u.delete,
//         u.print,
//         u.export,
//         u.send,
//         u.read,
//         u.all,
//         mmt.main_module_name,
//         mmt.main_module_id 
//     FROM 
//         users_permission_table u
//     JOIN 
//         module_table mt ON u.module_id = mt.module_id
//     JOIN 
//         main_module_table mmt ON mt.main_module_id = mmt.main_module_id
//     WHERE 
//         u.user_id = $1`,
//                     values: [query.user_id],
//                 };
//             }

//             console.log(findQuery, "findQuery");

//             const result = await client.query(findQuery);
//             console.log(result.rows)

//             return result

//         } catch (error: any) {
//             console.log(error)
//             throw new Error(error)
//         }
//     })
// }
export async function getUserModulePermission({ user_id }: any ,client:any) {
    const query = `
    SELECT 
      -- MAIN MODULE
      mmt.main_module_id,
      mmt.main_module_name,
      
      -- MAIN MODULE PERMISSION
      mup.permission_id AS main_permission_id,
      mup.user_id AS main_user_id,
      COALESCE(mup."create", false) AS main_create,
      COALESCE(mup."update", false) AS main_update,
      COALESCE(mup."delete", false) AS main_delete,
      COALESCE(mup."print", false) AS main_print,
      COALESCE(mup."export", false) AS main_export,
      COALESCE(mup."send", false) AS main_send,
      COALESCE(mup."read", false) AS main_read,
      COALESCE(mup."all", false) AS main_all,
      
      -- MODULE
      mt.module_id,
      mt.module_name,
      
      -- MODULE PERMISSION (separate from submodule permission)
      up_module.permission_id AS module_permission_id,
      up_module.user_id AS module_user_id,
      COALESCE(up_module."create", false) AS module_create,
      COALESCE(up_module."update", false) AS module_update,
      COALESCE(up_module."delete", false) AS module_delete,
      COALESCE(up_module."print", false) AS module_print,
      COALESCE(up_module."export", false) AS module_export,
      COALESCE(up_module."send", false) AS module_send,
      COALESCE(up_module."read", false) AS module_read,
      COALESCE(up_module."all", false) AS module_all,
      
      -- SUBMODULE
      sm.submodule_id,
      sm.submodule_name,
      
      -- SUBMODULE PERMISSION
      up_submodule.permission_id AS submodule_permission_id,
      up_submodule.user_id AS submodule_user_id,
      COALESCE(up_submodule."create", false) AS submodule_create,
      COALESCE(up_submodule."update", false) AS submodule_update,
      COALESCE(up_submodule."delete", false) AS submodule_delete,
      COALESCE(up_submodule."print", false) AS submodule_print,
      COALESCE(up_submodule."export", false) AS submodule_export,
      COALESCE(up_submodule."send", false) AS submodule_send,
      COALESCE(up_submodule."read", false) AS submodule_read,
      COALESCE(up_submodule."all", false) AS submodule_all
      
    FROM main_module_table mmt
    
    LEFT JOIN users_permission_table mup 
      ON mup.module_id = mmt.main_module_id 
      AND mup.user_id = $1
    
    LEFT JOIN module_table mt 
      ON mt.main_module_id = mmt.main_module_id
    
    -- MODULE-LEVEL PERMISSIONS (for the module itself)
    LEFT JOIN users_permission_table up_module 
      ON up_module.module_id = mt.module_id 
      AND up_module.user_id = $1
    
    LEFT JOIN submodule_table sm 
      ON sm.module_id = mt.module_id
    
    -- SUBMODULE-LEVEL PERMISSIONS (for submodules)
    LEFT JOIN users_permission_table up_submodule 
      ON up_submodule.module_id = sm.submodule_id 
      AND up_submodule.user_id = $1
    
    ORDER BY mmt.main_module_name, mt.module_name, sm.submodule_name;
  `;

    return client.query(query, [user_id]);
}

// export async function addUserPermission(permissionData: any) {
//     return withClient(async (client: any) => {
//         try {

//             const columns = Object.keys(permissionData);
//             const values = Object.values(permissionData);

//             // Function to handle reserved keywords by enclosing them in double quotes
//             const handleReservedKeywords = (column: any) => (column === 'create' || column === 'update' || column === 'delete' || column === 'read' ? `"${column}"` : column);

//             // Modify columns to handle reserved keywords
//             const columnsWithQuotes = columns.map(handleReservedKeywords);

//             // Construct the parameterized query
//             const insertQuery = ` INSERT INTO users_permission_table (${columnsWithQuotes.join(', ')})
//         VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})
//         RETURNING *;`;
//             console.log(insertQuery);

//             // Execute the query with parameterized values
//             const result = await client.query(insertQuery, values);

//             return result

//         } catch (error: any) {
//             console.log(error)
//             throw new Error(error)
//         }
//     })
// }
export async function addUserPermission(permissionData: any) {
    return withClient(async (client: any) => {
        try {
            const columns = Object.keys(permissionData);
            const values = Object.values(permissionData);

            // ✅ Reserved SQL keywords
            const reserved = new Set([
                "create",
                "update",
                "delete",
                "read",
                "print",
                "export",
                "send",
                "all"
            ]);

            const handleReserved = (column: string) =>
                reserved.has(column) ? `"${column}"` : column;

            // ✅ Apply quoting
            const columnsWithQuotes = columns.map(handleReserved);

            const insertQuery = `
            INSERT INTO users_permission_table (${columnsWithQuotes.join(", ")})
            VALUES (${values.map((_, i) => `$${i + 1}`).join(", ")})
            RETURNING *;
        `;

            const result = await client.query(insertQuery, values);
            return result;

        } catch (error: any) {
            console.error(error);
            throw new Error(error.message);
        }
    })
}

export async function updatePermission(PersonalData: any) {
    return withClient(async (client: any) => {
        try {

            const { permission_id } = PersonalData

            console.log(PersonalData, "eeeee")

            const handleReservedKeywords = (columnName: string) => (columnName === 'create' || columnName === 'update' || columnName === 'read' || columnName === 'delete' || columnName === 'all' ? `"${columnName}"` : columnName);

            // Creating SET columnValuePairs with proper handling of reserved keywords
            const columnValuePairs = Object.entries(PersonalData)
                .map(([columnName, _value], index) => `${handleReservedKeywords(columnName)} = $${index + 1}`)
                .join(', ');

            // Extracting values from the PersonalData object
            const values = Object.values(PersonalData);

            // Constructing the SQL query
            const query = `
            UPDATE users_permission_table
            SET ${columnValuePairs}
            WHERE permission_id = $${values.length + 1} 
            RETURNING *;`;


            // console.log(values)

            const result = await client.query(query, [...values, permission_id]);
            console.log(result.rows, "eeeee")

            return result

        } catch (error: any) {
            console.log(error, PersonalData, "eeeeeeeeeerrrrrrrrrrrrr")
            throw new Error(error)
        }
    })
}

export async function getPermission(user_id: any) {

    return withClient(async (client: any) => {
        try {

            const query = `SELECT  * FROM  users_permission_table  WHERE  user_id = $1`;

            const result = await client.query(query, [user_id]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function getModule() {
    return withClient(async (client: any) => {
        try {
            const query = `SELECT * FROM module_table`
            const result = await client.query(query)

            return result
        } catch (error: any) {
            throw new Error(error)
        }
    })
}


export async function addMainModule(moduleData: any) {
    return withClient(async (client: any) => {
        try {

            const columns = Object.keys(moduleData);
            const values = Object.values(moduleData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO main_module_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);


            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

export async function addSubModule(moduleData: any) {
    return withClient(async (client: any) => {
        try {
            await client.query('BEGIN');

            const columns = Object.keys(moduleData);
            const values = Object.values(moduleData);

            // Construct parameterized query
            const insertQuery = `
            INSERT INTO submodule_table (${columns.join(', ')})
            VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
            RETURNING *;
        `;

            const result = await client.query(insertQuery, values);

            if (result.rows.length > 0) {
                // Assign default permissions to all users
                const getAllUsersQuery = 'SELECT * FROM users_table';
                const allUsers = await client.query(getAllUsersQuery);

                for (let user of allUsers.rows) {
                    const permissionObj = {
                        permission_id: ulid(),
                        user_id: user.user_id,
                        module_name: result.rows[0].submodule_name,
                        module_id: result.rows[0].submodule_id
                    };
                    await addUserPermission(permissionObj);
                }
            }

            await client.query('COMMIT');
            return result;

        } catch (error: any) {
            await client.query('ROLLBACK');  // Reset transaction
            console.error('Transaction failed:', error);
            throw error;
        }
    })
}

export async function addUpdateUpdateModule(subModuleData: any) {
    return withClient(async (client: any) => {
        try {
            const { module_id } = subModuleData
            const columnValuePairs = Object.entries(subModuleData)
                .map(([columnName, _value], index) => `${columnName} = $${index + 1}`)
                .join(', ');
            // Extracting values from the updatedFields object
            const values = Object.values(subModuleData);

            const query = `
    UPDATE module_table
    SET ${columnValuePairs}
    WHERE module_id = $${Object.keys(subModuleData).length + 1}
    RETURNING *;`;
            console.log(values)
            const result = await client.query(query, [...values, module_id]);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}



export async function userSync(data: any) {
    return withClient(async (_client: any) => {
        try {
            for (const user of data) {
                const { permissions } = user
                const userObj = {
                    user_id: user.user_id,
                    user_name: user.user_name,
                    user_role_id: user.user_role_id,
                    user_role: user.user_role,
                    user_email: user.user_email,
                    user_password: user.user_password,
                    user_store_id: user.user_store_id,
                    user_phone_number: user.user_phone_number,
                    user_department: user.user_department,
                    change_password_next_login: user.change_password_next_login,
                    password_never_expires: user.password_never_expires,
                    password_expiry_date: user.password_expiry_date,
                    pos_id: user.pos_id
                }
                // console.log(permissions,"e34r56")
                if (Array.isArray(user.permissions)) {
                    const extractedBatchData: any = []
                    // Push each itemBatchData object into the extractedBatchData array
                    user.permissions.forEach((permission: any) => {
                        extractedBatchData.push(permission);
                    });
                }
                await updateOrInsertuserSync(userObj)
                await updateOrInsertPersmissionSync(permissions)
            }

        } catch (error: any) {
            throw new Error(error)
        }
    })
}

async function updateOrInsertuserSync(userInfo: any) {
    return withClient(async (client: any) => {
        try {
            const columns = Object.keys(userInfo);
            // Create placeholders for the values dynamically (e.g., $1, $2, ...)
            const valuePlaceholders = columns.map((_, idx) => `$${idx + 1}`);

            // Generate the "SET" part of the update statement dynamically
            const updateSetClause = columns
                .filter(column => column !== 'user_id')  // Exclude the primary key from the update
                .map(column => `${column} = EXCLUDED.${column}`)
                .join(', ');

            const query = `
          INSERT INTO users_table (${columns.join(', ')})
          VALUES (${valuePlaceholders.join(', ')})
          ON CONFLICT (user_id)
          DO UPDATE SET
          ${updateSetClause}
          RETURNING *;
      `;

            // Get the values from the object in the same order as the columns
            const values = columns.map(column => userInfo[column]);


            await client.query(query, values);
        } catch (error) {
            console.log(error)
        }
    })
}


export async function updateOrInsertPersmissionSync(persmission: any) {
    return withClient(async (client: any) => {
        try {
            for (let item of persmission) {
                // Get the keys of the object dynamically
                const columns = Object.keys(item);
                // Create placeholders for the values dynamically (e.g., $1, $2, ...)

                const handleReservedKeywords = (column: any) => (column === 'create' || column === 'update' || column === 'delete' || column === 'read' || column === 'all' ? `"${column}"` : column);
                const columnsWithQuotes = columns.map(handleReservedKeywords);
                const valuePlaceholders = columns.map((_, idx) => `$${idx + 1}`);
                // Generate the "SET" part of the update statement dynamically
                const updateSetClause = columnsWithQuotes
                    .filter(columnsWithQuotes => columnsWithQuotes !== 'permission_id')  // Exclude the primary key from the update
                    .map(columnsWithQuotes => `${columnsWithQuotes} = EXCLUDED.${columnsWithQuotes}`)
                    .join(', ');
                // console.log(updateSetClause)
                const query = `
            INSERT INTO users_permission_table (${columnsWithQuotes.join(', ')})
            VALUES (${valuePlaceholders.join(', ')})
            ON CONFLICT (permission_id)
            DO UPDATE SET
            ${updateSetClause}
            RETURNING *;
        `;
                // console.log(query,"wer34er")
                // Get the values from the object in the same order as the columns
                const values = columns.map(column => item[column]);


                await client.query(query, values);
                //  console.log(result.rows[0]);
            }


        }
        catch (error: any) {
            console.error('Error in upsert:', error);
            throw error;
        }
    })
}


export async function createDocumentType(roleData: any) {
    return withClient(async (client: any) => {
        try {
            roleData.document_id = ulid();
            const columns = Object.keys(roleData);
            const values = Object.values(roleData);

            // Construct the parameterized query
            const insertQuery = `INSERT INTO document_type_table (${columns.join(', ')}) VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *;`;
            console.log(insertQuery);

            // Execute the query with parameterized values
            const result = await client.query(insertQuery, values);


            return result

        } catch (error: any) {
            console.log(error)
            throw new Error(error)
        }
    })
}


export async function getDocumentDropDown() {
    return withClient(async (client: any) => {
        try {

            const query = 'SELECT * FROM document_type_table ';

            const result = await client.query(query);

            return result

        } catch (error: any) {
            throw new Error(error)
        }
    })
}