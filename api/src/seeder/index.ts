import { seedRoles } from "./roles.seed";
import { seedPermissions } from "./permissions.seed";
import { seedItems } from "./items.seed";

export async function runAllSeeds() {
  await seedRoles();
  await seedPermissions();
  await seedItems();
}
