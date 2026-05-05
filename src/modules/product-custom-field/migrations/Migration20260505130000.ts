import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260505130000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'drop index if exists "IDX_product_custom_field_stone_type";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_finish_plating";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_ring_style";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_earring_style";'
    )
    this.addSql(`
      do $$
      declare
        field_name text;
      begin
        foreach field_name in array array[
          'stone_type',
          'finish_plating',
          'ring_style',
          'earring_style'
        ]
        loop
          if exists (
            select 1
            from information_schema.columns
            where table_name = 'product_custom_field'
              and column_name = field_name
              and udt_name = 'text'
          ) then
            execute format(
              'alter table "product_custom_field" alter column %I type text[] using case when %I is null or btrim(%I) = '''' then null else regexp_split_to_array(btrim(%I), ''\\s*,\\s*'') end',
              field_name,
              field_name,
              field_name,
              field_name
            );
          end if;
        end loop;
      end $$;
    `)
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
  }

  async down(): Promise<void> {
    this.addSql(
      'drop index if exists "IDX_product_custom_field_stone_type";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_finish_plating";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_ring_style";'
    )
    this.addSql(
      'drop index if exists "IDX_product_custom_field_earring_style";'
    )
    this.addSql(
      'alter table "product_custom_field" alter column "stone_type" type text using array_to_string("stone_type", \',\');'
    )
    this.addSql(
      'alter table "product_custom_field" alter column "finish_plating" type text using array_to_string("finish_plating", \',\');'
    )
    this.addSql(
      'alter table "product_custom_field" alter column "ring_style" type text using array_to_string("ring_style", \',\');'
    )
    this.addSql(
      'alter table "product_custom_field" alter column "earring_style" type text using array_to_string("earring_style", \',\');'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_stone_type" on "product_custom_field" ("stone_type") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_finish_plating" on "product_custom_field" ("finish_plating") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_ring_style" on "product_custom_field" ("ring_style") where deleted_at is null;'
    )
    this.addSql(
      'create index if not exists "IDX_product_custom_field_earring_style" on "product_custom_field" ("earring_style") where deleted_at is null;'
    )
  }
}
