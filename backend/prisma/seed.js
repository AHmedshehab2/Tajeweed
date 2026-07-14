const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = new PrismaClient();

function randomPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) {
    console.error('Refusing to run seed against production without ALLOW_PROD_SEED=true');
    process.exit(1);
  }

  await prisma.activityEntry.deleteMany();
  await prisma.lessonProgress.deleteMany();
  await prisma.quarterProgress.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.recording.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.khutbah.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.quarter.deleteMany();
  await prisma.hizb.deleteMany();
  await prisma.chapter.deleteMany();
  await prisma.user.deleteMany();

  const studentPassword = process.env.SEED_STUDENT_PASSWORD || randomPassword();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || randomPassword();
  const studentPass = await bcrypt.hash(studentPassword, 10);
  const adminPass = await bcrypt.hash(adminPassword, 10);
  await prisma.user.create({
    data: { name: 'طالب', email: 'student@example.com', passwordHash: studentPass, role: 'STUDENT' },
  });
  await prisma.user.create({
    data: { name: 'المدير', email: 'admin@example.com', passwordHash: adminPass, role: 'ADMIN' },
  });

  console.log('');
  console.log('========================================');
  console.log('  Seed accounts created:');
  console.log('');
  console.log('  Student:  student@example.com');
  console.log('  Password: ' + studentPassword);
  console.log('');
  console.log('  Admin:    admin@example.com');
  console.log('  Password: ' + adminPassword);
  console.log('========================================');
  console.log('');
  console.log('Save these passwords — they will not be shown again.');
  console.log('');

  const chapters = [
    { name: 'باب النون الساكنة والتنوين', description: 'قواعد النون الساكنة والتنوين وتطبيقاتها.', order: 1, lessons: [
      { title: 'أحكام الإظهار', description: 'التعريف بحروف الإظهار وأمثلة عملية من القرآن الكريم.', objectives: ['تمييز حروف الإظهار الستة', 'تطبيق الإظهار عند التلاوة'] },
      { title: 'أحكام الإدغام', description: 'الإدغام بغنة وبغير غنة مع التطبيقات العملية.', objectives: ['التفريق بين نوعي الإدغام', 'معرفة حروف يرملون'] },
      { title: 'أحكام الإقلاب', description: 'قلب النون الساكنة والتنوين ميماً مخفاة عند الباء.', objectives: ['معرفة حرف الإقلاب', 'فهم الإخفاء الشفوي'] },
      { title: 'أحكام الإخفاء', description: 'مراتب الإخفاء وحروفه الخمسة عشر.', objectives: ['حفظ حروف الإخفاء', 'تمييز مراتب الإخفاء'] },
    ]},
    { name: 'باب الميم الساكنة', description: 'أحكام الميم الساكنة.', order: 2, lessons: [
      { title: 'الإخفاء الشفوي', description: 'أحكام الميم الساكنة عند الباء.', objectives: ['معرفة مواضع الإخفاء الشفوي'] },
      { title: 'الإدغام الشفوي', description: 'إدغام الميم الساكنة في مثلها.', objectives: ['تطبيق الإدغام الشفوي'] },
    ]},
    { name: 'المدود', description: 'المدود وأسبابها ومقاديرها.', order: 3, lessons: [
      { title: 'المد الطبيعي', description: 'مقدار المد الأصلي وأسبابه.', objectives: ['معرفة مقدار المد الطبيعي'] },
    ]},
  ];

  for (const c of chapters) {
    await prisma.chapter.create({
      data: {
        name: c.name, description: c.description, order: c.order,
        lessons: { create: c.lessons.map(l => ({ title: l.title, description: l.description, objectives: JSON.stringify(l.objectives) })) },
      },
    });
  }

  // 60 hizbs x 4 quarters, matching the original Array.from({length:60}) generator
  for (let number = 1; number <= 60; number++) {
    await prisma.hizb.create({
      data: {
        number, juz: Math.ceil(number / 2), title: `الحزب ${number}`,
        quarters: { create: ['الأول', 'الثاني', 'الثالث', 'الرابع'].map((name, i) => ({ number: i + 1, name: `الربع ${name}` })) },
      },
    });
  }

  await prisma.khutbah.createMany({
    data: [
      { title: 'الاستقامة طريق النجاة', date: new Date('2026-06-14'), description: 'خطبة حول الثبات على طاعة الله في تقلبات الحياة.', duration: '28:06' },
      { title: 'فضل الذكر في حياة المسلم', date: new Date('2026-06-07'), description: 'تذكير بفضل ذكر الله وأثره على القلب.', duration: '31:22' },
      { title: 'القرآن ربيع القلوب', date: new Date('2026-05-31'), description: 'كيف نجعل القرآن رفيقاً يومياً لنا.', duration: '26:44' },
    ],
  });

  await prisma.announcement.create({
    data: { title: 'لا يوجد درس هذا الأسبوع', body: 'يستأنف الدرس القادم يوم السبت بإذن الله.', priority: 'important', expiresAt: new Date('2026-07-18') },
  });

  console.log('Seed complete.');
}

main().finally(() => prisma.$disconnect());
