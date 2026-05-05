import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260505114600 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table if not exists "product_custom_field" ("id" text not null, "product_id" text not null, "stone_type" text[] null, "finish_plating" text[] null, "ring_style" text[] null, "earring_style" text[] null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_custom_field_pkey" primary key ("id"));'
    )
    this.addSql(
      'create unique index if not exists "IDX_product_custom_field_product_id_unique" on "product_custom_field" ("product_id") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_product_id" on "product_custom_field" ("product_id") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_stone_type" on "product_custom_field" using gin ("stone_type") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_finish_plating" on "product_custom_field" using gin ("finish_plating") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_ring_style" on "product_custom_field" using gin ("ring_style") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_earring_style" on "product_custom_field" using gin ("earring_style") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_deleted_at" on "product_custom_field" ("deleted_at");'
    )
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "product_custom_field" cascade;')
  }
}
