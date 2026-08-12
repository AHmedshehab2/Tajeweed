const prisma = require('../prisma');

async function findUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  return prisma.user.findUnique({
    where: { email: normalized },
  });
}

async function findUserById(id) {
  return prisma.user.findUnique({
    where: { id },
  });
}

async function findUserAuthFields(id) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatar: true,
      tokenVersion: true,
    },
  });
}

async function createUser(data) {
  return prisma.user.create({
    data,
  });
}

async function updateUser(id, data) {
  return prisma.user.update({
    where: { id },
    data,
  });
}

async function incrementTokenVersion(id) {
  return prisma.user.update({
    where: { id },
    data: { tokenVersion: { increment: 1 } },
  });
}

async function promoteUserToAdmin(id) {
  return prisma.user.update({
    where: { id },
    data: { role: 'ADMIN', tokenVersion: { increment: 1 } },
  });
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserAuthFields,
  createUser,
  updateUser,
  incrementTokenVersion,
  promoteUserToAdmin,
};
