import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Seshter 79...");

  // Super Admin
  const adminEmail = process.env.ADMIN_EMAIL || "admin@seshter79.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const passwordHash = await hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "Super Admin",
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });
  console.log(`✓ Super Admin: ${admin.email} / ${adminPassword}`);

  // Default genres
  const genres = [
    { name: "Afrobeats", slug: "afrobeats", color: "#f59e0b" },
    { name: "Hip-Hop", slug: "hip-hop", color: "#ef4444" },
    { name: "Gospel", slug: "gospel", color: "#8b5cf6" },
    { name: "Amapiano", slug: "amapiano", color: "#10b981" },
    { name: "R&B", slug: "rnb", color: "#ec4899" },
    { name: "Dancehall", slug: "dancehall", color: "#06b6d4" },
    { name: "Pop", slug: "pop", color: "#3b82f6" },
    { name: "Reggae", slug: "reggae", color: "#22c55e" },
  ];

  for (const g of genres) {
    await prisma.genre.upsert({
      where: { slug: g.slug },
      update: {},
      create: g,
    });
  }
  console.log(`✓ ${genres.length} genres`);

  // Sample settings
  await prisma.setting.upsert({
    where: { key: "platform" },
    update: {},
    create: {
      key: "platform",
      value: {
        name: "Seshter 79",
        domain: "music.myjournalplus.com",
        allowRegistration: true,
        allowDownloads: true,
        maintenanceMode: false,
      },
    },
  });

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
