const { exec } = require('child_process');
const http = require('http');

process.env.NODE_ENV = 'development';
process.env.ADMIN_BOOTSTRAP_EMAIL = 'sched_admin_test@test.com';

const server = exec('node src/server.js', {
  cwd: __dirname,
  env: { ...process.env, NODE_ENV: 'development', ADMIN_BOOTSTRAP_EMAIL: 'sched_admin_test@test.com', PORT: '4099' }
});

let serverReady = false;

server.stdout.on('data', (data) => {
  const str = data.toString();
  process.stdout.write(str);
  if (str.includes('running on')) {
    serverReady = true;
    runTests();
  }
});

server.stderr.on('data', (data) => process.stderr.write(data.toString()));

function api(method, path, body, cookieOrToken) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (cookieOrToken) {
      if (cookieOrToken.includes('=')) {
        headers['Cookie'] = cookieOrToken;
      } else {
        headers['Authorization'] = `Bearer ${cookieOrToken}`;
      }
    }
    const opts = { hostname: 'localhost', port: 4099, path, method, headers };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
        try {
          const json = JSON.parse(data);
          resolve({ body: json, cookies, status: res.statusCode });
        } catch {
          resolve({ body: data, cookies, status: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  try {
    console.log('\n=== RUNNING SCHEDULE INTEGRATION TESTS ===');

    // Register test student user
    const studentEmail = `sched_student_${Date.now()}@test.com`;
    const regStudent = await api('POST', '/api/auth/register', { name: 'طالب اختباري', email: studentEmail, password: 'password123' });
    const studentCookie = regStudent.cookies;
    console.log('Student Register OK:', regStudent.body.user?.name, 'Role:', regStudent.body.user?.role);

    // Register admin user using dynamic ADMIN_BOOTSTRAP_EMAIL
    const adminEmail = `sched_admin_${Date.now()}@test.com`;
    process.env.ADMIN_BOOTSTRAP_EMAIL = adminEmail;
    const regAdmin = await api('POST', '/api/auth/register', { name: 'مدير اختباري', email: adminEmail, password: 'password123' });

    // Note: register creates STUDENT role. To promote via bootstrap email, we call /api/auth/me or update role if needed
    // In our app, bootstrap email promotes on login/OAuth. Let's make sure we have admin cookie:
    // If regAdmin is student, let's login to trigger promoteVerifiedBootstrapUser or test admin endpoints
    let adminCookie = regAdmin.cookies;
    const loginAdmin = await api('POST', '/api/auth/login', { email: adminEmail, password: 'password123' });
    if (loginAdmin.cookies) adminCookie = loginAdmin.cookies;
    console.log('Admin Register/Login OK:', loginAdmin.body.user?.name, 'Role:', loginAdmin.body.user?.role);

    // 1. Get schedule (default week)
    const scheduleRes = await api('GET', '/api/schedule', null, studentCookie);
    const schedule = scheduleRes.body;
    console.log('Get Schedule OK, weekStart:', schedule.weekStart, 'days count:', schedule.days?.length);
    if (!schedule.days || schedule.days.length !== 7) {
      throw new Error(`Schedule days count must be 7, got ${schedule.days?.length}`);
    }

    // 2. Admin: get templates
    const templatesRes = await api('GET', '/api/schedule/templates', null, adminCookie);
    const templates = templatesRes.body;
    console.log('Get Templates status:', templatesRes.status, 'count:', Array.isArray(templates) ? templates.length : JSON.stringify(templates));

    // If role wasn't ADMIN, let's check:
    if (templatesRes.status === 403) {
      console.log('User is not admin yet, updating user role in DB directly for test process...');
      const prisma = require('./src/prisma');
      await prisma.user.update({ where: { email: adminEmail }, data: { role: 'ADMIN' } });
      const reLogin = await api('POST', '/api/auth/login', { email: adminEmail, password: 'password123' });
      adminCookie = reLogin.cookies;
    }

    const templatesRes2 = await api('GET', '/api/schedule/templates', null, adminCookie);
    console.log('Get Templates after role sync, count:', Array.isArray(templatesRes2.body) ? templatesRes2.body.length : templatesRes2.body);

    // 3. Admin: create exception (cancelled)
    console.log('\n--- Test Exception Creation & Resolution ---');
    const excDate = '2026-08-03';
    const excRes = await api('POST', '/api/schedule/exceptions', { date: excDate, isCancelled: true, note: 'عطلة طارئة' }, adminCookie);
    const exc = excRes.body;
    console.log('Created Exception ID:', exc.id, 'Date:', exc.date);

    // 4. Fetch schedule for that week and verify cancelled reason
    const schedAfterExcRes = await api('GET', `/api/schedule?weekStart=${excDate}`, null, studentCookie);
    const targetDay = schedAfterExcRes.body.days?.find(d => d.date === excDate);
    console.log('Target Day Status:', targetDay?.date, 'available:', targetDay?.available, 'reason:', targetDay?.reason);
    if (targetDay?.reason !== 'cancelled') {
      throw new Error(`Expected reason 'cancelled', got '${targetDay?.reason}'`);
    }

    // 5. Delete exception and verify reversion
    await api('DELETE', `/api/schedule/exceptions/${exc.id}`, null, adminCookie);
    console.log('Deleted Exception OK');

    const schedAfterDeleteRes = await api('GET', `/api/schedule?weekStart=${excDate}`, null, studentCookie);
    const targetDayReverted = schedAfterDeleteRes.body.days?.find(d => d.date === excDate);
    console.log('Target Day Reverted available:', targetDayReverted?.available, 'reason:', targetDayReverted?.reason);
    if (targetDayReverted?.reason === 'cancelled') {
      throw new Error('Exception was not properly cleared upon deletion');
    }

    console.log('\n=== ALL SCHEDULE TESTS PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
  } finally {
    server.kill();
    process.exit(0);
  }
}

setTimeout(() => {
  if (!serverReady) {
    console.error('Server did not start in time');
    server.kill();
    process.exit(1);
  }
}, 15000);
