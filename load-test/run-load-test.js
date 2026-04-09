import { Pool } from "undici";
import { randomBytes, createHmac } from "crypto";
import { setTimeout as sleep } from "timers/promises";

const ATTENDEE_API = process.env.ATTENDEE_API || "https://attendee.tapee.app";
const STAFF_API = process.env.STAFF_API || "https://prod.tapee.app";

const PROFILE = process.env.PROFILE || "medium";

const PROFILES = {
  light: {
    label: "Light (100 concurrent)",
    attendeeUsers: 80,
    staffUsers: 20,
    durationSeconds: 60,
    rampUpSeconds: 10,
    requestsPerUserPerSecond: 0.5,
  },
  medium: {
    label: "Medium (500 concurrent)",
    attendeeUsers: 400,
    staffUsers: 100,
    durationSeconds: 120,
    rampUpSeconds: 20,
    requestsPerUserPerSecond: 1,
  },
  heavy: {
    label: "Heavy (2,000 concurrent)",
    attendeeUsers: 1600,
    staffUsers: 400,
    durationSeconds: 180,
    rampUpSeconds: 30,
    requestsPerUserPerSecond: 2,
  },
  spike: {
    label: "Spike (5,000+ concurrent)",
    attendeeUsers: 4000,
    staffUsers: 1000,
    durationSeconds: 120,
    rampUpSeconds: 15,
    requestsPerUserPerSecond: 3,
  },
};

const config = PROFILES[PROFILE];
if (!config) {
  console.error(`Unknown profile: ${PROFILE}. Use: light, medium, heavy, spike`);
  process.exit(1);
}

const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  statusCodes: {},
  latencies: [],
  errors: {},
  scenarioStats: {},
  startTime: 0,
  endTime: 0,
};

