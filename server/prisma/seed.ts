import { prisma } from "../src/lib/prisma.js";

async function main() {
  await prisma.server.upsert({
    where: { name: "Testing Server" },
    update: { maxCapacity: 10 },
    create: { name: "Testing Server", maxCapacity: 10 },
  });

  console.log("Seeded demo server - titled 'Testing Server'");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
  })
  
  .finally(() => prisma.$disconnect());
