import { db } from "../modules/database";
import { runAllSeeds } from "../seeder";

async function seed() {
  try {
    await runAllSeeds();
    console.log("Seed selesai!");
  } catch (err) {
    console.error("Error:", err);
    throw err;
  } finally {
    await db.destroy();
  }
}

seed().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

