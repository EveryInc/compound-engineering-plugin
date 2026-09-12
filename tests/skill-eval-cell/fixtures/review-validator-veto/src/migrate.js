async function up(knex) {
  await knex("orders").update({ note: knex.ref("legacy_note") });
  await knex.schema.alterTable("orders", (t) => {
    t.dropColumn("legacy_note");
  });
}
module.exports = { up };
