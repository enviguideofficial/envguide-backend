import jwt from 'jsonwebtoken';
import * as authService from '../services/userService.js'
import { generateResponse } from '../util/genRes.js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

function dbg(msg: string) {
    try { fs.appendFileSync('auth-debug.log', `[${new Date().toISOString()}] ${msg}\n`); } catch (_) { }
}

export async function authenticate(req: any, res: any, next: any) {

    try {
        let token = req.header('authorization');
        dbg(`---- ${req.method} ${req.originalUrl} | token present=${!!token}`);

        // Strip "Bearer " prefix if present
        if (token && token.startsWith('Bearer ')) {
            token = token.substring(7); // Remove "Bearer " prefix
        }

        const TOKEN_SECRET: string = process.env.TOKEN_SECRET ?? 'defaultSecret';

        if (TOKEN_SECRET && token) {
            const user: any = jwt.verify(token, TOKEN_SECRET);
            dbg(`verified payload=${JSON.stringify(user)}`);

            // Supplier magic-link token: the questionnaire email signs an explicit
            // sup_id + type:"supplier". Trust it directly so an account-less
            // supplier authenticates as themselves — BEFORE the email lookup, so a
            // collision with a platform account (same email registered as a
            // client/manufacturer) can't shadow them and reject the save.
            if (user.type === "supplier" && user.sup_id) {
                req.user_id = user.sup_id;
                req.sup_id = user.sup_id;
                req.is_supplier = true;
                dbg(`supplier-token sup_id=${user.sup_id}`);
                return next();
            }

            // Token payload key is inconsistent across the codebase: the
            // post-MFA login signs `{ email }` while reset/MFA flows sign
            // `{ user_email }`. Accept either so a valid token is never
            // rejected just because of the key name.
            const tokenEmail = user.email ?? user.user_email;
            const findUser = await authService.finduser(tokenEmail)
            dbg(`tokenEmail=${tokenEmail} | finduser rows=${findUser.rows.length}`);
            if (findUser.rows.length > 0) {
                req.user_id = findUser.rows[0].user_id
                req.role_id = findUser.rows[0].user_role_id
                await authService.touchUserSessionActivity(req.user_id)
                // req.store_id = findUser.rows[0].user_store_id
                next();
            } else {
                // Not a platform user — could be a supplier (suppliers are stored
                // in supplier_details and authenticate against the supplier
                // questionnaire flow). Resolve the token email there before failing.
                const findSupplier = await authService.findSupplier(tokenEmail)
                dbg(`findSupplier rows=${findSupplier.rows.length}`);
                if (findSupplier.rows.length > 0) {
                    req.user_id = findSupplier.rows[0].sup_id
                    req.sup_id = findSupplier.rows[0].sup_id
                    req.is_supplier = true
                    next();
                } else {
                    return res.status(400).send(generateResponse(false, "authenication failed", 400, null));
                }
            }

        } else {
            return res.status(400).send(generateResponse(false, "authenication failed", 400, null));
        }

    } catch (error: any) {
        console.log(error);
        dbg(`CATCH error=${error?.message}`);
        return res.status(400).send(generateResponse(false, error.message, 400, null));
    }
    // err


}