function recordResult(scenario, statusCode, latencyMs, error) {
  stats.totalRequests++;
  if (statusCode >= 200 && statusCode < 400) {
    stats.successfulRequests++;
  } else {
    stats.failedRequests++;
  }
  stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
  stats.latencies.push(latencyMs);

  if (!stats.scenarioStats[scenario]) {
    stats.scenarioStats[scenario] = {
      count: 0,
      success: 0,
      failed: 0,
      latencies: [],
    };
  }
  const s = stats.scenarioStats[scenario];
  s.count++;
  s.latencies.push(latencyMs);
  if (statusCode >= 200 && statusCode < 400) {
    s.success++;
  } else {
    s.failed++;
    if (error) {
      const key = `${scenario}:${error}`;
      stats.errors[key] = (stats.errors[key] || 0) + 1;
    }
  }
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function makeRequest(pool, method, path, token, body, simulatedIp) {
  const headers = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  if (simulatedIp) headers["x-forwarded-for"] = simulatedIp;

  const start = performance.now();
  try {
    const { statusCode, body: resBody } = await pool.request({
      method,
      path,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      headersTimeout: 30000,
      bodyTimeout: 30000,
    });
    const latency = performance.now() - start;
    const text = await resBody.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {}
    return { statusCode, latency, data };
  } catch (err) {
    const latency = performance.now() - start;
    return { statusCode: 0, latency, data: null, error: err.message };
  }
}

function generateIp(userId) {
  const a = 10;
  const b = (userId >> 16) & 255;
  const c = (userId >> 8) & 255;
  const d = userId & 255;
  return `${a}.${b}.${c}.${d}`;
}

async function loginAttendee(pool, identifier, password, ip) {
  const res = await makeRequest(pool, "POST", "/api/auth/login", null, {
    identifier,
    password,
  }, ip);
  return res.data?.token || null;
}

async function loginStaff(pool, identifier, password, ip) {
  const res = await makeRequest(pool, "POST", "/api/auth/login", null, {
    identifier,
    password,
  }, ip);
  return res.data?.token || null;
}


const ATTENDEE_SCENARIOS = [
  {
    name: "GET /me/bracelets",
    weight: 30,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/attendee/me/bracelets", token, null, ip);
      recordResult("GET /me/bracelets", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /me/transactions",
    weight: 20,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/attendee/me/transactions?limit=20&offset=0", token, null, ip);
      recordResult("GET /me/transactions", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /events/nearby",
    weight: 15,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/attendee/events/nearby?lat=4.711&lng=-74.0721", token, null, ip);
      recordResult("GET /events/nearby", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /auth/user",
    weight: 15,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/auth/user", token, null, ip);
      recordResult("GET /auth/user", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "POST /bracelets/link (simulated)",
    weight: 10,
    fn: async (pool, token, ip) => {
      const fakeUid = randomBytes(7).toString("hex").toUpperCase();
      const res = await makeRequest(pool, "POST", "/api/attendee/me/bracelets/link", token, { uid: fakeUid, eventId: 999999 }, ip);
      recordResult("POST /bracelets/link", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /payments/status (simulated)",
    weight: 10,
    fn: async (pool, token, ip) => {
      const fakeId = randomBytes(8).toString("hex");
      const res = await makeRequest(pool, "GET", `/api/payments/status/${fakeId}`, token, null, ip);
      recordResult("GET /payments/status", res.statusCode, res.latency, res.error);
    },
  },
];

const STAFF_SCENARIOS = [
  {
    name: "GET /events",
    weight: 25,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/events", token, null, ip);
      recordResult("STAFF GET /events", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /transactions",
    weight: 20,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/transactions?limit=20&offset=0", token, null, ip);
      recordResult("STAFF GET /transactions", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /merchants",
    weight: 15,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/merchants", token, null, ip);
      recordResult("STAFF GET /merchants", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /reports/revenue",
    weight: 10,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/reports/revenue", token, null, ip);
      recordResult("STAFF GET /reports/revenue", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /users",
    weight: 10,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/users", token, null, ip);
      recordResult("STAFF GET /users", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "GET /fraud-alerts",
    weight: 10,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "GET", "/api/fraud-alerts", token, null, ip);
      recordResult("STAFF GET /fraud-alerts", res.statusCode, res.latency, res.error);
    },
  },
  {
    name: "POST /bracelets/sync (simulated)",
    weight: 10,
    fn: async (pool, token, ip) => {
      const res = await makeRequest(pool, "POST", "/api/bracelets/sync", token, { transactions: [] }, ip);
      recordResult("STAFF POST /bracelets/sync", res.statusCode, res.latency, res.error);
    },
  },
];

function pickScenario(scenarios) {
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const s of scenarios) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return scenarios[scenarios.length - 1];
}

async function simulateAttendeeUser(pool, userId, durationMs, rpsPerUser) {
  const identifier = `loadtest_attendee_${userId}`;
  const password = "LoadTest2025!";

  const ip = generateIp(userId);

  const regRes = await makeRequest(pool, "POST", "/api/auth/create-account", null, {
    email: `${identifier}@loadtest.tapee.app`,
    username: identifier,
    password,
    fullName: `Load Test User ${userId}`,
  }, ip);
  recordResult("POST /auth/create-account", regRes.statusCode, regRes.latency, regRes.error);

  const token = await loginAttendee(pool, identifier, password, ip);
  if (!token) {
    recordResult("POST /auth/login", 401, 0, "login_failed");
    return;
  }
  recordResult("POST /auth/login (attendee)", 200, 0);

  const intervalMs = 1000 / rpsPerUser;
  const end = Date.now() + durationMs;

  while (Date.now() < end) {
    const scenario = pickScenario(ATTENDEE_SCENARIOS);
    try {
      await scenario.fn(pool, token, ip);
    } catch (err) {
      recordResult(scenario.name, 0, 0, err.message);
    }
    const jitter = intervalMs * (0.5 + Math.random());
    await sleep(Math.max(50, jitter));
  }
}

async function simulateStaffUser(pool, userId, durationMs, rpsPerUser) {
  const identifier = process.env.STAFF_USER || "admin";
  const password = process.env.STAFF_PASSWORD || "admin";
  const ip = generateIp(10000 + userId);

  const token = await loginStaff(pool, identifier, password, ip);
  if (!token) {
    recordResult("POST /auth/login (staff)", 401, 0, "staff_login_failed");
    return;
  }
  recordResult("POST /auth/login (staff)", 200, 0);

  const intervalMs = 1000 / rpsPerUser;
  const end = Date.now() + durationMs;

  while (Date.now() < end) {
    const scenario = pickScenario(STAFF_SCENARIOS);
    try {
      await scenario.fn(pool, token, ip);
    } catch (err) {
      recordResult(scenario.name, 0, 0, err.message);
    }
    const jitter = intervalMs * (0.5 + Math.random());
    await sleep(Math.max(50, jitter));
  }
}

function printReport() {
  const elapsed = (stats.endTime - stats.startTime) / 1000;
  const rps = stats.totalRequests / elapsed;

  console.log("\n" + "=".repeat(80));
  console.log("  TAPEE LOAD TEST REPORT");
  console.log("=".repeat(80));
  console.log(`  Profile:           ${config.label}`);
  console.log(`  Duration:          ${elapsed.toFixed(1)}s`);
  console.log(`  Total Requests:    ${stats.totalRequests.toLocaleString()}`);
  console.log(`  Successful:        ${stats.successfulRequests.toLocaleString()} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Failed:            ${stats.failedRequests.toLocaleString()} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)}%)`);
  console.log(`  Avg RPS:           ${rps.toFixed(1)} req/s`);

  console.log("\n  Latency (ms):");
  console.log(`    Min:             ${percentile(stats.latencies, 0).toFixed(0)}`);
  console.log(`    Median (p50):    ${percentile(stats.latencies, 50).toFixed(0)}`);
  console.log(`    p90:             ${percentile(stats.latencies, 90).toFixed(0)}`);
  console.log(`    p95:             ${percentile(stats.latencies, 95).toFixed(0)}`);
  console.log(`    p99:             ${percentile(stats.latencies, 99).toFixed(0)}`);
  console.log(`    Max:             ${percentile(stats.latencies, 100).toFixed(0)}`);

  console.log("\n  Status Codes:");
  for (const [code, count] of Object.entries(stats.statusCodes).sort()) {
    console.log(`    ${code}: ${count.toLocaleString()}`);
  }

  console.log("\n  Scenario Breakdown:");
  console.log("  " + "-".repeat(78));
  console.log(
    "  " +
      "Scenario".padEnd(35) +
      "Count".padStart(8) +
      "OK".padStart(8) +
      "Fail".padStart(8) +
      "p50ms".padStart(8) +
      "p95ms".padStart(8) +
      "p99ms".padStart(8)
  );
  console.log("  " + "-".repeat(78));

  for (const [name, s] of Object.entries(stats.scenarioStats).sort()) {
    console.log(
      "  " +
        name.padEnd(35) +
        s.count.toString().padStart(8) +
        s.success.toString().padStart(8) +
        s.failed.toString().padStart(8) +
        percentile(s.latencies, 50).toFixed(0).padStart(8) +
        percentile(s.latencies, 95).toFixed(0).padStart(8) +
        percentile(s.latencies, 99).toFixed(0).padStart(8)
    );
  }

  if (Object.keys(stats.errors).length > 0) {
    console.log("\n  Top Errors:");
    const sorted = Object.entries(stats.errors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [key, count] of sorted) {
      console.log(`    ${count}x  ${key}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("  CAPACITY RECOMMENDATIONS");
  console.log("=".repeat(80));

  const p95 = percentile(stats.latencies, 95);
  const errorRate = (stats.failedRequests / stats.totalRequests) * 100;

  if (p95 < 200 && errorRate < 1) {
    console.log("  Status: EXCELLENT");
    console.log("  The system handles this load comfortably.");
    console.log("  Current server configuration is sufficient.");
  } else if (p95 < 500 && errorRate < 5) {
    console.log("  Status: ACCEPTABLE");
    console.log("  The system is under moderate stress.");
    console.log("  Consider:");
    console.log("    - Scaling Railway to 2 replicas for each API service");
    console.log("    - Upgrading to at least 1 vCPU / 1 GB RAM per instance");
    console.log("    - Adding Redis for session caching");
  } else if (p95 < 2000 && errorRate < 15) {
    console.log("  Status: STRESSED");
    console.log("  The system is struggling under this load.");
    console.log("  Recommendations:");
    console.log("    - Scale to 3-4 replicas per API service");
    console.log("    - Upgrade to 2 vCPU / 2 GB RAM per instance");
    console.log("    - Add Redis for session + query caching");
    console.log("    - Add connection pooling (PgBouncer) for PostgreSQL");
    console.log("    - Consider read replicas for the database");
  } else {
    console.log("  Status: CRITICAL");
    console.log("  The system cannot handle this load.");
    console.log("  Urgent recommendations:");
    console.log("    - Scale to 4+ replicas per API service");
    console.log("    - Upgrade to 4 vCPU / 4 GB RAM per instance");
    console.log("    - MUST add Redis for sessions and hot data");
    console.log("    - MUST add PgBouncer connection pooling");
    console.log("    - MUST add PostgreSQL read replicas");
    console.log("    - Consider CDN for static assets");
    console.log("    - Review and optimize slow queries (check p99 scenarios)");
  }

  const estimatedMaxRPS = (rps * 200) / Math.max(p95, 1);
  const usersPerRPS = 0.5;
  const estimatedMaxUsers = Math.floor(estimatedMaxRPS / usersPerRPS);

  console.log(`\n  Estimated max concurrent users at current config: ~${estimatedMaxUsers.toLocaleString()}`);
  console.log(`  Estimated sustained RPS capacity: ~${estimatedMaxRPS.toFixed(0)} req/s`);

  const targetUsers = 5000;
  const targetRPS = targetUsers * usersPerRPS;
  const currentSingleInstanceRPS = rps;
  const replicasNeeded = Math.ceil(targetRPS / Math.max(currentSingleInstanceRPS * 0.7, 1));

  console.log(`\n  To support ${targetUsers.toLocaleString()} concurrent users (~${targetRPS.toFixed(0)} RPS):`);
  console.log(`    Estimated API replicas needed: ${replicasNeeded} per service`);
  console.log(`    Estimated DB connections needed: ${replicasNeeded * 20}`);

  if (replicasNeeded > 2) {
    console.log(`    PostgreSQL: Consider managed instance with ${replicasNeeded * 20}+ max connections`);
    console.log("    Add PgBouncer in transaction mode for connection multiplexing");
  }

  console.log("\n  Railway Pricing Estimate (approximate):");
  const cpuPerReplica = replicasNeeded > 4 ? 2 : 1;
  const ramPerReplica = replicasNeeded > 4 ? 2 : 1;
  const monthlyCostPerReplica = cpuPerReplica * 20 + ramPerReplica * 10;
  const totalServices = 2;
  const totalMonthlyCost = replicasNeeded * totalServices * monthlyCostPerReplica;
  console.log(`    ${replicasNeeded} replicas x ${totalServices} services x $${monthlyCostPerReplica}/mo = ~$${totalMonthlyCost}/mo`);
  console.log(`    + Database: ~$20-50/mo (depending on size)`);
  console.log(`    + Redis (if needed): ~$10-20/mo`);

  console.log("\n" + "=".repeat(80));

  return {
    profile: PROFILE,
    configLabel: config.label,
    duration: elapsed,
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    rps,
    latency: {
      p50: percentile(stats.latencies, 50),
      p90: percentile(stats.latencies, 90),
      p95: percentile(stats.latencies, 95),
      p99: percentile(stats.latencies, 99),
      max: percentile(stats.latencies, 100),
    },
    statusCodes: stats.statusCodes,
    scenarios: stats.scenarioStats,
    recommendations: {
      estimatedMaxUsers,
      estimatedMaxRPS,
      replicasNeeded,
      estimatedMonthlyCost: totalMonthlyCost,
    },
  };
}

async function main() {
  console.log("=".repeat(80));
  console.log("  TAPEE LOAD TEST");
  console.log("=".repeat(80));
  console.log(`  Profile:          ${config.label}`);
  console.log(`  Attendee Users:   ${config.attendeeUsers}`);
  console.log(`  Staff Users:      ${config.staffUsers}`);
  console.log(`  Duration:         ${config.durationSeconds}s`);
  console.log(`  Ramp-up:          ${config.rampUpSeconds}s`);
  console.log(`  RPS/user:         ${config.requestsPerUserPerSecond}`);
  console.log(`  Attendee API:     ${ATTENDEE_API}`);
  console.log(`  Staff API:        ${STAFF_API}`);
  console.log("=".repeat(80));

  const attendeeUrl = new URL(ATTENDEE_API);
  const staffUrl = new URL(STAFF_API);

  const attendeePool = new Pool(attendeeUrl.origin, {
    connections: Math.min(config.attendeeUsers, 500),
    pipelining: 1,
    keepAliveTimeout: 30000,
    connect: {
      rejectUnauthorized: true,
    },
  });

  const staffPool = new Pool(staffUrl.origin, {
    connections: Math.min(config.staffUsers, 200),
    pipelining: 1,
    keepAliveTimeout: 30000,
    connect: {
      rejectUnauthorized: true,
    },
  });

  console.log("\n  Checking API health...");
  const healthChecks = await Promise.all([
    makeRequest(attendeePool, "GET", "/api/healthz", null),
    makeRequest(staffPool, "GET", "/api/healthz", null),
  ]);

  if (healthChecks[0].statusCode !== 200) {
    console.error(`  Attendee API health check failed: ${healthChecks[0].statusCode}`);
    console.error("  Make sure attendee.tapee.app is running.");
    process.exit(1);
  }
  if (healthChecks[1].statusCode !== 200) {
    console.error(`  Staff API health check failed: ${healthChecks[1].statusCode}`);
    console.error("  Make sure prod.tapee.app is running.");
    process.exit(1);
  }
  console.log("  Both APIs are healthy.\n");

  stats.startTime = Date.now();
  const durationMs = config.durationSeconds * 1000;

  const batchSize = Math.ceil(
    (config.attendeeUsers + config.staffUsers) / (config.rampUpSeconds * 2)
  );

  console.log(`  Ramping up ${config.attendeeUsers + config.staffUsers} virtual users...`);

  const allPromises = [];
  let launched = 0;

  for (let i = 0; i < config.attendeeUsers; i += batchSize) {
    const batch = Math.min(batchSize, config.attendeeUsers - i);
    for (let j = 0; j < batch; j++) {
      const userId = i + j;
      allPromises.push(
        simulateAttendeeUser(
          attendeePool,
          userId,
          durationMs,
          config.requestsPerUserPerSecond
        )
      );
      launched++;
    }
    if (launched % 100 === 0) {
      process.stdout.write(`\r  Launched: ${launched} / ${config.attendeeUsers + config.staffUsers} users`);
    }
    await sleep(500 / (config.rampUpSeconds || 1));
  }

  for (let i = 0; i < config.staffUsers; i += batchSize) {
    const batch = Math.min(batchSize, config.staffUsers - i);
    for (let j = 0; j < batch; j++) {
      const userId = i + j;
      allPromises.push(
        simulateStaffUser(
          staffPool,
          userId,
          durationMs,
          config.requestsPerUserPerSecond
        )
      );
      launched++;
    }
    if (launched % 100 === 0) {
      process.stdout.write(`\r  Launched: ${launched} / ${config.attendeeUsers + config.staffUsers} users`);
    }
    await sleep(500 / (config.rampUpSeconds || 1));
  }

  console.log(`\n  All ${launched} virtual users launched. Running for ${config.durationSeconds}s...\n`);

  const progressInterval = setInterval(() => {
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
    const currentRps = (stats.totalRequests / ((Date.now() - stats.startTime) / 1000)).toFixed(1);
    process.stdout.write(
      `\r  [${elapsed}s] Requests: ${stats.totalRequests.toLocaleString()} | RPS: ${currentRps} | Errors: ${stats.failedRequests}`
    );
  }, 2000);

  await Promise.allSettled(allPromises);

  clearInterval(progressInterval);
  stats.endTime = Date.now();

  console.log("\n");
  const reportData = await printReport();

  import("fs").then((fs) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportFile = `report-${PROFILE}-${timestamp}.json`;
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`\n  Full report saved to: load-test/${reportFile}`);
  });

  await attendeePool.close();
  await staffPool.close();
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
