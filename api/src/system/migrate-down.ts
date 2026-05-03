import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../modules/database";
import { Migrator } from "kysely";
import type { Kysely } from "kysely";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

async function loadMigrations() {
  const files = await glob("src/migrations/*.ts");
  const migrations: Record<string, any> = {};

  for (const file of files) {
    const filePath = path.resolve(rootDir, file).replace(/\\/g, "/");
    const fileName = path.basename(file, ".ts");
    const migration = await import(filePath);
    
    // wrap migration dalam transaction agar bisa rollback jika gagal
    migrations[fileName] = {
      up: async (db: Kysely<any>) => {
        await db.transaction().execute(async (trx: Kysely<any>) => {
          await migration.up(trx);
        });
      },
      down: async (db: Kysely<any>) => {
        await db.transaction().execute(async (trx: Kysely<any>) => {
          await migration.down(trx);
        });
      },
    };
  }

  return migrations;
}

async function migrateDown() {
  const migrations = await loadMigrations();
  
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });

  console.log("Rollback 1 migration...");
  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`✓ Migration "${it.migrationName}" berhasil di-rollback`);
    } else if (it.status === "Error") {
      console.error(`✗ Rollback migration "${it.migrationName}" gagal`);
    }
  });

  if (error) {
    console.error("Error saat rollback migration:", error);
    process.exit(1);
  }

  await db.destroy();
  console.log("Rollback selesai!");
}

migrateDown().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
