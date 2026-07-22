// clear_quintari_publication.mjs
// -------------------------------------------------------------------
// "Publish to Quintari" is idempotent — once a request has a row in
// quintari_published_pcfs it just says "already published" and SKIPS,
// so re-runs of the calc never reach Quintari (the twin stays stale).
//
// This deletes that one publication record so the next click of
// "Publish to Quintari" creates a FRESH twin from the latest calc.
// (The OLD twin stays in Quintari — delete it there via the trash icon
//  to avoid an orphaned duplicate.)
//
// RUN:  node clear_quintari_publication.mjs <BOM_PCF_REQUEST_ID>
//   e.g. node clear_quintari_publication.mjs 01KXD6TXTR9KX5YC73R63JGN79
//
// READ + single DELETE only.
// -------------------------------------------------------------------
import "dotenv/config";

const bomPcfRequestId = process.argv[2];
if (!bomPcfRequestId) {
    console.error("❌ Usage: node clear_quintari_publication.mjs <BOM_PCF_REQUEST_ID>");
    process.exit(1);
}

const { withClient } = await import("./dist/util/database.js");

await withClient(async (client) => {
    const before = await client.query(
        `SELECT id, digital_twin_id, pcf_submodel_id, pushed_overall_pcf, update_date
           FROM quintari_published_pcfs
          WHERE bom_pcf_request_id = $1`,
        [bomPcfRequestId]
    );

    if (before.rows.length === 0) {
        console.log(`ℹ️  No publication record for ${bomPcfRequestId} — nothing to clear.`);
        console.log(`   The "Publish to Quintari" button will already create a fresh twin.`);
        return;
    }

    console.log("Existing publication record(s):");
    for (const r of before.rows) {
        console.log(`   twin=${r.digital_twin_id}`);
        console.log(`   submodel=${r.pcf_submodel_id}  pushedPcf=${r.pushed_overall_pcf}  at=${r.update_date}`);
    }

    const del = await client.query(
        `DELETE FROM quintari_published_pcfs WHERE bom_pcf_request_id = $1`,
        [bomPcfRequestId]
    );

    console.log(`\n✅ Deleted ${del.rowCount} record(s).`);
    console.log(`\nNext steps:`);
    console.log(`   1. In Quintari, delete the OLD twin above via the trash icon (avoids a duplicate).`);
    console.log(`   2. Back in the app, click "Publish to Quintari" again → it creates a FRESH twin`);
    console.log(`      with the latest calc (aircraft split + real carbon content).`);
});
