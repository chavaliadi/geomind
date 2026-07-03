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

