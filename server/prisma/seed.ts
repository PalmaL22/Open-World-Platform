import { prisma } from "../src/lib/prisma.js";

async function main() {
  await prisma.server.upsert({
    where: { name: "Testing Server" },
    update: {},
    create: { name: "Testing Server" },
  });

  console.log("Seeded demo server - titled 'Testing Server'");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
  })
  
  // Disconnect from the database
  .finally(() => prisma.$disconnect());
