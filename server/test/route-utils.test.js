const test = require("node:test");
const assert = require("node:assert/strict");

const routeUtils = require("../routes/route")._test;
const bundleUtils = require("../routes/bundles")._test;

test("route fallback orders stops by straight-line distance", () => {
  const result = routeUtils.buildFallbackRoute(25.4322, 81.7707, [
    { name: "Far", lat: 25.4558, lng: 81.8364 },
    { name: "Near", lat: 25.4323, lng: 81.7708 },
  ]);

  assert.equal(result.osrm_used, false);
  assert.equal(result.geometry, null);
  assert.equal(result.ordered_stops[0].name, "Near");
  assert.ok(result.total_distance_m > 0);
});

test("coordinate validation rejects impossible values", () => {
  assert.equal(routeUtils.parseCoordinate("25.4", -90, 90), 25.4);
  assert.equal(routeUtils.parseCoordinate("91", -90, 90), null);
  assert.equal(routeUtils.parseCoordinate("not-a-number", -180, 180), null);
});

test("overpass parser deduplicates and sorts stores", () => {
  const parsed = bundleUtils.parseOverpassStores({
    elements: [
      { id: 1, lat: 25.50, lon: 81.90, tags: { name: "Far Shop", shop: "supermarket" } },
      { id: 2, lat: 25.4323, lon: 81.7708, tags: { name: "Near Shop", shop: "supermarket" } },
      { id: 3, lat: 25.43231, lon: 81.77081, tags: { name: "Near Shop", shop: "supermarket" } },
    ],
  }, "grocery", 25.4322, 81.7707);

  assert.equal(parsed[0].name, "Near Shop");
  assert.equal(parsed.length, 2);
});


test("store ranking boosts completion-history preferences", () => {
  const ranked = bundleUtils.rankStores([
    { name: "Nearby Shop", distance_m: 100 },
    { name: "D-Mart Civil Lines", distance_m: 500 },
  ], [
    { store_name: "D-Mart", visit_count: 4, avg_rating: 5 },
  ]);

  assert.equal(ranked[0].name, "D-Mart Civil Lines");
  assert.ok(ranked[0].preference_score > 0);
});

test("bundle reasons expose distance, bundling, urgency, and preference", () => {
  const reasons = bundleUtils.buildBundleReasons({
    category: "grocery",
    best_store: { name: "D-Mart", distance_m: 180, preference_score: 0.5 },
    task_count: 3,
    avg_urgency: 0.82,
  });

  assert.ok(reasons.some(reason => reason.includes("180m")));
  assert.ok(reasons.some(reason => reason.toLowerCase().includes("3 grocery tasks")));
  assert.ok(reasons.some(reason => reason.toLowerCase().includes("urgency")));
  assert.ok(reasons.some(reason => reason.includes("completion history")));
});

test("end-to-end ranking math: Store X (3 visits) ranks higher than Store Y (1 visit) despite being further away", () => {
  const stores = [
    { name: "Store Y", distance_m: 100 },
    { name: "Store X", distance_m: 500 },
  ];
  const preferenceRows = [
    { store_name: "Store X", visit_count: 3, avg_rating: 5 },
    { store_name: "Store Y", visit_count: 1, avg_rating: 5 },
  ];
  const ranked = bundleUtils.rankStores(stores, preferenceRows);

  assert.equal(ranked[0].name, "Store X");
  assert.ok(ranked[0].preference_score > ranked[1].preference_score);
});

test("radius filtering: correctly evaluates target distance within task-specific radius boundary", () => {
  // Calculate distance between test points (~535 meters)
  const distance = routeUtils.haversine(25.4322, 81.7707, 25.4350, 81.7750);
  
  const taskA = { radius_meters: 500 };
  const taskB = { radius_meters: 1000 };

  const isMatchedA = distance <= taskA.radius_meters;
  const isMatchedB = distance <= taskB.radius_meters;

  assert.equal(isMatchedA, false);
  assert.equal(isMatchedB, true);
});

test("OSRM fallback returns sorted stops by straight-line distance if OSRM fails", () => {
  const fallback = routeUtils.buildFallbackRoute(25.4322, 81.7707, [
    { name: "Store B", lat: 25.45, lng: 81.85 }, // Far
    { name: "Store A", lat: 25.433, lng: 81.771 }, // Near
  ]);

  assert.equal(fallback.ordered_stops[0].name, "Store A");
  assert.equal(fallback.osrm_used, false);
});

test("bundles optimizeRoute returns valid ordered route when OSRM fails (mocked failure)", async () => {
  const originalFetch = globalThis.fetch;
  // Mock OSRM returning HTTP 500
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ code: "Error" }),
  });

  try {
    const stops = [
      { name: "Far Store", lat: 25.4558, lng: 81.8364, distance_m: 7500 },
      { name: "Near Store", lat: 25.4323, lng: 81.7708, distance_m: 15 },
    ];
    const route = await bundleUtils.optimizeRoute(25.4322, 81.7707, stops);

    assert.ok(route, "Expected a valid route object to be returned");
    assert.equal(route.osrm_used, false);
    assert.equal(route.geometry, null);
    assert.equal(route.ordered_stops[0].name, "Near Store");
    assert.ok(route.total_distance_m > 0);

    // Verify explainability surfaces router offline note
    const bundleReasons = bundleUtils.buildBundleReasons(
      { best_store: { name: "Near Store", distance_m: 15 } },
      route
    );
    assert.ok(
      bundleReasons.some(r => r.includes("Router offline") || r.includes("straight-line")),
      "Expected router fallback explanation"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proximity query matches expected places on known seeded fixture", async (t) => {
  const { Pool } = require("pg");
  const testDbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5434/geomind";
  const pool = new Pool({ connectionString: testDbUrl, connectionTimeoutMillis: 1500 });

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    t.skip(`Skipping proximity DB test: local database not reachable (${err.message})`);
    await pool.end();
    return;
  }

  try {
    // Proximity query from server/index.js:248-265
    // Test location: Kanpur Road (25.4322, 81.7707)
    const result = await client.query(
      `SELECT name,
              ROUND(ST_Distance(
                geom,
                ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')')
              )) AS distance_m
       FROM places
       WHERE category = $3
         AND (user_id = $5 OR user_id IS NULL)
         AND ST_DWithin(
           geom,
           ST_GeogFromText('POINT(' || $1 || ' ' || $2 || ')'),
           $4
         )
       ORDER BY distance_m ASC
       LIMIT 1`,
      [81.7707, 25.4322, "grocery", 1000, "test_user"]
    );

    assert.ok(result.rows.length > 0, "Expected at least one nearby grocery store");
    assert.ok(
      result.rows[0].name.includes("Kanpur Road") || result.rows[0].name.includes("Synthetic"),
      `Expected Kanpur Road store or synthetic match, got: ${result.rows[0].name}`
    );
    assert.ok(result.rows[0].distance_m <= 1000, "Matched store must be within radius");
  } finally {
    client.release();
    await pool.end();
  }
});

