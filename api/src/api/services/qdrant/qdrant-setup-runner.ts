import { setupQdrantCollection } from "./qdrant-setup-service";

setupQdrantCollection()
  .then(() => {
    console.log("Setup Qdrant selesai!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error setup Qdrant:", error);
    process.exit(1);
  });