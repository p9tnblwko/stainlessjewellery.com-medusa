import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260511120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "product_custom_field" add column if not exists "plating" text[] null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_plating" on "product_custom_field" using gin ("plating") where deleted_at is null;'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_product_custom_field_plating";')
    this.addSql(
      'alter table "product_custom_field" drop column if exists "plating";'
    )
  }
}
