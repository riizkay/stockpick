import { glob } from "glob";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
const migrationsDir = path.join(rootDir, "src/migrations");

// template migration
const migrationTemplate = `import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // tulis migration up di sini
}

export async function down(db: Kysely<any>): Promise<void> {
  // tulis migration down di sini
}
`;

async function getNextMigrationNumber(): Promise<number> {
  const files = await glob("src/migrations/*.ts");
  let maxNumber = 0;

  for (const file of files) {
    const fileName = path.basename(file, ".ts");
    const match = fileName.match(/^(\d+)_/);
    if (match) {
      const number = parseInt(match[1]!, 10);
      if (number > maxNumber) {
        maxNumber = number;
      }
    }
  }

  return maxNumber + 1;
}

async function createMigration(migrationName: string) {
  // validasi nama migration
  if (!migrationName || migrationName.trim() === "") {
    console.error("Error: Nama migration tidak boleh kosong");
    process.exit(1);
  }

  // normalisasi nama: lowercase, replace space dengan underscore
  const normalizedName = migrationName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (normalizedName === "") {
    console.error("Error: Nama migration tidak valid");
    process.exit(1);
  }

  // dapatkan nomor migration berikutnya
  const nextNumber = await getNextMigrationNumber();
  const paddedNumber = String(nextNumber).padStart(4, "0");
  const fileName = `${paddedNumber}_${normalizedName}.ts`;
  const filePath = path.join(migrationsDir, fileName);

  // cek apakah file sudah ada
  try {
    await fs.access(filePath);
    console.error(`Error: File ${fileName} sudah ada`);
    process.exit(1);
  } catch {
    // file tidak ada, lanjutkan
  }

  // buat file migration
  await fs.writeFile(filePath, migrationTemplate, "utf-8");

  console.log(`✓ Migration berhasil dibuat: ${fileName}`);
  console.log(`  Path: ${filePath}`);
}

// ambil nama migration dari command line argument
const migrationName = process.argv[2];

if (!migrationName) {
  console.error("Usage: bun run make-migration <nama_migration>");
  console.error("Contoh: bun run make-migration create_posts");
  process.exit(1);
}

createMigration(migrationName).catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
