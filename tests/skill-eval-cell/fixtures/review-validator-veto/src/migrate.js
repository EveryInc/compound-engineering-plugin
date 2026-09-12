async function up(knex) {
  await knex.schema.alterTable("orders", (t) => {
    t.dropColumn("legacy_note");
  });
}
module.exports = { up };
