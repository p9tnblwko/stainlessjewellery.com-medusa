import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260528120000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table if exists "order" add column if not exists "policies_accepted" jsonb null;'
    )
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table if exists "order" drop column if exists "policies_accepted";'
    )
  }
}
